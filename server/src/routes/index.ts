import { Router } from 'express';
import authRoutes from './auth.routes';
import branchRoutes from './branch.routes';
import customerRoutes from './customer.routes';
import leadRoutes from './lead.routes';
import saleRoutes from './sale.routes';
import inventoryRoutes from './inventory.routes';
import taskRoutes from './task.routes';
import reportRoutes from './report.routes';
import expenseRoutes from './expense.routes';
import shiftRoutes from './shift.routes';
import marketingRoutes from './marketing.routes';
import intelligenceRoutes from './intelligence.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/branches', branchRoutes);
router.use('/customers', customerRoutes);
router.use('/leads', leadRoutes);
router.use('/sales', saleRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/tasks', taskRoutes);
router.use('/reports', reportRoutes);
router.use('/expenses', expenseRoutes);
router.use('/shifts', shiftRoutes);
router.use('/marketing', marketingRoutes);
router.use('/intelligence', intelligenceRoutes);

export default router;
