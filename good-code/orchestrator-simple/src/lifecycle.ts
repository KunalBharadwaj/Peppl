// In-memory record of when each workspace was last seen active. The runner
// pods emit heartbeats (POST /heartbeat) while a user has a live socket; the
// reaper sweeps this map for workspaces that have gone quiet past the idle TTL.
//
// This state is intentionally in-memory (not persisted): it is a soft signal
// for cleanup, not a source of truth. Consequences to be aware of —
//  - On orchestrator restart the map is empty and is repopulated by incoming
//    heartbeats within one heartbeat interval for every *live* pod, so live
//    workspaces are not wrongly reaped (the reaper only acts on entries it has
//    actually seen go stale).
//  - A pod that was provisioned but whose runner never heartbeats (and the
//    orchestrator restarted before its seeded entry went stale) can leak. That
//    residual-orphan case is documented in IMPROVEMENTS.md; a Mongo-backed
//    last-activity timestamp would close it if it ever matters at scale.
export class WorkspaceRegistry {
  private lastSeen = new Map<string, number>();

  // Record activity for a workspace (heartbeat or fresh provision).
  touch(replId: string, at: number = Date.now()): void {
    this.lastSeen.set(replId, at);
  }

  // Stop tracking a workspace (after it has been torn down).
  forget(replId: string): void {
    this.lastSeen.delete(replId);
  }

  // replIds whose most recent activity is older than ttlMs.
  staleReplIds(ttlMs: number, now: number = Date.now()): string[] {
    const stale: string[] = [];
    for (const [replId, seenAt] of this.lastSeen) {
      if (now - seenAt > ttlMs) {
        stale.push(replId);
      }
    }
    return stale;
  }

  size(): number {
    return this.lastSeen.size;
  }
}
