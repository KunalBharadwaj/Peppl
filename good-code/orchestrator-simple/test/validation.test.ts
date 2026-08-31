import { describe, it, expect } from "vitest";
import { isValidReplId } from "../src/validation";

describe("isValidReplId (orchestrator — manifest-injection guard)", () => {
  it("accepts safe RFC1123-style ids", () => {
    for (const id of ["a", "web-1", "my-repl-123", "a".repeat(40)]) {
      expect(isValidReplId(id), id).toBe(true);
    }
  });

  it("rejects ids that could break out of YAML substitution or object naming", () => {
    for (const id of [
      "",
      "svc name", // space
      "svc\nname: evil", // newline — YAML injection attempt
      "UPPER",
      "a".repeat(41),
      "-lead",
      "trail-",
      "a/b",
    ]) {
      expect(isValidReplId(id), JSON.stringify(id)).toBe(false);
    }
  });
});
