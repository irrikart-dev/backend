import { Router } from 'express';
import * as controller from './wallet.controller.js';
import { authenticate, loadUser } from '../../common/middlewares/auth.js';

const router = Router();

/**
 * @openapi
 * /wallet:
 *   get:
 *     tags: [Wallet]
 *     summary: The caller's wallet — balance and latest 50 changes
 *     description: Refunds are credited here (store credit), not to the original payment method.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ balance, currency, transactions: [{ id, amount, balanceAfter, type, reason, order, createdAt }] }" }
 */
router.get('/', authenticate, loadUser, controller.getMine);

export default router;
