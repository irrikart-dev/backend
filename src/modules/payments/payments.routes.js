import { Router } from 'express';
import * as controller from './payments.controller.js';

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

export default router;
