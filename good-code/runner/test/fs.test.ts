import { describe, it, expect } from "vitest";
import { resolveWorkspacePath, WORKSPACE_ROOT } from "../src/fs";

describe("resolveWorkspacePath", () => {
  it("resolves legit relative paths under the workspace", () => {
    expect(resolveWorkspacePath("index.js")).toBe(`${WORKSPACE_ROOT}/index.js`);
    expect(resolveWorkspacePath("src/app.ts")).toBe(`${WORKSPACE_ROOT}/src/app.ts`);
    expect(resolveWorkspacePath("sub/./ok.txt")).toBe(`${WORKSPACE_ROOT}/sub/ok.txt`);
  });

  it("maps empty path to the workspace root", () => {
    expect(resolveWorkspacePath("")).toBe(WORKSPACE_ROOT);
  });

  it("confines absolute-looking paths back inside the workspace", () => {
    // Leading slashes are stripped, so this cannot escape to the real /etc.
    expect(resolveWorkspacePath("/etc/passwd")).toBe(`${WORKSPACE_ROOT}/etc/passwd`);
  });

  it("throws on traversal that escapes the workspace", () => {
    for (const p of ["../etc/passwd", "../../etc/shadow", "foo/../../bar", "../"]) {
      expect(() => resolveWorkspacePath(p), p).toThrow(/escapes workspace/);
    }
  });
});
