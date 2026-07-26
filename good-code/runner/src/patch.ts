// Result of applying an incremental edit to a file's contents.
// `needsFull` tells the client its optimistic patch didn't apply cleanly and it
// should resend the whole file.
export type PatchResult =
  | { ok: true; needsFull: false; next: string }
  | { ok: false; needsFull: true; next: string };

export interface Patch {
  start: number;
  end: number;
  text: string;
  expected: string;
}

// Apply a range-replacement patch to `current`, but only if the slice the client
// claims to be replacing (`expected`) still matches what's actually there. This
// is the concurrency guard: a stale edit (someone else changed the region, or
// the offsets are out of range) is rejected instead of corrupting the file.
export function applyPatch(current: string, patch: Patch): PatchResult {
  const { start, end, text, expected } = patch;
  if (start < 0 || end < start || end > current.length) {
    return { ok: false, needsFull: true, next: current };
  }
  const actual = current.slice(start, end);
  if (actual !== expected) {
    return { ok: false, needsFull: true, next: current };
  }
  const next = current.slice(0, start) + text + current.slice(end);
  return { ok: true, needsFull: false, next };
}
