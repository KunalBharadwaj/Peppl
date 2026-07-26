import jwt from "jsonwebtoken";

// Claims carried by a per-workspace access token, minted by the orchestrator at
// /start after it verified the caller owns the replId.
export interface WorkspaceClaims {
  replId?: string;
  userId?: string;
  scope?: string;
}

// Pure authorization check: do these (already-verified) claims grant access to
// THIS pod's workspace? A token is only good for the exact replId it was minted
// for, so a valid token for workspace A cannot open a socket to workspace B.
export function claimsAuthorize(claims: WorkspaceClaims, replId: string): boolean {
  return claims.scope === "workspace" && claims.replId === replId;
}

// Verify the token's signature with the shared secret and confirm it is scoped
// to `replId`. Returns the claims on success, or null on any failure (missing,
// malformed, expired, wrong signature, or wrong workspace).
export function verifyWorkspaceToken(
  token: string | undefined,
  secret: string,
  replId: string
): WorkspaceClaims | null {
  if (!token) return null;
  try {
    const claims = jwt.verify(token, secret) as WorkspaceClaims;
    return claimsAuthorize(claims, replId) ? claims : null;
  } catch {
    return null;
  }
}
