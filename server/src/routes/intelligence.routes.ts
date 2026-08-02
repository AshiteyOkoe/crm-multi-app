import { Router } from 'express';
import { getForecast, getLeadScores, getDailySummary } from '../controllers/intelligence.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/forecast', authenticate, getForecast);
router.get('/lead-scores', authenticate, getLeadScores);
router.get('/daily-summary', authenticate, getDailySummary);

export default router;
