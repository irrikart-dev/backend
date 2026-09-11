import { Router } from 'express';
import * as controller from './catalog.controller.js';
import { validate } from '../../common/middlewares/validate.js';
import { listProductsSchema } from './catalog.validation.js';

const router = Router();

/**
 * @openapi
 * /catalog/categories:
 *   get:
 *     tags: [Catalog]
 *     summary: List catalogue categories
 *     description: Public. Sorted by name. See docs/app-catalog-api-contract.md.
 *     responses:
 *       200: { description: Categories }
 */
router.get('/categories', controller.listCategories);

/**
 * @openapi
 * /catalog/products:
 *   get:
 *     tags: [Catalog]
 *     summary: List live products
 *     description: >
 *       Public. Returns only products the admin has marked Live, newest edit first,
 *       paginated as { items, page, limit, total }.
 *     parameters:
 *       - { in: query, name: category, schema: { type: string } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200: { description: Paginated products }
 *       400: { description: Invalid query parameters }
 */
router.get('/products', validate(listProductsSchema), controller.listProducts);

/**
 * @openapi
 * /catalog/products/{idOrSlug}:
 *   get:
 *     tags: [Catalog]
 *     summary: Get one live product by id or slug
 *     description: Public. Hidden products return 404, same as missing ones.
 *     responses:
 *       200: { description: Product }
 *       404: { description: Not found or not live }
 */
router.get('/products/:idOrSlug', controller.getProduct);

export default router;
