import { describe, it, expect } from "vitest";
import { isValidReplId } from "../src/validation";

describe("isValidReplId", () => {
  it("accepts RFC1123-style ids", () => {
    for (const id of ["a", "a1", "abc", "my-repl-123", "a".repeat(40)]) {
      expect(isValidReplId(id), id).toBe(true);
    }
  });

  it("rejects empty, bad charset, bad edges, and over-length ids", () => {
    for (const id of [
      "",
      "-abc", // leading hyphen
      "abc-", // trailing hyphen
      "Abc", // uppercase
      "a_b", // underscore
      "a b", // space
      "a/b", // slash (path injection)
      "a".repeat(41), // too long
    ]) {
      expect(isValidReplId(id), id).toBe(false);
    }
  });

  it("rejects non-strings", () => {
    expect(isValidReplId(undefined)).toBe(false);
    expect(isValidReplId(null)).toBe(false);
    expect(isValidReplId(123)).toBe(false);
  });
});
