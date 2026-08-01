import express from 'express';
import cors from 'cors';
import * as helmetModule from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';

const helmet = helmetModule.default;

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());
  app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));

  app.use(apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
