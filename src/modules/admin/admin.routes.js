import { Router } from 'express';
import * as controller from './admin.controller.js';
import * as vendorsController from '../vendors/vendors.controller.js';
import * as ordersController from '../orders/orders.controller.js';
import * as paymentsController from '../payments/payments.controller.js';
import * as inventoryController from '../inventory/inventory.controller.js';
import * as discountsController from '../discounts/discounts.controller.js';
import * as rfqController from '../rfq/rfq.controller.js';
import * as reviewsController from '../reviews/reviews.controller.js';
import * as returnsController from '../returns/returns.controller.js';
import * as shippingController from '../shipping/shipping.controller.js';
import { authenticate, loadUser, authorize, requirePermission } from '../../common/middlewares/auth.js';
import { validate } from '../../common/middlewares/validate.js';
import { imageUpload } from '../../common/middlewares/upload.js';
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
  createBannerSchema,
  updateBannerSchema,
  listOrdersQuerySchema,
  orderStatusSchema,
  listPaymentsQuerySchema,
  stockAdjustmentSchema,
  createStaffSchema,
  updateStaffSchema,
  listCustomersQuerySchema,
  customerStatusSchema,
} from './admin.validation.js';
import { createCouponSchema, updateCouponSchema } from '../discounts/discounts.validation.js';
import { listRfqQuerySchema, updateRfqSchema } from '../rfq/rfq.validation.js';
import { listReviewsQuerySchema, reviewStatusSchema } from '../reviews/reviews.validation.js';
import {
  listReturnsQuerySchema,
  approveReturnSchema,
  rejectReturnSchema,
  completeReturnSchema,
} from '../returns/returns.validation.js';
import { listRefundsQuerySchema, manualRefundSchema } from '../payments/payments.validation.js';
import { cancelOrderSchema } from '../orders/orders.validation.js';
import { createVendorSchema, updateVendorSchema } from '../vendors/vendors.validation.js';

const router = Router();

router.use(authenticate, loadUser, authorize('ADMIN', 'SUB_ADMIN'));

// per-area gates — an ADMIN passes all of them, a SUB_ADMIN only the areas in
// User.permissions. Product reads and the stock endpoint are shared with inventory
// staff, who need the product list to do their job.
const catalog = requirePermission('catalog');
const inventory = requirePermission('inventory');
const catalogOrInventory = (req, res, next) => catalog(req, res, (err) => (err ? inventory(req, res, next) : next()));
router.use('/products', (req, res, next) => {
  const sharedWithInventory = req.method === 'GET' || req.path.endsWith('/stock');
  return sharedWithInventory ? catalogOrInventory(req, res, next) : catalog(req, res, next);
});
// catalogue counts and inventory value — nothing an orders/payments-only sub-admin needs
router.use('/stats', catalogOrInventory);
router.use(['/uploads', '/categories', '/brands', '/banners', '/reviews'], catalog);
router.use('/inventory', inventory);
router.use(['/orders', '/rfq', '/returns', '/shipments'], requirePermission('orders'));
router.use(['/payments', '/refunds'], requirePermission('payments'));
router.use('/vendors', requirePermission('vendors'));
router.use(['/staff', '/customers', '/coupons'], authorize('ADMIN'));

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
router.post('/uploads/image', imageUpload, controller.uploadImage);

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

router.get('/banners', controller.listBanners);
router.post('/banners', validate(createBannerSchema), controller.createBanner);
router.patch('/banners/:id', validate(updateBannerSchema), controller.updateBanner);
router.delete('/banners/:id', controller.deleteBanner);

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
router.post('/orders/:id/shipment', shippingController.bookForAdmin);
router.post('/orders/:id/rto-received', returnsController.receiveRto);

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
router.get('/refunds', validate(listRefundsQuerySchema), paymentsController.listRefundsForAdmin);
router.post('/refunds', validate(manualRefundSchema), paymentsController.refundForAdmin);

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
// before /vendors/:id, or "performance" would match as an id
router.get('/vendors/performance', vendorsController.listPerformance);
router.get('/vendors/:id', vendorsController.getVendor);
router.post('/vendors', validate(createVendorSchema), vendorsController.createVendor);
router.patch('/vendors/:id', validate(updateVendorSchema), vendorsController.updateVendor);
router.post('/vendors/:id/route-status/refresh', vendorsController.refreshRouteStatus);

/**
 * @openapi
 * /admin/vendors/performance:
 *   get:
 *     tags: [Admin]
 *     summary: Per-vendor rating, order counts, GMV, rejection and return rates
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: One row per vendor with any orders or reviews }
 * /admin/customers:
 *   get:
 *     tags: [Admin]
 *     summary: Customer accounts — search name/phone/email, filter by status (ADMIN only)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ items, page, limit, total }" }
 * /admin/customers/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: One customer with addresses and their last 20 orders
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Customer }
 * /admin/customers/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Block or unblock a customer — a blocked account gets 403 on every signed-in request
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Customer }
 * /admin/coupons:
 *   get:
 *     tags: [Admin]
 *     summary: Coupons with usage analytics (uses, unique customers, discount given, revenue)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Coupons }
 *   post:
 *     tags: [Admin]
 *     summary: Create a coupon — code is stored upper-case, matched case-insensitively at checkout
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Coupon }
 *       409: { description: Code already exists }
 * /admin/coupons/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete an unused coupon
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Deleted }
 *       409: { description: Coupon has been used — deactivate it instead }
 */
