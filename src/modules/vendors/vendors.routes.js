import { Router } from 'express';
import * as controller from './vendors.controller.js';
import { authenticate, loadUser, authorize, loadVendor } from '../../common/middlewares/auth.js';
import { validate } from '../../common/middlewares/validate.js';
import { vendorCreateProductSchema } from './vendors.validation.js';
import { updateProductSchema } from '../admin/admin.validation.js';
import * as ordersController from '../orders/orders.controller.js';
import { cancelOrderSchema, vendorOrderStatusSchema } from '../orders/orders.validation.js';

const router = Router();

// vendor self-service — admin's vendor management routes live under /admin/vendors
// instead (see admin.routes.js), same split as every other admin-vs-caller pair here
router.use(authenticate, loadUser, authorize('VENDOR'), loadVendor);

/**
 * @openapi
 * /vendor/me:
 *   get:
 *     tags: [Vendors]
 *     summary: The caller's own vendor profile
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Vendor profile }
 *       403: { description: Not a vendor, or vendor account suspended }
 */
router.get('/me', controller.getMe);

router.get('/products', controller.listMyProducts);
router.get('/products/:id', controller.getMyProduct);
router.post('/products', validate(vendorCreateProductSchema), controller.createMyProduct);
router.patch('/products/:id', validate(updateProductSchema), controller.updateMyProduct);
router.delete('/products/:id', controller.deleteMyProduct);

router.get('/orders', controller.listMyOrders);
router.get('/orders/:id', controller.getMyOrder);

/**
 * @openapi
 * /vendor/orders/{id}/accept:
 *   post:
 *     tags: [Vendor]
 *     summary: Accept a new paid order — required before it can be packed
 *     responses:
 *       200: { description: Order }
 *       409: { description: Not a new CONFIRMED order }
 * /vendor/orders/{id}/reject:
 *   post:
 *     tags: [Vendor]
 *     summary: Reject a new order you can't fulfil — cancels it and refunds the customer
 *     responses:
 *       200: { description: Cancelled order, plus refundStatus }
 *       409: { description: Already accepted, or not a new order }
 * /vendor/orders/{id}/status:
 *   patch:
 *     tags: [Vendor]
 *     summary: Mark an accepted order PACKED, then SHIPPED
 *     responses:
 *       200: { description: Order }
 *       409: { description: Not accepted yet, or not the next step }
 */
router.post('/orders/:id/accept', ordersController.acceptForVendor);
router.post('/orders/:id/reject', validate(cancelOrderSchema), ordersController.rejectForVendor);
router.patch('/orders/:id/status', validate(vendorOrderStatusSchema), ordersController.updateStatusForVendor);

router.get('/payouts', controller.listMyPayouts);

export default router;
