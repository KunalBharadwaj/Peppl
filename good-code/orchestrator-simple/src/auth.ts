import jwt from "jsonwebtoken";
import { NextFunction, Request, Response } from "express";

const jwtSecret = process.env.JWT_SECRET?.trim();

export function assertAuthConfig(): void {
  if (!jwtSecret) {
    throw new Error("Missing required env var: JWT_SECRET");
  }
}

export interface SessionClaims {
  userId: string;
  email: string;
}

export interface AuthedRequest extends Request {
  user?: SessionClaims;
}

// Verify the session JWT minted by init-service using the shared JWT_SECRET.
// Orchestrator does not touch Mongo, so it authenticates the caller but does not
// (yet) verify that the caller owns the given replId — see IMPROVEMENTS.md.
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
