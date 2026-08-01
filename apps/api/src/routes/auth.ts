import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { login, logout, me } from '../controllers/auth.js';

export const authRouter = Router();

authRouter.post('/login', requireAuth, login);
authRouter.post('/logout', requireAuth, logout);
authRouter.get('/me', requireAuth, me);
