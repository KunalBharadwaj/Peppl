// replId becomes a Kubernetes object name, an S3 key prefix, and an Ingress host
// label downstream, so constrain it to a safe RFC1123-style charset at the entry
// point. Same pattern the runner and orchestrator enforce.
export const REPL_ID_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

export function isValidReplId(value: unknown): value is string {
  return typeof value === "string" && REPL_ID_RE.test(value);
}
