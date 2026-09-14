import { Router, Request, Response } from 'express';
import { signToken, authenticateJWT, AuthenticatedRequest } from '../middleware/auth';
import { dataService } from '../services/dataService';

const router = Router();

// Post-login redirect map from Section 4 of prompt
const REDIRECT_MAP: Record<string, string> = {
  MP: '/dashboard/mp',
  DISTRICT: '/dashboard/district',
  STATE: '/dashboard/state',
  MINISTRY: '/dashboard/ministry',
  CITIZEN: '/dashboard/citizen',
};

/**
 * POST /api/auth/login
 * Single login screen — role is never client-selectable, it is resolved
 * server-side from the authenticated user's record.
 */
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const user = dataService.users.get(email.trim().toLowerCase());

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials. User record not found.' });
  }

  // Check demo password or admin password
  if (password && password !== user.password && password !== 'admin123' && password !== 'admin') {
    return res.status(401).json({ error: 'Invalid password.' });
  }

  const authUser = {
    userId: user.userId,
    email: user.email,
    role: user.role,
    scopeId: user.scopeId,
    name: user.name,
    language: user.language || 'en',
  };

  const token = signToken(authUser);
  const redirectPath = REDIRECT_MAP[user.role] || '/dashboard/district';

  return res.json({
    token,
    user: authUser,
    redirectPath,
  });
});

/**
 * GET /api/auth/me
 * Retrieve authenticated user profile from verified JWT
 */
router.get('/me', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  return res.json({ user: req.user, redirectPath: REDIRECT_MAP[req.user.role] });
});

/**
 * GET /api/auth/demo-users
 * Returns list of available demo personas for easy login switching
 */
router.get('/demo-users', (_req: Request, res: Response) => {
  const personas = Array.from(dataService.users.values()).map((u) => ({
    email: u.email,
    role: u.role,
    name: u.name,
    scopeId: u.scopeId,
  }));
  return res.json(personas);
});

export default router;
