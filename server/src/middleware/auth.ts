import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export type UserRole = 'MP' | 'DISTRICT' | 'STATE' | 'MINISTRY' | 'CITIZEN';

export interface AuthUser {
  userId: string;
  email: string;
  role: UserRole;
  scopeId: string | null;
  name: string;
  language?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

const JWT_SECRET = process.env.JWT_SECRET || 'mplads-super-secure-jwt-secret-key-2026-gov';

export function signToken(user: AuthUser): string {
  return jwt.sign(
    {
      userId: user.userId,
      email: user.email,
      role: user.role,
      scopeId: user.scopeId,
      name: user.name,
      language: user.language || 'en',
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

export function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or malformed authorization token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Forbidden: Invalid or expired authorization token' });
  }
}

/**
 * Optional JWT authentication: parses and attaches req.user if a valid Bearer token is
 * provided, but permits unauthenticated requests to proceed smoothly (e.g. AI Copilot).
 */
export function optionalAuthenticateJWT(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
      req.user = decoded;
    } catch {
      // Ignore invalid or expired token - proceed without user context
    }
  }

  next();
}

/**
 * RBAC middleware: ensures the authenticated user possesses one of the authorized roles.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Role '${req.user.role}' is not authorized to access this resource. Allowed: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
}
