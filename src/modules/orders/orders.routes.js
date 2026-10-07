import { Router } from 'express';
import * as controller from './orders.controller.js';
import { authenticate, loadUser } from '../../common/middlewares/auth.js';
import { validate } from '../../common/middlewares/validate.js';
import { cancelOrderSchema, checkoutSchema } from './orders.validation.js';

const router = Router();

router.use(authenticate, loadUser);

/**
 * @openapi
 * /orders/checkout:
 *   post:
 *     tags: [Orders]
 *     summary: Place an order from the caller's cart — online (Razorpay) or cash on delivery
 *     description: >
 *       Re-validates stock and price off live variant data, optionally applies a coupon,
 *       then places the order.
 *
 *       `paymentMethod: ONLINE` (default) reserves stock, creates the Order (PLACED) and a
 *       matching Razorpay order, and returns what the client needs to open Razorpay
 *       Checkout, including `customerId` for saved methods. Payment confirmation happens
 *       via the webhook or POST /payments/verify. A failed attempt moves the order to
 *       PAYMENT_FAILED (stock still held) so the customer can retry (POST /orders/{id}/pay);
 *       unpaid orders auto-cancel after ORDER_PAYMENT_TIMEOUT_MINUTES.
 *
 *       `paymentMethod: COD` needs the total within COD_MAX_ORDER_AMOUNT; the order is
 *       CONFIRMED immediately and the cart converted.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Order placed, Razorpay order created }
 *       400: { description: Cart is empty, invalid coupon state, or COD not allowed for this order }
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
 *       `PLACED` (becomes `CONFIRMED` or `PAYMENT_FAILED`) — the SDK callback alone is not
 *       proof of payment confirmation, see the checkout contract doc. `PAYMENT_FAILED`
 *       means the last attempt failed: show a retry (POST /orders/{id}/pay) or cancel.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Order detail }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 *       404: { description: Order not found, or belongs to another user }
 */
router.get('/:id', controller.getOrder);

/**
 * @openapi
 * /orders/{id}/pay:
 *   post:
 *     tags: [Orders]
 *     summary: Reopen payment for an unpaid online order (retry after a failure or a closed sheet)
 *     description: Same response shape as an ONLINE checkout, against the same Razorpay order.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Payment sheet config }
 *       404: { description: Order not found }
 *       409: { description: Order already paid or cancelled }
 * /orders/{id}/cancel:
 *   post:
 *     tags: [Orders]
 *     summary: Cancel the caller's order
 *     description: >
 *       Allowed while PLACED or PAYMENT_FAILED, or CONFIRMED within ORDER_CANCEL_WINDOW_HOURS of placing it —
 *       not once it's packed. A paid online order is refunded in full to the original
 *       method; `refundStatus` says how that went (`failed` = admin will follow up).
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Cancelled order, plus refundStatus }
 *       400: { description: reason missing }
 *       409: { description: Order can no longer be cancelled }
 * /orders/{id}/reorder:
 *   post:
 *     tags: [Orders]
 *     summary: Add a past order's items back to the cart
 *     description: Same semantics as POST /cart/merge — unavailable lines come back in `skipped`.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ cart, skipped }" }
 * /orders/{id}/invoice:
 *   get:
 *     tags: [Orders]
 *     summary: Invoice PDF for a confirmed order
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: application/pdf }
 *       409: { description: Order unpaid or cancelled — nothing to invoice }
 */
router.post('/:id/pay', controller.payOrder);
router.post('/:id/cancel', validate(cancelOrderSchema), controller.cancelOrder);
router.post('/:id/reorder', controller.reorder);
router.get('/:id/invoice', controller.getInvoice);

export default router;
