import { Router } from 'express';

import { listCategories, toPublicCategory } from '../services/category-service.js';
import { findBySlug, listProducts, toPublicProduct } from '../services/product-service.js';
import { asyncRoute } from '../utils/async-route.js';

/**
 * Public catalogue. This is what the mobile app reads — it returns the seeded
 * IrriKart products *and* anything added from the admin dashboard in one list,
 * so new products show up in the app with no app release.
 */
export const catalogRouter = Router();

const asBool = (v) => (v === undefined ? undefined : v === 'true' || v === '1');

catalogRouter.get(
  '/categories',
  asyncRoute(async (_req, res) => {
    res.json({ data: listCategories().map(toPublicCategory) });
  }),
);

catalogRouter.get(
  '/products',
  asyncRoute(async (req, res) => {
    const rows = listProducts({
      category: req.query.category,
      search: req.query.search,
      featured: asBool(req.query.featured),
      inStock: asBool(req.query.inStock),
    });
    res.json({ data: rows.map(toPublicProduct), count: rows.length });
  }),
);

catalogRouter.get(
  '/products/:slug',
  asyncRoute(async (req, res) => {
    res.json({ data: toPublicProduct(findBySlug(req.params.slug)) });
  }),
);

/**
 * One-shot catalogue snapshot.
 *
 * The app boots by loading categories and products together; serving them in
 * a single response keeps that to one round trip on a rural connection.
 */
catalogRouter.get(
  '/catalog',
  asyncRoute(async (_req, res) => {
    res.json({
      data: {
        categories: listCategories().map(toPublicCategory),
        products: listProducts().map(toPublicProduct),
        generatedAt: new Date().toISOString(),
      },
    });
  }),
);
