import { Router } from 'express';
import multer from 'multer';
import * as controller from './admin.controller.js';
import * as vendorsController from '../vendors/vendors.controller.js';
import * as ordersController from '../orders/orders.controller.js';
import * as paymentsController from '../payments/payments.controller.js';
import * as inventoryController from '../inventory/inventory.controller.js';
import { authenticate, loadUser, authorize, requirePermission } from '../../common/middlewares/auth.js';
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
  bulkUpdateProductsSchema,
  listProductsQuerySchema,
  brandSchema,
  listOrdersQuerySchema,
  orderStatusSchema,
  listPaymentsQuerySchema,
  stockAdjustmentSchema,
  createStaffSchema,
  updateStaffSchema,
} from './admin.validation.js';
import { cancelOrderSchema } from '../orders/orders.validation.js';
import { createVendorSchema, updateVendorSchema } from '../vendors/vendors.validation.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

const router = Router();

router.use(authenticate, loadUser, authorize('ADMIN', 'SUB_ADMIN'));

// per-area gates — an ADMIN passes all of them, a SUB_ADMIN only the areas in
// User.permissions. Product reads and the stock endpoint are shared with inventory
// staff, who need the product list to do their job.
const catalog = requirePermission('catalog');
const inventory = requirePermission('inventory');
router.use('/products', (req, res, next) => {
  const sharedWithInventory = req.method === 'GET' || req.path.endsWith('/stock');
  if (!sharedWithInventory) return catalog(req, res, next);
  catalog(req, res, (err) => (err ? inventory(req, res, next) : next()));
});
router.use(['/uploads', '/categories', '/brands'], catalog);
router.use('/inventory', inventory);
router.use('/orders', requirePermission('orders'));
router.use('/payments', requirePermission('payments'));
router.use('/vendors', requirePermission('vendors'));
router.use('/staff', authorize('ADMIN'));

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

router.get('/products', validate(listProductsQuerySchema), controller.listProducts);
// before /products/:id, or "bulk" would match as an id
router.patch('/products/bulk', validate(bulkUpdateProductsSchema), controller.bulkUpdateProducts);
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

router.get('/brands', controller.listBrands);
router.post('/brands', validate(brandSchema), controller.createBrand);
router.patch('/brands/:id', validate(brandSchema), controller.updateBrand);
router.delete('/brands/:id', controller.deleteBrand);

/**
 * @openapi
 * /admin/inventory/{variantId}/ledger:
 *   get:
 *     tags: [Admin]
 *     summary: Last 100 stock movements for one SKU
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Ledger rows, newest first }
 * /admin/inventory/{variantId}/adjust:
 *   post:
 *     tags: [Admin]
 *     summary: Add or remove stock with a reason (received, damaged, recount)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: New stock level }
 *       400: { description: Would take stock below what pending orders have reserved }
 */
router.get('/inventory/:variantId/ledger', inventoryController.history);
router.post('/inventory/:variantId/adjust', validate(stockAdjustmentSchema), inventoryController.adjust);

/**
 * @openapi
 * /admin/orders:
 *   get:
 *     tags: [Admin]
 *     summary: Order console — filter by status/vendor, search order number or customer
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ items, page, limit, total }" }
 * /admin/orders/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Full order detail incl. customer, payments, refunds, shipment
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Order }
 * /admin/orders/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Move an order one step on — CONFIRMED→PACKED→SHIPPED→DELIVERED
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Order }
 *       409: { description: Not the next step from the current status }
 * /admin/orders/{id}/cancel:
 *   post:
 *     tags: [Admin]
 *     summary: Cancel an order up to PACKED — releases/restocks stock, refunds a paid online order
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Order, plus refundStatus }
 *       409: { description: Already shipped or cancelled }
 */
router.get('/orders', validate(listOrdersQuerySchema), ordersController.listForAdmin);
router.get('/orders/:id', ordersController.getForAdmin);
router.patch('/orders/:id/status', validate(orderStatusSchema), ordersController.updateStatusForAdmin);
router.post('/orders/:id/cancel', validate(cancelOrderSchema), ordersController.cancelForAdmin);
router.get('/orders/:id/invoice', ordersController.getInvoiceForAdmin);

/**
 * @openapi
 * /admin/payments:
 *   get:
 *     tags: [Admin]
 *     summary: Payment reconciliation — every gateway payment with its order, transfer and refunds
 *     description: >
 *       `summary` totals cover the whole filtered set, not just the page. `needsAttention`
 *       flags money that isn't matched: captured on a cancelled order but not refunded,
 *       or a vendor transfer that failed.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ items, page, limit, total, summary }" }
 */
router.get('/payments', validate(listPaymentsQuerySchema), paymentsController.listForAdmin);

/**
 * @openapi
 * /admin/staff:
 *   get:
 *     tags: [Admin]
 *     summary: Admins and sub-admins (ADMIN only)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Staff }
 *   post:
 *     tags: [Admin]
 *     summary: Make an existing account a sub-admin with the given areas
 *     description: The person must have signed in to the dashboard once so their account exists.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Sub-admin }
 *       400: { description: No account for that email }
 *       409: { description: Account is already staff or a vendor }
 */
router.get('/staff', controller.listStaff);
router.post('/staff', validate(createStaffSchema), controller.addStaff);
router.patch('/staff/:id', validate(updateStaffSchema), controller.updateStaff);
router.delete('/staff/:id', controller.removeStaff);

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
