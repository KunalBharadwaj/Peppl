import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { claimsAuthorize, verifyWorkspaceToken } from "../src/workspaceAuth";

describe("claimsAuthorize", () => {
  it("authorizes a workspace-scoped token for its own replId", () => {
    expect(claimsAuthorize({ scope: "workspace", replId: "demo-1" }, "demo-1")).toBe(true);
  });

  it("rejects a token minted for a different workspace", () => {
    expect(claimsAuthorize({ scope: "workspace", replId: "other" }, "demo-1")).toBe(false);
  });

  it("rejects a non-workspace scope (e.g. a stray session token)", () => {
    expect(claimsAuthorize({ scope: "session", replId: "demo-1" }, "demo-1")).toBe(false);
    expect(claimsAuthorize({ replId: "demo-1" }, "demo-1")).toBe(false);
  });
});

describe("verifyWorkspaceToken", () => {
  const secret = "test-secret";

  it("accepts a validly-signed, correctly-scoped token", () => {
    const token = jwt.sign({ replId: "demo-1", userId: "google:a", scope: "workspace" }, secret);
    expect(verifyWorkspaceToken(token, secret, "demo-1")).not.toBeNull();
  });

  it("rejects a token signed with the wrong secret", () => {
    const token = jwt.sign({ replId: "demo-1", scope: "workspace" }, "wrong-secret");
    expect(verifyWorkspaceToken(token, secret, "demo-1")).toBeNull();
  });

  it("rejects a token scoped to a different replId", () => {
    const token = jwt.sign({ replId: "other", scope: "workspace" }, secret);
    expect(verifyWorkspaceToken(token, secret, "demo-1")).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = jwt.sign({ replId: "demo-1", scope: "workspace" }, secret, { expiresIn: -10 });
    expect(verifyWorkspaceToken(token, secret, "demo-1")).toBeNull();
  });

  it("rejects a missing token", () => {
    expect(verifyWorkspaceToken(undefined, secret, "demo-1")).toBeNull();
  });
});