router.get('/customers', validate(listCustomersQuerySchema), controller.listCustomers);
router.get('/customers/:id', controller.getCustomer);
router.patch('/customers/:id/status', validate(customerStatusSchema), controller.setCustomerStatus);

router.get('/coupons', discountsController.listCoupons);
router.post('/coupons', validate(createCouponSchema), discountsController.createCoupon);
router.patch('/coupons/:id', validate(updateCouponSchema), discountsController.updateCoupon);
router.delete('/coupons/:id', discountsController.deleteCoupon);

/**
 * @openapi
 * /admin/rfq:
 *   get:
 *     tags: [Admin]
 *     summary: Quote-request inbox — filter by status, search customer/product/requirements
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ items, page, limit, total }" }
 * /admin/rfq/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: One quote request with customer contact details
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Quote request }
 *   patch:
 *     tags: [Admin]
 *     summary: Set status (NEW, CONTACTED, CLOSED) and/or the internal follow-up note
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Quote request }
 */
router.get('/rfq', validate(listRfqQuerySchema), rfqController.listForAdmin);
router.get('/rfq/:id', rfqController.getForAdmin);
router.patch('/rfq/:id', validate(updateRfqSchema), rfqController.updateForAdmin);

/**
 * @openapi
 * /admin/reviews:
 *   get:
 *     tags: [Admin]
 *     summary: Review moderation queue — filter by status/rating, search comment/product/customer
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ items, page, limit, total }" }
 * /admin/reviews/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Approve or reject (hide) a review — recomputes the product and vendor rating
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Review }
 *       404: { description: Review not found }
 */
router.get('/reviews', validate(listReviewsQuerySchema), reviewsController.listForAdmin);
router.patch('/reviews/:id', validate(reviewStatusSchema), reviewsController.setStatusForAdmin);

/**
 * @openapi
 * /admin/returns:
 *   get:
 *     tags: [Admin]
 *     summary: Return/replacement requests — filter by status, search reason/order/customer
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ items, page, limit, total }" }
 * /admin/returns/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: One return request, with the pro-rata `suggestedRefund`
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Return request }
 * /admin/returns/{id}/approve:
 *   post:
 *     tags: [Admin]
 *     summary: Accept a return — staff arrange the pickup
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Return request }
 * /admin/returns/{id}/reject:
 *   post:
 *     tags: [Admin]
 *     summary: Turn a return down — `note` is shown to the customer
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Return request }
 * /admin/returns/{id}/complete:
 *   post:
 *     tags: [Admin]
 *     summary: Goods received — restock (default) and refund (pro-rata unless `refundAmount` is given)
 *     description: >
 *       The order becomes RETURNED once every unit on it is back. COD refunds are
 *       recorded as `manual` — pay them back outside the gateway.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Return request, with refundStatus }
 * /admin/shipments:
 *   get:
 *     tags: [Admin]
 *     summary: Shipping issues — RTO/failed parcels, and paid orders whose courier booking failed
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ shipments, unbooked }" }
 * /admin/orders/{id}/shipment:
 *   post:
 *     tags: [Admin]
 *     summary: Retry booking the Shiprocket shipment for a paid order
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Shipment }
 *       502: { description: Shiprocket rejected it — message says why }
 * /admin/orders/{id}/rto-received:
 *   post:
 *     tags: [Admin]
 *     summary: Undelivered parcel is back — order RETURNED, stock restored, online payment refunded
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ orderId, status, refundStatus }" }
 *       409: { description: Courier hasn't reported RTO/failure, or order not in transit }
 * /admin/refunds:
 *   get:
 *     tags: [Admin]
 *     summary: Every refund with its order and gateway status, plus per-status totals
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ items, page, limit, total, summary }" }
 *   post:
 *     tags: [Admin]
 *     summary: Manual refund of an order's online payment — full (default) or partial
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: "{ status, amount }" }
 *       409: { description: No captured payment, or already fully refunded }
 *       502: { description: Gateway rejected it — message says why }
 */
router.get('/returns', validate(listReturnsQuerySchema), returnsController.listForAdmin);
router.get('/returns/:id', returnsController.getForAdmin);
router.post('/returns/:id/approve', validate(approveReturnSchema), returnsController.approve);
router.post('/returns/:id/reject', validate(rejectReturnSchema), returnsController.reject);
router.post('/returns/:id/complete', validate(completeReturnSchema), returnsController.complete);
router.get('/shipments', shippingController.listIssuesForAdmin);

export default router;
