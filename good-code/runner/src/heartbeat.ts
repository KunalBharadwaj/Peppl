// Liveness heartbeat: while a user has at least one live socket open to this
// pod, we periodically tell the orchestrator the workspace is still in use. The
// orchestrator's reaper deletes workspaces that stop heartbeating past an idle
// TTL, so "no open socket" naturally becomes "reap after TTL" — which is exactly
// the disposable-workspace semantics we want.
//
// replIds are ref-counted by live socket so multiple browser tabs keep the
// workspace alive and only the *last* disconnect lets it go idle.

import { logger } from "./logger";

const orchestratorUrl = process.env.ORCHESTRATOR_URL?.trim();
const internalToken = process.env.INTERNAL_TOKEN?.trim();
const heartbeatIntervalMs = Number(process.env.HEARTBEAT_INTERVAL_MS ?? 30_000);

const activeRepls = new Map<string, number>();
let timer: ReturnType<typeof setInterval> | null = null;

async function sendHeartbeat(): Promise<void> {
  const replIds = [...activeRepls.keys()];
  if (replIds.length === 0 || !orchestratorUrl) return;

  try {
    await fetch(`${orchestratorUrl}/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(internalToken ? { "x-internal-token": internalToken } : {}),
      },
      body: JSON.stringify({ replIds }),
    });
  } catch (error) {
    // A missed heartbeat is non-fatal: the next tick retries, and worst case a
    // still-active workspace is reaped a beat late. Log quietly and move on.
    logger.warn("Heartbeat failed", { err: error });
  }
}

function ensureTimer(): void {
  if (timer || !orchestratorUrl) return;
  timer = setInterval(() => {
    void sendHeartbeat();
  }, heartbeatIntervalMs);
  // Don't keep the process alive solely for heartbeats.
  timer.unref?.();
}

// A socket connected for this workspace — start counting it as active.
export function registerActivity(replId: string): void {
  if (!orchestratorUrl) return; // heartbeats disabled (no orchestrator configured)
  activeRepls.set(replId, (activeRepls.get(replId) ?? 0) + 1);
  ensureTimer();
  // Report immediately so a brand-new connection refreshes the idle clock
  // without waiting a full interval.
  void sendHeartbeat();
}

// A socket for this workspace disconnected — drop the ref, and once the last
// one is gone stop advertising it as active so it can go idle.
export function unregisterActivity(replId: string): void {
  const count = activeRepls.get(replId);
  if (count === undefined) return;
  if (count <= 1) {
    activeRepls.delete(replId);
  } else {
    activeRepls.set(replId, count - 1);
  }
}
