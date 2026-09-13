import { Router } from 'express';
import * as controller from './cart.controller.js';
import { authenticate, loadUser } from '../../common/middlewares/auth.js';
import { validate } from '../../common/middlewares/validate.js';
import { addItemSchema, updateItemQuantitySchema } from './cart.validation.js';

const router = Router();

router.use(authenticate, loadUser);

/**
 * @openapi
 * /cart:
 *   get:
 *     tags: [Cart]
 *     summary: Get the caller's active cart
 *     description: >
 *       Returns the caller's ACTIVE cart with items and computed totals. If the user
 *       has no cart yet, returns an empty cart shape (200), not a 404.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Cart with items and totals }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 */
router.get('/', controller.getCart);

/**
 * @openapi
 * /cart/items:
 *   post:
 *     tags: [Cart]
 *     summary: Add a variant to the cart, or increase its quantity if already present
 *     description: >
 *       Looks up the variant server-side, validates it is in stock, and captures its
 *       current price into priceSnapshot. Re-adding a variant already in the cart adds
 *       to its existing quantity rather than creating a duplicate line.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Updated cart }
 *       400: { description: Invalid body }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 *       404: { description: Variant not found }
 *       409: { description: Requested quantity exceeds what's available }
 */
router.post('/items', validate(addItemSchema), controller.addItem);

/**
 * @openapi
 * /cart/items/{itemId}:
 *   patch:
 *     tags: [Cart]
 *     summary: Update a cart line's quantity
 *     description: >
 *       Quantity must be a positive integer; use DELETE /cart/items/{itemId} to remove
 *       a line entirely — quantity 0 is rejected (400), not treated as a delete.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Updated cart }
 *       400: { description: Invalid body }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 *       404: { description: Cart item not found }
 *       409: { description: Requested quantity exceeds what's available }
 */
router.patch('/items/:itemId', validate(updateItemQuantitySchema), controller.updateItemQuantity);

/**
 * @openapi
 * /cart/items/{itemId}:
 *   delete:
 *     tags: [Cart]
 *     summary: Remove a line from the cart
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Updated cart }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 *       404: { description: Cart item not found }
 */
router.delete('/items/:itemId', controller.removeItem);

/**
 * @openapi
 * /cart:
 *   delete:
 *     tags: [Cart]
 *     summary: Clear all items from the cart
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Empty cart }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 */
router.delete('/', controller.clearCart);

export default router;
