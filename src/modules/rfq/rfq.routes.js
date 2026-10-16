import { Router } from 'express';
import * as controller from './rfq.controller.js';
import { authenticate, loadUser } from '../../common/middlewares/auth.js';
import { validate } from '../../common/middlewares/validate.js';
import { createRfqSchema } from './rfq.validation.js';

const router = Router();

router.use(authenticate, loadUser);

/**
 * @openapi
 * /rfq:
 *   post:
 *     tags: [RFQ]
 *     summary: Request a bulk quote — staff follow up by email/phone
 *     description: >
 *       Body { productId?, quantity, requirements?, targetPrice? }. Needs a productId,
 *       requirements, or both. A hidden or unsellable product is a 404.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Quote request, status NEW }
 *       400: { description: Invalid body, or neither productId nor requirements }
 *       404: { description: Product not found }
 *   get:
 *     tags: [RFQ]
 *     summary: The caller's own quote requests with status, newest first
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Quote requests }
 */
router.post('/', validate(createRfqSchema), controller.create);
router.get('/', controller.listMine);

export default router;
