// replId is string-substituted into the manifest YAML and becomes K8s object
// names / an Ingress host, so it must be validated before use to prevent
// manifest injection and invalid object names. Same charset the runner and
// init-service enforce.
export const REPL_ID_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

export function isValidReplId(value: unknown): value is string {
  return typeof value === "string" && REPL_ID_RE.test(value);
}
