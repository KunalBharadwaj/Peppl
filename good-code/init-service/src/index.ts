import express, { Request, Response, RequestHandler } from "express";
import dotenv from "dotenv"
import cors from "cors";
dotenv.config()
import rateLimit from "express-rate-limit";
import { copyS3Folder } from "./aws";
import { connectMongo, pingMongo } from "./db/mongo";
import {
  claimForRetry,
  countActiveByOwner,
  createRepl,
  ensureReplIndexes,
  failStaleCreating,
  setReplStatus,
  STALE_CREATING_MS,
} from "./repositories/replRepository";
import { ensureUserIndexes, upsertGoogleUser } from "./repositories/userRepository";
import { isValidReplId } from "./validation";
import { logger } from "./logger";
import {
  assertAuthConfig,
  AuthedRequest,
  issueSessionToken,
  requireAuth,
  verifyGoogleIdToken,
} from "./auth/auth";
import { MongoServerError } from "mongodb";

const app = express();
app.use(express.json());
app.use(cors() as unknown as RequestHandler)

// Liveness: the process is up and the event loop is responsive.
app.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// Readiness: only take traffic once our dependencies (Mongo) are reachable.
app.get("/readyz", async (_req: Request, res: Response) => {
  const mongo = await pingMongo();
  res.status(mongo ? 200 : 503).json({ status: mongo ? "ready" : "unready", mongo });
});

// Maximum number of active (creating/ready) workspaces a single user may hold.
const MAX_REPLS_PER_USER = Number(process.env.MAX_REPLS_PER_USER ?? 5);

// Rate limiters: cap how often the login and project-creation endpoints can be
// hit from a single IP, independent of auth, to blunt brute-force / abuse.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const projectLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Exchange a Google ID token for our own session JWT. The frontend obtains the
// `credential` from the Google Identity Services sign-in button.
app.post("/auth/google", authLimiter, async (req: Request, res: Response) => {
  const { credential } = req.body ?? {};
  if (typeof credential !== "string" || !credential) {
    res.status(400).send("Missing credential");
    return;
  }

  try {
    const profile = await verifyGoogleIdToken(credential);
    const user = await upsertGoogleUser(profile);
    const token = issueSessionToken({ userId: user.userId, email: user.email });
    res.json({
      token,
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name,
        picture: user.picture,
      },
    });
  } catch (error) {
    logger.error("Google sign-in failed", { err: error });
    res.status(401).send("Invalid Google credential");
  }
});

app.post(
  "/project",
  projectLimiter,
  requireAuth,
  async (req: AuthedRequest, res: Response) => {
    const ownerId = req.user!.userId;
    const { replId, language } = req.body;
    const normalizedReplId = String(replId ?? "").trim();
    const normalizedLanguage = String(language ?? "").trim();
    const supportedLanguages = new Set(["node-js", "python"]);
    // Per-request logger tagged with the workspace join key so every line for
    // this creation can be traced across services by replId.
    const log = logger.child({ replId: normalizedReplId, ownerId });

    if (!isValidReplId(normalizedReplId)) {
        res
          .status(400)
          .send("Invalid workspace ID (lowercase letters, digits, and hyphens; max 40 chars)");
        return;
    }

    if (!supportedLanguages.has(normalizedLanguage)) {
      res.status(400).send("Unsupported language");
      return;
    }

    // Enforce the per-user workspace cap before doing any work. This is a
    // best-effort pre-check; the unique replId index remains the hard integrity
    // guarantee against races.
    const activeCount = await countActiveByOwner(ownerId);
    if (activeCount >= MAX_REPLS_PER_USER) {
      res
        .status(429)
        .send(`Workspace limit reached (${MAX_REPLS_PER_USER}). Delete one to create another.`);
      return;
    }

    try {
      await createRepl(normalizedReplId, ownerId, normalizedLanguage);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        // A doc with this replId already exists. Allow a retry only if the
        // previous attempt failed or got stuck mid-init AND this user owns it;
        // a ready, actively-creating, or other-user's repl is a genuine conflict.
        const claimed = await claimForRetry(normalizedReplId, ownerId, normalizedLanguage);
        if (!claimed) {
          res.status(409).send("replId already exists");
          return;
        }
        // Claimed for retry — fall through and re-run initialization below.
      } else {
        log.error("Failed to create repl record", { err: error });
        res.status(500).send("Unable to create repl");
        return;
      }
    }

    try {
      await copyS3Folder(`base/${normalizedLanguage}`, `code/${normalizedReplId}`);
      await setReplStatus(normalizedReplId, "ready");
    } catch (error) {
      await setReplStatus(normalizedReplId, "failed");
      log.error("Failed to initialize repl from template", { err: error });
      res.status(500).send("Failed to initialize repl");
      return;
    }

    log.info("Workspace created", { language: normalizedLanguage });
    res.send("Project created");
  }
);

const port = process.env.PORT || 3001;

async function bootstrap() {
  assertAuthConfig();
  await connectMongo();
  await ensureReplIndexes();
  await ensureUserIndexes();

  // Periodically reconcile repls stuck in "creating" (e.g. the process crashed
  // mid-init) to a terminal "failed" state so they don't hang forever.
  const reconcile = setInterval(async () => {
    try {
      const reconciled = await failStaleCreating();
      if (reconciled > 0) {
        logger.info("Reconciled stale repls to failed", { reconciled });
      }
    } catch (error) {
      logger.error("Reconciliation sweep failed", { err: error });
    }
  }, STALE_CREATING_MS);
  reconcile.unref();

  app.listen(port, () => {
      logger.info("init-service listening", { port });
  });
}

bootstrap().catch((error) => {
  logger.error("Failed to start init-service", { err: error });
  process.exit(1);
});
