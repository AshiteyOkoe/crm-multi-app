import { Router } from 'express';
import { getDashboard, getSalesReport, getLeadsReport, getCustomerGrowthReport, exportReportCsv, exportRevenueJson } from '../controllers/report.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/dashboard', authenticate, getDashboard);
router.get('/sales', authenticate, getSalesReport);
router.get('/leads', authenticate, getLeadsReport);
router.get('/customers', authenticate, getCustomerGrowthReport);
router.get('/export/:type', authenticate, exportReportCsv);
router.get('/export/revenue/json', authenticate, exportRevenueJson);

export default router;
