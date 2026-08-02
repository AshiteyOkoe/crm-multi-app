import { Router } from 'express';
import { getSegments, listCampaigns, getCampaign, createCampaign, sendCampaign, deleteCampaign } from '../controllers/marketing.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.get('/segments', authenticate, getSegments);
router.get('/campaigns', authenticate, listCampaigns);
router.get('/campaigns/:id', authenticate, getCampaign);
router.post('/campaigns', authenticate, authorize('BRANCH_MANAGER', 'ADMIN'), createCampaign);
router.post('/campaigns/:id/send', authenticate, authorize('BRANCH_MANAGER', 'ADMIN'), sendCampaign);
router.delete('/campaigns/:id', authenticate, authorize('BRANCH_MANAGER', 'ADMIN'), deleteCampaign);

export default router;
