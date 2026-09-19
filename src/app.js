import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import { errorHandler, notFoundHandler } from './common/middlewares/errorHandler.js';
import { openapiSpec } from './config/openapi.js';

import { routes as authRoutes } from './modules/auth/index.js';
import { routes as catalogRoutes } from './modules/catalog/index.js';
import { routes as inventoryRoutes } from './modules/inventory/index.js';
import { routes as cartRoutes } from './modules/cart/index.js';
import { routes as addressesRoutes } from './modules/addresses/index.js';
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

// Vercel (and Fly) sit in front of this app as a reverse proxy and set
// X-Forwarded-For; trusting exactly one hop lets express-rate-limit and
// req.ip read the real client IP instead of the proxy's.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());
// razorpay webhook needs the raw bytes to verify the signature — stashed here since
// this is the only place the body is parsed
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
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
app.use('/api/v1/addresses', addressesRoutes);
app.use('/api/v1/orders', ordersRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/shipping', shippingRoutes);
app.use('/api/v1/rfq', rfqRoutes);
app.use('/api/v1/discounts', discountsRoutes);
app.use('/api/v1/reviews', reviewsRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/admin', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
