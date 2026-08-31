import { describe, it, expect } from "vitest";
import { WorkspaceRegistry } from "../src/lifecycle";

const TTL = 30 * 60 * 1000; // 30 min

describe("WorkspaceRegistry", () => {
  it("reports only workspaces idle beyond the TTL as stale", () => {
    const now = 1_000_000_000;
    const r = new WorkspaceRegistry();
    r.touch("alive", now);
    r.touch("recent", now - 5 * 60 * 1000); // 5 min ago — still fresh
    r.touch("idle", now - 40 * 60 * 1000); // 40 min ago — stale

    expect(r.staleReplIds(TTL, now).sort()).toEqual(["idle"]);
  });

  it("treats exactly-TTL as not-yet-stale (strictly greater than)", () => {
    const now = 1_000_000_000;
    const r = new WorkspaceRegistry();
    r.touch("edge", now - TTL); // exactly TTL old
    expect(r.staleReplIds(TTL, now)).toEqual([]);
    // One ms older tips it over.
    r.touch("edge", now - TTL - 1);
    expect(r.staleReplIds(TTL, now)).toEqual(["edge"]);
  });

  it("touch refreshes the clock, rescuing a would-be-stale workspace", () => {
    const now = 1_000_000_000;
    const r = new WorkspaceRegistry();
    r.touch("ws", now - 40 * 60 * 1000);
    expect(r.staleReplIds(TTL, now)).toEqual(["ws"]);
    r.touch("ws", now); // heartbeat arrives
    expect(r.staleReplIds(TTL, now)).toEqual([]);
  });

  it("forget stops tracking a workspace", () => {
    const now = 1_000_000_000;
    const r = new WorkspaceRegistry();
    r.touch("a", now);
    r.touch("b", now - 40 * 60 * 1000);
    expect(r.size()).toBe(2);
    r.forget("b");
    expect(r.size()).toBe(1);
    expect(r.staleReplIds(TTL, now)).toEqual([]);
  });

  it("forget on an unknown id is a no-op", () => {
    const r = new WorkspaceRegistry();
    expect(() => r.forget("nope")).not.toThrow();
    expect(r.size()).toBe(0);
  });
});
