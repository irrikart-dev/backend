import { Router } from 'express';
import * as controller from './shipping.controller.js';
import { validate } from '../../common/middlewares/validate.js';
import { serviceabilityQuerySchema } from './shipping.validation.js';

const router = Router();

/**
 * @openapi
 * /shipping/webhook:
 *   post:
 *     tags: [Shipping]
 *     summary: Shiprocket webhook — shipment status updates
 *     description: >
 *       Called by Shiprocket, not app clients. Verified via a shared token in the
 *       x-api-key header (configured to match SHIPROCKET_WEBHOOK_TOKEN in Shiprocket's
 *       dashboard) when that env var is set; otherwise accepted unverified.
 *     responses:
 *       200: { description: Event recorded (or no-op if no matching shipment) }
 *       401: { description: Invalid webhook token }
 */
router.post('/webhook', controller.handleWebhook);

/**
 * @openapi
 * /shipping/serviceability:
 *   get:
 *     tags: [Shipping]
 *     summary: Can we deliver to a pincode, and roughly when — for the PDP/cart pincode check
 *     description: >
 *       Public. `weightKg` is the cart's total weight (default 0.5). Answers are cached
 *       for a few hours per pincode and weight.
 *     responses:
 *       200: { description: "{ pincode, serviceable, estimatedDays, estimatedDelivery, codAvailable }" }
 *       400: { description: Not a 6-digit pincode }
 *       502: { description: Courier lookup failed — retry }
 *       503: { description: SHIPROCKET_PICKUP_PINCODE not configured }
 */
router.get('/serviceability', validate(serviceabilityQuerySchema), controller.checkServiceability);

export default router;
