import { Router } from 'express';
import { getDashboard, getSalesReport, getLeadsReport, getCustomerGrowthReport, getPnlReport, getStockValuation, getPurchaseSuggestions, exportReportCsv, exportRevenueJson, getReconciliation } from '../controllers/report.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/dashboard', authenticate, getDashboard);
router.get('/sales', authenticate, getSalesReport);
router.get('/leads', authenticate, getLeadsReport);
router.get('/customers', authenticate, getCustomerGrowthReport);
router.get('/pnl', authenticate, getPnlReport);
router.get('/stock-valuation', authenticate, getStockValuation);
router.get('/purchase-suggestions', authenticate, getPurchaseSuggestions);
router.get('/reconciliation', authenticate, getReconciliation);
router.get('/export/:type', authenticate, exportReportCsv);
router.get('/export/revenue/json', authenticate, exportRevenueJson);

export default router;
