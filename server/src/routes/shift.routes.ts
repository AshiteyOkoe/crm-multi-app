import { Router } from 'express';
import { openShift, closeShift, myActiveShift, listShifts, shiftSummary } from '../controllers/shift.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/my-active', authenticate, myActiveShift);
router.post('/open', authenticate, openShift);
router.post('/:id/close', authenticate, closeShift);
router.get('/', authenticate, listShifts);
router.get('/summary', authenticate, shiftSummary);

export default router;
