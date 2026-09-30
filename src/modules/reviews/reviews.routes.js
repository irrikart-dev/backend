import { Router } from 'express';
import * as controller from './reviews.controller.js';
import { authenticate, loadUser } from '../../common/middlewares/auth.js';
import { validate } from '../../common/middlewares/validate.js';
import { submitReviewSchema } from './reviews.validation.js';

const router = Router();

/**
 * @openapi
 * /reviews/product/{productId}:
 *   get:
 *     tags: [Reviews]
 *     summary: List a product's approved reviews
 *     description: Public. Newest first.
 *     responses:
 *       200: { description: Reviews }
 */
router.get('/product/:productId', controller.listForProduct);

/**
 * @openapi
 * /reviews:
 *   post:
 *     tags: [Reviews]
 *     summary: Submit a review for a purchased order item
 *     description: >
 *       Gated to an order item on the caller's own order, with that order past PLACED
 *       (i.e. actually paid). One review per order item. Auto-approved — no moderation
 *       queue yet — and recomputes the product's rating/reviewCount immediately.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Review created }
 *       400: { description: Order not paid yet }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 *       404: { description: Order item not found }
 *       409: { description: Already reviewed }
 */
router.post('/', authenticate, loadUser, validate(submitReviewSchema), controller.submitReview);

export default router;
