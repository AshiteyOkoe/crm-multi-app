import { Router } from 'express';
import { listTasks, createTask, updateTask, deleteTask, listFollowUps, createFollowUp, updateFollowUp, deleteFollowUp, upcomingFollowUps } from '../controllers/task.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/follow-ups/upcoming', authenticate, upcomingFollowUps);

router.get('/', authenticate, listTasks);
router.post('/', authenticate, createTask);
router.put('/:id', authenticate, updateTask);
router.delete('/:id', authenticate, deleteTask);

router.get('/follow-ups', authenticate, listFollowUps);
router.post('/follow-ups', authenticate, createFollowUp);
router.put('/follow-ups/:id', authenticate, updateFollowUp);
router.delete('/follow-ups/:id', authenticate, deleteFollowUp);

export default router;
