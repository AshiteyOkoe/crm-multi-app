import { Router } from 'express';
import { register, login, me, sendVerificationEmail, verifyEmail, forgotPassword, resetPassword } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, me);
router.post('/send-verification', authenticate, sendVerificationEmail);
router.get('/verify-email', verifyEmail);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;
