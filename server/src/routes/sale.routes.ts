import { Router } from 'express';
import { createSale, listSales, getSale, voidSale, createReturn, todaySummary } from '../controllers/sale.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, listSales);
router.get('/today-summary', authenticate, todaySummary);
router.post('/', authenticate, createSale);
router.post('/returns', authenticate, createReturn);
router.get('/:id', authenticate, getSale);
router.post('/:id/void', authenticate, authorize('BRANCH_MANAGER', 'ADMIN'), voidSale);

export default router;
