// replId is derived from the request Host subdomain and flows into S3 key
// prefixes, so constrain it to the same RFC1123-style charset the control plane
// enforces. A spoofed Host that doesn't match can't inject path segments.
export const REPL_ID_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

export function isValidReplId(value: unknown): value is string {
  return typeof value === "string" && REPL_ID_RE.test(value);
}
