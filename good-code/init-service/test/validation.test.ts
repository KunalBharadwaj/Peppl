import { describe, it, expect } from "vitest";
import { isValidReplId } from "../src/validation";

describe("isValidReplId (init-service entry point)", () => {
  it("accepts safe ids", () => {
    for (const id of ["a", "node-js-demo", "repl123", "a".repeat(40)]) {
      expect(isValidReplId(id), id).toBe(true);
    }
  });

  it("rejects unsafe ids", () => {
    for (const id of ["", "-x", "x-", "Repl", "a b", "a/b", "..", "a".repeat(41)]) {
      expect(isValidReplId(id), JSON.stringify(id)).toBe(false);
    }
  });
});
