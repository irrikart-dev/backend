import { Router } from 'express';
import multer from 'multer';
import * as controller from './admin.controller.js';
import * as vendorsController from '../vendors/vendors.controller.js';
import { authenticate, loadUser, authorize } from '../../common/middlewares/auth.js';
import { validate } from '../../common/middlewares/validate.js';
import {
  createProductSchema,
  updateProductSchema,
  pricingSchema,
  stockSchema,
  createCategorySchema,
  updateCategorySchema,
  addProductImageSchema,
  createVariantSchema,
  updateVariantSchema,
} from './admin.validation.js';
import { createVendorSchema, updateVendorSchema } from '../vendors/vendors.validation.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

const router = Router();

router.use(authenticate, loadUser, authorize('ADMIN'));

/**
 * @openapi
 * /admin/uploads/image:
 *   post:
 *     tags: [Admin]
 *     summary: Upload an image to object storage
 *     description: >
 *       Accepts a single image file (multipart field "file", max 5MB) and stores it
 *       in Supabase Storage. Returns the public URL to save on a product (imageUrl)
 *       or any other record.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Image uploaded }
 *       400: { description: Missing or non-image file }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 *       403: { description: Not an admin }
 */
router.post('/uploads/image', upload.single('file'), controller.uploadImage);

/**
 * @openapi
 * /admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Dashboard stats
 *     description: >
 *       Product/category counts, inventory value, and recent activity for the admin dashboard.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Stats }
 *       401: { description: Missing, invalid, or revoked Firebase ID token }
 *       403: { description: Not an admin }
 */
router.get('/stats', controller.getStats);

router.get('/products', controller.listProducts);
router.get('/products/:id', controller.getProduct);
router.post('/products', validate(createProductSchema), controller.createProduct);
router.patch('/products/:id', validate(updateProductSchema), controller.updateProduct);
router.patch('/products/:id/pricing', validate(pricingSchema), controller.updateProductPricing);
router.patch('/products/:id/stock', validate(stockSchema), controller.updateProductStock);
router.delete('/products/:id', controller.deleteProduct);

router.post(
  '/products/:id/images',
  validate(addProductImageSchema),
  controller.addProductImage
);
router.delete('/products/:id/images/:imageId', controller.removeProductImage);

router.post('/products/:id/variants', validate(createVariantSchema), controller.createVariant);
router.patch(
  '/products/:id/variants/:variantId',
  validate(updateVariantSchema),
  controller.updateVariant
);
router.delete('/products/:id/variants/:variantId', controller.deleteVariant);

router.get('/categories', controller.listCategories);
router.post('/categories', validate(createCategorySchema), controller.createCategory);
router.patch('/categories/:id', validate(updateCategorySchema), controller.updateCategory);
router.delete('/categories/:id', controller.deleteCategory);

/**
 * @openapi
 * /admin/vendors:
 *   get:
 *     tags: [Admin]
 *     summary: List vendors
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Vendors }
 *   post:
 *     tags: [Admin]
 *     summary: Add a vendor
 *     description: >
 *       The vendor must have signed in once via Firebase already (ownerEmail looks up
 *       that existing User row). If razorpayAccountId is given, it's verified against
 *       Razorpay (accounts.fetch) before the vendor is saved — this app never creates
 *       or configures the Razorpay linked account itself, only records its id/status.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Vendor created }
 *       400: { description: Invalid body, no User for that email yet, or bad Razorpay account id }
 */
router.get('/vendors', vendorsController.listVendors);
router.get('/vendors/:id', vendorsController.getVendor);
router.post('/vendors', validate(createVendorSchema), vendorsController.createVendor);
router.patch('/vendors/:id', validate(updateVendorSchema), vendorsController.updateVendor);
router.post('/vendors/:id/route-status/refresh', vendorsController.refreshRouteStatus);

export default router;
