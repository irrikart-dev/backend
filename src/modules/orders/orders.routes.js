import { Router } from 'express';
import * as controller from './orders.controller.js';
import { authenticate, loadUser } from '../../common/middlewares/auth.js';
import { validate } from '../../common/middlewares/validate.js';
import { checkoutSchema } from './orders.validation.js';

const router = Router();

router.use(authenticate, loadUser);

/**
 * @openapi
 * /orders/checkout:
 *   post:
 *     tags: [Orders]
 *     summary: Place an order from the caller's cart and open a Razorpay payment
 *     description: >
 *       Re-validates stock and price off live variant data, reserves stock for every
 *       line, optionally applies a coupon, then creates the Order (PLACED) and a
 *       matching Razorpay order. Returns what the client needs to open Razorpay
 *       Checkout. Payment confirmation happens asynchronously via the Razorpay webhook,
 *       not in this response — the order stays PLACED until then.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Order placed, Razorpay order created }
 *       400: { description: Cart is empty, or invalid coupon state }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 *       404: { description: Coupon not found }
 *       409: { description: Insufficient stock, or coupon usage limit reached }
 */
router.post('/checkout', validate(checkoutSchema), controller.checkout);

/**
 * @openapi
 * /orders:
 *   get:
 *     tags: [Orders]
 *     summary: Order history for the caller, newest first
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of orders (summary shape, no line items) }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 */
router.get('/', controller.listOrders);

/**
 * @openapi
 * /orders/{id}:
 *   get:
 *     tags: [Orders]
 *     summary: One order's full detail, including line items
 *     description: >
 *       Poll this after the payment SDK's callback fires until `status` leaves
 *       `PLACED` (becomes `CONFIRMED` or `CANCELLED`) — the SDK callback alone is not
 *       proof of payment confirmation, see the checkout contract doc.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Order detail }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 *       404: { description: Order not found, or belongs to another user }
 */
router.get('/:id', controller.getOrder);

export default router;
