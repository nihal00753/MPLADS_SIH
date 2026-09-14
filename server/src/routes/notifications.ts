import { Router, Response } from 'express';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth';
import { dataService } from '../services/dataService';

const router = Router();

/**
 * GET /api/notifications
 * In-app polling endpoint for unread notifications and alerts
 */
router.get('/', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;

  // Scoped notifications
  const userNotifications = dataService.notifications.filter((n) => {
    if (user.role === 'MINISTRY') return true;
    if (n.userId === user.userId) return true;
    if (n.role === user.role && (!n.scopeId || n.scopeId.toLowerCase() === (user.scopeId || '').toLowerCase())) {
      return true;
    }
    return false;
  });

  const unreadCount = userNotifications.filter((n) => !n.read).length;

  return res.json({
    unreadCount,
    notifications: userNotifications.slice(0, 30),
  });
});

/**
 * POST /api/notifications/:id/read
 * Mark notification as read
 */
router.post('/:id/read', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const notif = dataService.notifications.find((n) => n.id === id);

  if (notif) {
    notif.read = true;
  }

  return res.json({ success: true });
});

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read
 */
router.post('/read-all', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;

  dataService.notifications.forEach((n) => {
    if (user.role === 'MINISTRY' || n.userId === user.userId || (n.role === user.role && n.scopeId === user.scopeId)) {
      n.read = true;
    }
  });

  return res.json({ success: true });
});

export default router;
