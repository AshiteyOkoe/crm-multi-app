import { Router } from 'express';
import {
  listBranches, createBranch, updateBranch,
  listUsers, createUser, updateUser,
  listNotifications, markNotificationsRead,
  listAuditLogs,
  listReturns, approveReturn,
  getSettings, updateSettings,
} from '../controllers/user.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, listBranches);
router.post('/', authenticate, authorize('ADMIN'), createBranch);
router.put('/:id', authenticate, authorize('ADMIN'), updateBranch);

router.get('/users', authenticate, listUsers);
router.post('/users', authenticate, authorize('ADMIN'), createUser);
router.put('/users/:id', authenticate, updateUser);

router.get('/returns', authenticate, listReturns);
router.post('/returns/:id/decide', authenticate, authorize('BRANCH_MANAGER', 'ADMIN'), approveReturn);

router.get('/notifications', authenticate, listNotifications);
router.put('/notifications/read', authenticate, markNotificationsRead);

router.get('/audit-logs', authenticate, authorize('ADMIN'), listAuditLogs);

router.get('/settings', authenticate, getSettings);
router.put('/settings', authenticate, authorize('ADMIN'), updateSettings);

export default router;
