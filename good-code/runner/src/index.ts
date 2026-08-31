import dotenv from "dotenv"
dotenv.config()
import express from "express";
import { createServer } from "http";
import { access } from "fs/promises";
import { initWs } from "./ws";
import { WORKSPACE_ROOT } from "./fs";
import { logger } from "./logger";
import cors from "cors";

const app = express();
app.use(cors());

// Liveness: the process is up and the event loop is responsive.
app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Readiness: the seeded workspace volume is mounted and accessible. Until the
// initContainer has populated /workspace, this pod shouldn't take traffic.
app.get("/readyz", async (_req, res) => {
  try {
    await access(WORKSPACE_ROOT);
    res.status(200).json({ status: "ready", workspace: true });
  } catch {
    res.status(503).json({ status: "unready", workspace: false });
  }
});

const httpServer = createServer(app);

initWs(httpServer);

const port = process.env.PORT || 3001;
httpServer.listen(port, () => {
  logger.info("runner listening", { port });
});
