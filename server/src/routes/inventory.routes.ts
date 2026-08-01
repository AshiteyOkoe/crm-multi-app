import { Router } from 'express';
import { listProducts, createProduct, updateProduct, getInventory, setStock, requestTransfer, listTransfers, decideTransfer } from '../controllers/inventory.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/products', authenticate, listProducts);
router.post('/products', authenticate, createProduct);
router.put('/products/:id', authenticate, updateProduct);

router.get('/', authenticate, getInventory);
router.post('/stock', authenticate, setStock);
router.post('/stock/adjust', authenticate, setStock);

router.get('/transfers', authenticate, listTransfers);
router.post('/transfers', authenticate, requestTransfer);
router.post('/transfers/:id/decide', authenticate, decideTransfer);

export default router;
