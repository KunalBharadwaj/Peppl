import express from "express";
import dotenv from "dotenv";
dotenv.config();
import fs from "fs";
import yaml from "yaml";
import path from "path";
import cors from "cors";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { KubeConfig, AppsV1Api, CoreV1Api, NetworkingV1Api } from "@kubernetes/client-node";
import { assertAuthConfig, AuthedRequest, requireAuth } from "./auth";
import { connectMongo, getReplOwner, pingMongo } from "./mongo";
import { WorkspaceRegistry } from "./lifecycle";
import { isValidReplId } from "./validation";
import { logger } from "./logger";

const app = express();
// Behind the ingress, the client IP is in X-Forwarded-For. Trust exactly one
// proxy hop so express-rate-limit keys on the real client IP instead of
// rate-limiting every user as the single ingress IP.
app.set("trust proxy", 1);
app.use(express.json());
app.use(cors());

// Liveness: the process is up and the event loop is responsive.
app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Readiness: take traffic only once Mongo (ownership lookups) is reachable.
app.get("/readyz", async (_req, res) => {
  const mongo = await pingMongo();
  res.status(mongo ? 200 : 503).json({ status: mongo ? "ready" : "unready", mongo });
});

assertAuthConfig();

// Idle TTL: a workspace with no heartbeat for longer than this is reap-eligible.
const IDLE_TTL_MS = Number(process.env.IDLE_TTL_MS ?? 30 * 60 * 1000); // 30 min

// Shared secret for machine-to-machine calls (runner heartbeats, reaper sweep).
// These carry no user JWT. If set, callers must present it as x-internal-token;
// if unset the internal endpoints are open (dev only) and we warn at startup.
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN?.trim();
if (!INTERNAL_TOKEN) {
  logger.warn("INTERNAL_TOKEN is not set — /heartbeat and /reap are unauthenticated (dev mode)");
}

// Per-workspace access token: minted at /start (after the ownership check) and
// presented by the browser in the runner's Socket.IO handshake. Scoped to a
// single replId so it authorizes the data plane (who may CONNECT to a running
// pod), not just the control plane (who may provision it). Must match the
// runner's WORKSPACE_TOKEN_SECRET.
const WORKSPACE_TOKEN_SECRET = process.env.WORKSPACE_TOKEN_SECRET?.trim();
const WORKSPACE_TOKEN_TTL = process.env.WORKSPACE_TOKEN_TTL || "12h";
if (!WORKSPACE_TOKEN_SECRET) {
  logger.warn(
    "WORKSPACE_TOKEN_SECRET is not set — /start won't mint per-workspace tokens (runner data-plane auth disabled)"
  );
}

const registry = new WorkspaceRegistry();

// Cap how often a single IP can trigger pod provisioning.
const startLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const kubeconfig = new KubeConfig();
kubeconfig.loadFromDefault();
const coreV1Api = kubeconfig.makeApiClient(CoreV1Api);
const appsV1Api = kubeconfig.makeApiClient(AppsV1Api);
const networkingV1Api = kubeconfig.makeApiClient(NetworkingV1Api);

const namespace = "default"; // Assuming a default namespace, adjust as needed

// Guard the internal (machine-to-machine) endpoints with the shared token.
function requireInternalToken(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  if (!INTERNAL_TOKEN) {
    next();
    return;
  }
  const provided = req.headers["x-internal-token"];
  if (provided !== INTERNAL_TOKEN) {
    res.status(401).send({ message: "Invalid internal token" });
    return;
  }
  next();
}

// Updated utility function to handle multi-document YAML files
const readAndParseKubeYaml = (filePath: string, replId: string): Array<any> => {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const docs = yaml.parseAllDocuments(fileContent).map((doc) => {
        let docString = doc.toString();
        const regex = new RegExp(`service_name`, 'g');
        docString = docString.replace(regex, replId);
        return yaml.parse(docString);
    });
    return docs;
};

// Delete all K8s objects backing a workspace. Tolerates 404s so it is safe to
// call on a partially-created or already-gone workspace (used by both the
// explicit /stop teardown and the idle reaper).
async function deleteWorkspace(replId: string): Promise<void> {
    const deletions: Array<[string, Promise<unknown>]> = [
        ["Deployment", appsV1Api.deleteNamespacedDeployment(replId, namespace)],
        ["Service", coreV1Api.deleteNamespacedService(replId, namespace)],
        ["Ingress", networkingV1Api.deleteNamespacedIngress(replId, namespace)],
        ["NetworkPolicy", networkingV1Api.deleteNamespacedNetworkPolicy(replId, namespace)],
    ];
    for (const [kind, op] of deletions) {
        try {
            await op;
        } catch (error: any) {
            // A missing object is fine — teardown is idempotent. Anything else
            // is logged but does not stop us from removing the other objects.
            if (error?.statusCode === 404 || error?.response?.statusCode === 404) {
                continue;
            }
            logger.error("Failed to delete workspace object", { replId, kind, err: error?.body ?? error });
        }
    }
}

