import { Router } from 'express';
import { listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer, addInteraction } from '../controllers/customer.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, listCustomers);
router.post('/', authenticate, createCustomer);
router.get('/:id', authenticate, getCustomer);
router.put('/:id', authenticate, updateCustomer);
router.delete('/:id', authenticate, deleteCustomer);
router.post('/:id/interactions', authenticate, addInteraction);

export default router;
