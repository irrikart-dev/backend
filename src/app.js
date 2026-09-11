import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import swaggerUi from 'swagger-ui-express';

import { errorHandler, notFoundHandler } from './common/middlewares/errorHandler.js';
import { authenticate, authorize } from './common/middlewares/auth.js';
import { openapiSpec } from './config/openapi.js';
import {
  notificationsQueue,
  fulfillmentQueue,
  notificationsDlq,
  fulfillmentDlq,
} from './events/queues.js';

import { routes as authRoutes } from './modules/auth/index.js';
import { routes as catalogRoutes } from './modules/catalog/index.js';
import { routes as inventoryRoutes } from './modules/inventory/index.js';
import { routes as cartRoutes } from './modules/cart/index.js';
import { routes as ordersRoutes } from './modules/orders/index.js';
import { routes as paymentsRoutes } from './modules/payments/index.js';
import { routes as shippingRoutes } from './modules/shipping/index.js';
import { routes as rfqRoutes } from './modules/rfq/index.js';
import { routes as discountsRoutes } from './modules/discounts/index.js';
import { routes as reviewsRoutes } from './modules/reviews/index.js';
import { routes as notificationsRoutes } from './modules/notifications/index.js';
import { routes as adminRoutes } from './modules/admin/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

// product/category images + brand assets — served publicly, cross-origin (admin
// dashboard, mobile app), so this needs its own CORP override past helmet's default
app.use(
  express.static(path.join(__dirname, '../public'), {
    setHeaders: (res) => res.set('Cross-Origin-Resource-Policy', 'cross-origin'),
  })
);

// OpenAPI — spec is generated from @openapi JSDoc on route files, same pattern FastAPI
// gets for free from Pydantic; here it's opt-in per route (see auth.routes.js)
app.get('/openapi.json', (_req, res) => res.json(openapiSpec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

// every module mounts under /api/v1/<module>, versioning lives at this one block
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/catalog', catalogRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/orders', ordersRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/shipping', shippingRoutes);
app.use('/api/v1/rfq', rfqRoutes);
app.use('/api/v1/discounts', discountsRoutes);
app.use('/api/v1/reviews', reviewsRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/admin', adminRoutes);

// queue inspection dashboard — admin-only, shows both queues plus their DLQs
const bullBoard = new ExpressAdapter();
bullBoard.setBasePath('/admin/queues');
createBullBoard({
  queues: [notificationsQueue, fulfillmentQueue, notificationsDlq, fulfillmentDlq].map(
    (q) => new BullMQAdapter(q)
  ),
  serverAdapter: bullBoard,
});
app.use('/admin/queues', authenticate, authorize('ADMIN'), bullBoard.getRouter());

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