app.post("/start", startLimiter, requireAuth, async (req: AuthedRequest, res) => {
    const { replId } = req.body;
    const userId = req.user!.userId; // authenticated caller (from the session JWT)

    if (!isValidReplId(replId)) {
        res.status(400).send({ message: "Invalid replId" });
        return;
    }

    // Verify the caller owns this workspace. init-service created it (in Mongo)
    // when the user hit /project; a caller may only start a repl they own. This
    // closes the gap where any authenticated user could /start someone else's
    // replId and provision a pod seeded from their code.
    const log = logger.child({ replId, userId });
    let owner: string | null;
    try {
        owner = await getReplOwner(replId);
    } catch (error) {
        log.error("Ownership lookup failed", { err: error });
        res.status(503).send({ message: "Ownership check unavailable" });
        return;
    }
    if (!owner) {
        res.status(404).send({ message: "Unknown workspace — create it first" });
        return;
    }
    if (owner !== userId) {
        log.warn("Rejected /start for non-owned workspace");
        res.status(403).send({ message: "You do not own this workspace" });
        return;
    }

    try {
        const kubeManifests = readAndParseKubeYaml(path.join(__dirname, "../service.yaml"), replId);
        for (const manifest of kubeManifests) {
            switch (manifest.kind) {
                case "Deployment":
                    await appsV1Api.createNamespacedDeployment(namespace, manifest);
                    break;
                case "Service":
                    await coreV1Api.createNamespacedService(namespace, manifest);
                    break;
                case "Ingress":
                    await networkingV1Api.createNamespacedIngress(namespace, manifest);
                    break;
                case "NetworkPolicy":
                    await networkingV1Api.createNamespacedNetworkPolicy(namespace, manifest);
                    break;
                default:
                    console.log(`Unsupported kind: ${manifest.kind}`);
            }
        }
        // Seed the idle clock so a freshly-provisioned workspace isn't reaped
        // before its runner boots and the user connects.
        registry.touch(replId);
        // Mint a token scoped to THIS workspace for the browser's socket handshake.
        const workspaceToken = WORKSPACE_TOKEN_SECRET
          ? jwt.sign(
              { replId, userId, scope: "workspace" },
              WORKSPACE_TOKEN_SECRET,
              { expiresIn: WORKSPACE_TOKEN_TTL } as jwt.SignOptions
            )
          : undefined;
        log.info("Provisioned workspace");
        res.status(200).send({ message: "Resources created successfully", workspaceToken });
    } catch (error) {
        log.error("Failed to create resources", { err: error });
        res.status(500).send({ message: "Failed to create resources" });
    }
});

// Explicit teardown. Auth + ownership so a user can only stop their own
// workspace; deletes all backing K8s objects and stops tracking it.
app.delete("/stop", requireAuth, async (req: AuthedRequest, res) => {
    const { replId } = req.body ?? {};
    const userId = req.user!.userId;

    if (!isValidReplId(replId)) {
        res.status(400).send({ message: "Invalid replId" });
        return;
    }

    const log = logger.child({ replId, userId });
    let owner: string | null;
    try {
        owner = await getReplOwner(replId);
    } catch (error) {
        log.error("Ownership lookup failed", { err: error });
        res.status(503).send({ message: "Ownership check unavailable" });
        return;
    }
    if (!owner) {
        res.status(404).send({ message: "Unknown workspace" });
        return;
    }
    if (owner !== userId) {
        log.warn("Rejected /stop for non-owned workspace");
        res.status(403).send({ message: "You do not own this workspace" });
        return;
    }

    await deleteWorkspace(replId);
    registry.forget(replId);
    log.info("Stopped workspace");
    res.status(200).send({ message: "Workspace stopped" });
});

// Runner heartbeat: pods report the replIds they're actively serving so the
// reaper knows they're still in use. Internal (machine-to-machine) call.
app.post("/heartbeat", requireInternalToken, (req, res) => {
    const body = req.body ?? {};
    const replIds: unknown = Array.isArray(body.replIds)
        ? body.replIds
        : body.replId != null
        ? [body.replId]
        : [];
    if (!Array.isArray(replIds)) {
        res.status(400).send({ message: "replIds must be an array" });
        return;
    }
    const now = Date.now();
    let accepted = 0;
    for (const id of replIds) {
        if (isValidReplId(id)) {
            registry.touch(id, now);
            accepted += 1;
        }
    }
    res.status(200).send({ accepted });
});

// Reaper sweep: delete every workspace idle past the TTL. Invoked on a schedule
// by the reaper CronJob (internal call). Returns the replIds it tore down.
app.post("/reap", requireInternalToken, async (_req, res) => {
    const stale = registry.staleReplIds(IDLE_TTL_MS);
    for (const replId of stale) {
        await deleteWorkspace(replId);
        registry.forget(replId);
        logger.info("Reaped idle workspace", { replId });
    }
    if (stale.length > 0) {
        logger.info("Reap sweep complete", { reaped: stale.length, tracked: registry.size() });
    }
    res.status(200).send({ reaped: stale, tracked: registry.size() });
});

const port = process.env.PORT || 3002;

async function bootstrap() {
    await connectMongo();
    app.listen(port, () => {
        logger.info("orchestrator listening", { port });
    });
}

bootstrap().catch((error) => {
    logger.error("Failed to start orchestrator", { err: error });
    process.exit(1);
});
