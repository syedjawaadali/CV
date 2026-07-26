import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { requestContext } from './middleware/requestContext.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { healthRouter } from './modules/health.routes.js';
import { apiRouter } from './modules/api.router.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestContext);

  app.use('/health', healthRouter);
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
