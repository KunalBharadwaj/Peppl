import { describe, it, expect } from "vitest";
import { applyPatch } from "../src/patch";

describe("applyPatch", () => {
  it("applies a clean range replacement", () => {
    const res = applyPatch("hello world", {
      start: 6,
      end: 11,
      text: "there",
      expected: "world",
    });
    expect(res.ok).toBe(true);
    expect(res.next).toBe("hello there");
  });

  it("supports pure insertion (start === end)", () => {
    const res = applyPatch("ac", { start: 1, end: 1, text: "b", expected: "" });
    expect(res.ok).toBe(true);
    expect(res.next).toBe("abc");
  });

  it("rejects when the expected slice no longer matches (stale edit)", () => {
    const res = applyPatch("hello world", {
      start: 6,
      end: 11,
      text: "there",
      expected: "WORLD", // client's view is stale
    });
    expect(res.ok).toBe(false);
    expect(res.needsFull).toBe(true);
    expect(res.next).toBe("hello world"); // unchanged
  });

  it("rejects out-of-range end", () => {
    const res = applyPatch("abc", { start: 0, end: 99, text: "x", expected: "abc" });
    expect(res.ok).toBe(false);
    expect(res.needsFull).toBe(true);
  });

  it("rejects negative start", () => {
    const res = applyPatch("abc", { start: -1, end: 1, text: "x", expected: "a" });
    expect(res.ok).toBe(false);
  });

  it("rejects end < start", () => {
    const res = applyPatch("abc", { start: 2, end: 1, text: "x", expected: "" });
    expect(res.ok).toBe(false);
  });
});
