import { Router } from 'express';
import * as controller from './shipping.controller.js';

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

export default router;
