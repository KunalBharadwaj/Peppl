import { OAuth2Client } from "google-auth-library";
import jwt, { SignOptions } from "jsonwebtoken";
import { NextFunction, Request, Response } from "express";
import { GoogleProfile } from "../repositories/userRepository";

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const jwtSecret = process.env.JWT_SECRET?.trim();
const jwtExpiresIn = process.env.JWT_EXPIRES_IN?.trim() || "7d";

const googleClient = new OAuth2Client(googleClientId);

// Fail fast at boot rather than on the first login request if auth is misconfigured.
export function assertAuthConfig(): void {
  if (!googleClientId) {
    throw new Error("Missing required env var: GOOGLE_CLIENT_ID");
  }
  if (!jwtSecret) {
    throw new Error("Missing required env var: JWT_SECRET");
  }
}

// Verify a Google Identity Services ID token (the `credential` the frontend
// receives from the Google sign-in button). Throws if the signature, audience,
// or email verification fails.
export async function verifyGoogleIdToken(credential: string): Promise<GoogleProfile> {
  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: googleClientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error("Google token missing required claims");
  }
  if (payload.email_verified === false) {
    throw new Error("Google email is not verified");
  }
  return {
    googleSub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
}

export interface SessionClaims {
  userId: string;
  email: string;
}

// Issue our own signed session token. Both init-service and orchestrator-simple
// verify this token with the shared JWT_SECRET — no cross-service call needed.
export function issueSessionToken(claims: SessionClaims): string {
  const options: SignOptions = { expiresIn: jwtExpiresIn as SignOptions["expiresIn"] };
  return jwt.sign(claims, jwtSecret as string, options);
}

export interface AuthedRequest extends Request {
  user?: SessionClaims;
}

// Express middleware: require a valid `Authorization: Bearer <jwt>` header and
// attach the decoded session to req.user.
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
  if (!token) {
    res.status(401).send("Missing bearer token");
    return;
  }
  try {
    const decoded = jwt.verify(token, jwtSecret as string) as SessionClaims;
    if (!decoded?.userId) {
      res.status(401).send("Invalid token");
      return;
    }
    req.user = { userId: decoded.userId, email: decoded.email };
    next();
  } catch {
    res.status(401).send("Invalid or expired token");
  }
}
