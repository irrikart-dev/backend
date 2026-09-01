import { Router } from 'express';

import { requireAdmin } from '../middleware/require-admin.js';
import { login, publicAdmin } from '../services/auth-service.js';
import {
  createCategory,
  listCategories,
  toPublicCategory,
  updateCategory,
} from '../services/category-service.js';
import {
  createProduct,
  deleteProduct,
  findById,
  listProducts,
  stats,
  toPublicProduct,
  updatePricing,
  updateProduct,
} from '../services/product-service.js';
import { asyncRoute } from '../utils/async-route.js';

export const adminRouter = Router();

// --- auth (open) ----------------------------------------------------------

adminRouter.post(
  '/auth/login',
  asyncRoute(async (req, res) => {
    const { email, password } = req.body ?? {};
    res.json(await login(email, password));
  }),
);

// --- everything below requires a valid admin session ----------------------

adminRouter.use(requireAdmin);

adminRouter.get('/auth/me', (_req, res) => res.json({ user: publicAdmin() }));

adminRouter.get(
  '/stats',
  asyncRoute(async (_req, res) => res.json({ data: stats() })),
);

// Products. The dashboard sees inactive rows too, unlike the public catalogue.
adminRouter.get(
  '/products',
  asyncRoute(async (req, res) => {
    const rows = listProducts({
      category: req.query.category,
      search: req.query.search,
      includeInactive: true,
    });
    res.json({ data: rows.map(toPublicAdminProduct), count: rows.length });
  }),
);

adminRouter.get(
  '/products/:id',
  asyncRoute(async (req, res) => {
    res.json({ data: toPublicAdminProduct(findById(req.params.id)) });
  }),
);

adminRouter.post(
  '/products',
  asyncRoute(async (req, res) => {
    res.status(201).json({ data: toPublicAdminProduct(await createProduct(req.body)) });
  }),
);

adminRouter.patch(
  '/products/:id',
  asyncRoute(async (req, res) => {
    res.json({ data: toPublicAdminProduct(await updateProduct(req.params.id, req.body)) });
  }),
);

adminRouter.patch(
  '/products/:id/pricing',
  asyncRoute(async (req, res) => {
    res.json({ data: toPublicAdminProduct(await updatePricing(req.params.id, req.body)) });
  }),
);

adminRouter.delete(
  '/products/:id',
  asyncRoute(async (req, res) => {
    await deleteProduct(req.params.id);
    res.status(204).end();
  }),
);

// Categories.
adminRouter.get(
  '/categories',
  asyncRoute(async (_req, res) => {
    res.json({ data: listCategories({ includeInactive: true }).map(toPublicCategory) });
  }),
);

adminRouter.post(
  '/categories',
  asyncRoute(async (req, res) => {
    res.status(201).json({ data: toPublicCategory(await createCategory(req.body)) });
  }),
);

adminRouter.patch(
  '/categories/:id',
  asyncRoute(async (req, res) => {
    res.json({ data: toPublicCategory(await updateCategory(req.params.id, req.body)) });
  }),
);

/** Public shape plus the fields only the dashboard needs. */
function toPublicAdminProduct(p) {
  return {
    ...toPublicProduct(p),
    active: p.active,
    stockQty: p.stockQty,
    createdAt: p.createdAt,
  };
}
