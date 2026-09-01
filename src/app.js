import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from 'cors';
import express from 'express';
import morgan from 'morgan';

import { config } from './config/index.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { adminRouter } from './routes/admin.routes.js';
import { catalogRouter } from './routes/catalog.routes.js';

export function createApp() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(
    cors({
      origin(origin, cb) {
        // No Origin header = same-origin, curl, or the mobile app — always allowed.
        if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`Origin ${origin} is not allowed by CORS`));
      },
    }),
  );
  if (config.logRequests) app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

  // Catalogue images carried over from the client's site, plus brand logos.
  // The mobile app bundles its own copies; this is for the web clients.
  app.use(
    '/static',
    express.static(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public'), {
      maxAge: '7d',
    }),
  );

  app.get('/api/v1/health', (_req, res) =>
    res.json({ status: 'ok', env: config.env, time: new Date().toISOString() }),
  );

  app.use('/api/v1', catalogRouter);
  app.use('/api/v1/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
