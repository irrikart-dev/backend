import { Router } from 'express';
import * as controller from './catalog.controller.js';
import { validate } from '../../common/middlewares/validate.js';
import { authenticate, loadUser } from '../../common/middlewares/auth.js';
import { listProductsSchema, productIdParamSchema } from './catalog.validation.js';

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
 * /catalog/brands:
 *   get:
 *     tags: [Catalog]
 *     summary: List brands, sorted by name
 *     responses:
 *       200: { description: Brands }
 */
router.get('/brands', controller.listBrands);

/**
 * @openapi
 * /catalog/products:
 *   get:
 *     tags: [Catalog]
 *     summary: List live products
 *     description: >
 *       Public. Returns only PUBLISHED products, newest edit first unless `sort` is
 *       given, paginated as { items, page, limit, total }. `brand`, `category` and
 *       `vendor` take ids. Price filters match if any variant is in range.
 *     parameters:
 *       - { in: query, name: category, schema: { type: string } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: brand, schema: { type: string } }
 *       - { in: query, name: vendor, schema: { type: string } }
 *       - { in: query, name: minPrice, schema: { type: number } }
 *       - { in: query, name: maxPrice, schema: { type: number } }
 *       - { in: query, name: minRating, schema: { type: number } }
 *       - { in: query, name: inStock, schema: { type: boolean } }
 *       - { in: query, name: sort, schema: { type: string, enum: [newest, price_asc, price_desc, popular, rating] } }
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

// ---- caller's own lists — everything below needs a signed-in user ----

/**
 * @openapi
 * /catalog/wishlist:
 *   get:
 *     tags: [Catalog]
 *     summary: The caller's wishlist, newest first
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Products }
 * /catalog/wishlist/{productId}:
 *   post:
 *     tags: [Catalog]
 *     summary: Add a product to the wishlist (idempotent)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Updated wishlist }
 *       404: { description: Product not found or not live }
 *   delete:
 *     tags: [Catalog]
 *     summary: Remove a product from the wishlist
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Updated wishlist }
 * /catalog/recently-viewed:
 *   get:
 *     tags: [Catalog]
 *     summary: Last 20 products the caller viewed
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Products }
 * /catalog/recently-viewed/{productId}:
 *   post:
 *     tags: [Catalog]
 *     summary: Record a product view — call when the PDP opens
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Recorded }
 *       404: { description: Product not found or not live }
 */
router.get('/wishlist', authenticate, loadUser, controller.listWishlist);
router.post('/wishlist/:productId', authenticate, loadUser, validate(productIdParamSchema), controller.addToWishlist);
router.delete('/wishlist/:productId', authenticate, loadUser, controller.removeFromWishlist);
router.get('/recently-viewed', authenticate, loadUser, controller.listRecentlyViewed);
router.post('/recently-viewed/:productId', authenticate, loadUser, validate(productIdParamSchema), controller.recordView);

export default router;
