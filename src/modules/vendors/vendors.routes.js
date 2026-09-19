import { Router } from 'express';
import * as controller from './vendors.controller.js';
import { authenticate, loadUser, authorize, loadVendor } from '../../common/middlewares/auth.js';
import { validate } from '../../common/middlewares/validate.js';
import { vendorCreateProductSchema } from './vendors.validation.js';
import { updateProductSchema } from '../admin/admin.validation.js';

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

router.get('/payouts', controller.listMyPayouts);

export default router;
