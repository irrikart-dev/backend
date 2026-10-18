import { Router } from 'express';
import * as controller from './discounts.controller.js';
import { authenticate, loadUser } from '../../common/middlewares/auth.js';

const router = Router();

/**
 * @openapi
 * /discounts/offers:
 *   get:
 *     tags: [Discounts]
 *     summary: Coupons the caller can use right now — listed offers plus any issued to them
 *     description: >
 *       Already filters out expired, used-up and first-order-only coupons the caller no
 *       longer qualifies for. Apply one by passing `code` as couponCode at checkout.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "[{ code, description, type, value, minCartValue, expiresAt, firstOrderOnly, personal }]" }
 */
router.get('/offers', authenticate, loadUser, controller.listOffers);

export default router;
