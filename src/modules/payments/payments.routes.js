import { Router } from 'express';
import * as controller from './payments.controller.js';
import { authenticate, loadUser } from '../../common/middlewares/auth.js';
import { validate } from '../../common/middlewares/validate.js';
import { verifyPaymentSchema } from './payments.validation.js';

const router = Router();

/**
 * @openapi
 * /payments/webhook:
 *   post:
 *     tags: [Payments]
 *     summary: Razorpay webhook — payment captured/failed
 *     description: >
 *       Called by Razorpay, not app clients — verified via HMAC signature
 *       (x-razorpay-signature header) instead of a bearer token. Idempotent: a
 *       redelivered event for an already-processed payment is a no-op 200, not an error.
 *     responses:
 *       200: { description: Event processed (or already-processed / unhandled event, both no-ops) }
 *       400: { description: Invalid signature or malformed payload }
 */
router.post('/webhook', controller.handleWebhook);

/**
 * @openapi
 * /payments/verify:
 *   post:
 *     tags: [Payments]
 *     summary: Confirm a payment straight from the client, without waiting on the webhook
 *     description: >
 *       Called by the app as soon as the checkout SDK reports success, so an order
 *       isn't hostage to webhook delivery latency. Verifies the SDK's signature, then
 *       treats the gateway's own payment status as authoritative before confirming.
 *       Shares the webhook's status-guarded writes, so whichever of the two lands
 *       second is a no-op — safe to call even if the webhook already arrived.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "Current order status after verification (CONFIRMED, CANCELLED, or still PLACED if the gateway hasn't settled it yet)" }
 *       400: { description: Signature verification failed, or payment belongs to another order }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 *       404: { description: No such order for this user }
 */
router.post(
  '/verify',
  authenticate,
  loadUser,
  validate(verifyPaymentSchema),
  controller.verifyPayment
);

export default router;
