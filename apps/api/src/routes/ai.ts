import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { postAiChat } from '../controllers/ai.js';

export const aiRouter = Router();

aiRouter.use(requireAuth);
aiRouter.post('/chat', postAiChat);
