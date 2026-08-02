import { Router } from 'express';
import { listExpenses, createExpense, updateExpense, deleteExpense, expenseSummary } from '../controllers/expense.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, listExpenses);
router.get('/summary', authenticate, expenseSummary);
router.post('/', authenticate, authorize('BRANCH_MANAGER', 'ADMIN'), createExpense);
router.put('/:id', authenticate, authorize('BRANCH_MANAGER', 'ADMIN'), updateExpense);
router.delete('/:id', authenticate, authorize('BRANCH_MANAGER', 'ADMIN'), deleteExpense);

export default router;
