import { Router } from 'express';
import { listLeads, getLead, createLead, updateLead, deleteLead, convertLead, listOpportunities, updateOpportunityStage } from '../controllers/lead.controller';
import { addInteraction } from '../controllers/customer.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, listLeads);
router.post('/', authenticate, createLead);
router.get('/opportunities', authenticate, listOpportunities);
router.put('/opportunities/:id/stage', authenticate, updateOpportunityStage);
router.get('/:id', authenticate, getLead);
router.put('/:id', authenticate, updateLead);
router.delete('/:id', authenticate, deleteLead);
router.post('/:id/convert', authenticate, convertLead);
router.post('/:id/interactions', authenticate, addInteraction);

export default router;
