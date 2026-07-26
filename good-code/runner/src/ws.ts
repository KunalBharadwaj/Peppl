import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import { saveToS3 } from "./aws";
import path from "path";
import { fetchDir, fetchFileContent, resolveWorkspacePath, saveFile, WORKSPACE_ROOT } from "./fs";
import { TerminalManager } from "./pty";
import { registerActivity, unregisterActivity } from "./heartbeat";
import { applyPatch } from "./patch";
import { isValidReplId } from "./validation";
import { logger } from "./logger";
import crypto from "crypto";

const terminalManager = new TerminalManager();
const pendingS3Uploads = new Map<
  string,
  { timer: ReturnType<typeof setTimeout>; latestContent: string }
>();

export function initWs(httpServer: HttpServer) {
    const allowedOrigins = (process.env.CORS_ORIGIN ?? "*")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);

    const io = new Server(httpServer, {
        cors: {
            origin:
              allowedOrigins.length === 0 || allowedOrigins.includes("*")
                ? "*"
                : allowedOrigins,
            methods: ["GET", "POST"],
        },
    });
      
    io.on("connection", async (socket: Socket) => {
        const requiredToken = process.env.RUNNER_AUTH_TOKEN;
        if (requiredToken) {
          const token = (socket.handshake.auth as { token?: string } | undefined)?.token ??
            (socket.handshake.headers["x-runner-token"] as string | undefined);
          if (token !== requiredToken) {
            socket.disconnect(true);
            terminalManager.clear(socket.id);
            return;
          }
        }

        const host = socket.handshake.headers.host;
        // Split the host by '.' and take the first part as replId
        const replId = host?.split('.')[0];

        if (!isValidReplId(replId)) {
            logger.warn("Rejected connection with invalid replId host", { host });
            socket.disconnect();
            terminalManager.clear(socket.id);
            return;
        }
        logger.info("Workspace socket connected", { replId, socketId: socket.id });

        // Count this connection as live activity for the workspace so the
        // orchestrator keeps it alive (and reaps it once the last tab closes).
        registerActivity(replId);

        socket.emit("loaded", {
            rootContent: await fetchDir(WORKSPACE_ROOT, "")
        });

        initHandlers(socket, replId);
    });
}

function initHandlers(socket: Socket, replId: string) {

    socket.on("disconnect", () => {
        logger.info("Workspace socket disconnected", { replId, socketId: socket.id });
        // Release this connection's hold on the workspace's liveness.
        unregisterActivity(replId);
        // Clear any pending S3 uploads for this replId to avoid leaks
        for (const [key, entry] of pendingS3Uploads.entries()) {
          if (key.startsWith(`${replId}:`)) {
            clearTimeout(entry.timer);
            pendingS3Uploads.delete(key);
          }
        }
    });

    socket.on("fetchDir", async (dir: string, callback: (data: any) => void) => {
        try {
            const dirPath = resolveWorkspacePath(dir);
            const contents = await fetchDir(dirPath, dir);
            callback(contents);
        } catch {
            // Path escaped the workspace (or failed to read) — reveal nothing.
            callback([]);
        }
    });

    socket.on("fetchContent", async ({ path: filePath }: { path: string }, callback: (data: string) => void) => {
        try {
            const fullPath = resolveWorkspacePath(filePath);
            const data = await fetchFileContent(fullPath);
            callback(data);
        } catch {
            callback("");
        }
    });

    function sha1(input: string) {
      return crypto.createHash("sha1").update(input).digest("hex");
    }

    // updateContent supports patch-based edits; large payloads are rejected,
    // and S3 writes are throttled to reduce churn.
    const maxFileBytes = Number(process.env.MAX_FILE_BYTES ?? 1_000_000); // 1MB default
    const s3ThrottleMs = Number(process.env.S3_THROTTLE_MS ?? 900);

    const scheduleS3Upload = async (filePath: string, contentToUpload: string) => {
      const key = `${replId}:${filePath}`;
      const existing = pendingS3Uploads.get(key);
      if (existing) {
        existing.latestContent = contentToUpload;
        return;
      }

      const timer = setTimeout(async () => {
        const latest = pendingS3Uploads.get(key);
        if (!latest) return;
        pendingS3Uploads.delete(key);
        await saveToS3(`code/${replId}`, filePath, latest.latestContent);
      }, s3ThrottleMs);

      pendingS3Uploads.set(key, { timer, latestContent: contentToUpload });
    };

    socket.on(
      "updateContent",
      async (
        {
          path: filePath,
          content,
          patch,
        }: {
          path: string;
          content?: string;
          patch?: { start: number; end: number; text: string; expected: string };
        },
        callback?: (res: { ok: boolean; needsFull?: boolean; hash?: string }) => void
      ) => {
        try {
          const fullPath = resolveWorkspacePath(filePath);
          if (typeof content === "string") {
            if (Buffer.byteLength(content, "utf8") > maxFileBytes) {
              callback?.({ ok: false, needsFull: true });
              return;
            }
            await saveFile(fullPath, content);
            await scheduleS3Upload(filePath, content);
            callback?.({ ok: true, hash: sha1(content) });
            return;
          }

          if (patch) {
            if (
              Buffer.byteLength(patch.text ?? "", "utf8") > maxFileBytes ||
              Buffer.byteLength(patch.expected ?? "", "utf8") > maxFileBytes
            ) {
              callback?.({ ok: false, needsFull: true });
              return;
            }
            const current = await fetchFileContent(fullPath);
            const res = applyPatch(current, patch);
            if (!res.ok) {
              callback?.({ ok: false, needsFull: true, hash: sha1(current) });
              return;
            }
            if (Buffer.byteLength(res.next, "utf8") > maxFileBytes) {
              callback?.({ ok: false, needsFull: true, hash: sha1(current) });
              return;
            }
            await saveFile(fullPath, res.next);
            await scheduleS3Upload(filePath, res.next);
            callback?.({ ok: true, hash: sha1(res.next) });
            return;
          }

          callback?.({ ok: false, needsFull: true });
        } catch (e) {
          callback?.({ ok: false, needsFull: true });
        }
      }
    );

    socket.on("requestTerminal", async () => {
        terminalManager.createPty(socket.id, replId, (data, id) => {
            socket.emit('terminal', {
                data: Buffer.from(data,"utf-8")
            });
        });
    });
    
    socket.on("terminalData", async ({ data }: { data: string, terminalId: number }) => {
        terminalManager.write(socket.id, data);
    });

}