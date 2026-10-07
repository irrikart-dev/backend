// End-to-end check of checkout → payment → fulfilment → cancellation/refund, plus the
// catalog/cart/inventory/staff pieces they lean on. Talks to the DB directly through the
// services, with the payment gateway stubbed and all outbound HTTP (Shiprocket) blocked.
//
// Writes rows, so it refuses to run against anything but a local database:
//   DATABASE_URL=postgresql://postgres@localhost:5432/irrikart_test \
//   DIRECT_URL=$DATABASE_URL RAZORPAY_KEY_ID=x RAZORPAY_KEY_SECRET=x COD_MAX_ORDER_AMOUNT=1000 \
//   node scripts/check-order-flows.js
import assert from 'node:assert/strict';
import axios from 'axios';

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '')) {
  console.error('Refusing to run: DATABASE_URL must point at a local database.');
  process.exit(1);
}

// before any module creates its axios instance — instances copy the default adapter
axios.defaults.adapter = async () => {
  throw new Error('outbound HTTP disabled in check-order-flows');
};

const { prisma } = await import('../src/config/db.js');
const { paymentProvider } = await import('../src/modules/payments/providers/index.js');
const orders = await import('../src/modules/orders/orders.service.js');
const payments = await import('../src/modules/payments/payments.service.js');
const cart = await import('../src/modules/cart/cart.service.js');
const catalog = await import('../src/modules/catalog/catalog.service.js');
const inventory = await import('../src/modules/inventory/inventory.service.js');
const admin = await import('../src/modules/admin/admin.service.js');
const { renderInvoice } = await import('../src/modules/orders/orders.invoice.js');
const { requirePermission } = await import('../src/common/middlewares/auth.js');

// ---- gateway stub (ids carry the run's tag so reruns on the same DB don't collide) ----
const tag = Date.now().toString(36);
const refunds = [];
let seq = 0;
Object.assign(paymentProvider, {
  createOrder: async ({ amount }) => ({ id: `order_${tag}_${++seq}`, amount }),
  createCustomer: async () => `cust_${tag}_${++seq}`,
  refund: async (paymentId, opts) => {
    refunds.push({ paymentId, ...opts });
    return { id: `rfnd_${tag}_${++seq}`, status: 'processed' };
  },
  verifyWebhookSignature: () => true,
});
const webhook = (event, providerOrderId, paymentId) =>
  payments.handleWebhookEvent(Buffer.from('{}'), 'sig', {
    event,
    payload: { payment: { entity: { id: paymentId, order_id: providerOrderId, method: 'upi' } } },
  });

const variantRow = (id) => prisma.productVariant.findUnique({ where: { id } });

// ---- fixtures ----
const user = await prisma.user.create({ data: { firebaseUid: `fb-${tag}`, email: `c-${tag}@x.in`, name: 'Cust' } });
const ownerUser = await prisma.user.create({ data: { firebaseUid: `fbv-${tag}`, email: `v-${tag}@x.in`, role: 'VENDOR' } });
const vendor = await prisma.vendor.create({ data: { storeName: 'Store', slug: `store-${tag}`, ownerUserId: ownerUser.id } });
const otherVendor = await prisma.vendor.create({ data: { storeName: 'Other', slug: `other-${tag}` } });
const category = await prisma.category.create({ data: { name: 'Cat', slug: `cat-${tag}` } });
const address = await prisma.address.create({
  data: { userId: user.id, name: 'Cust', phone: '9999999999', line1: 'L1', city: 'Pune', state: 'MH', pincode: '411001' },
});

const brand = await catalog.createBrand({ name: `Brand ${tag}` });
const cheap = await catalog.createProduct({ vendorId: vendor.id, category: category.id, name: `Cheap ${tag}`, price: 100, stockQty: 50, brandId: brand.id });
const pricey = await catalog.createProduct({ vendorId: vendor.id, category: category.id, name: `Pricey ${tag}`, price: 900, stockQty: 5 });
const draft = await catalog.createProduct({ vendorId: vendor.id, category: category.id, name: `Draft ${tag}`, price: 50, status: 'DRAFT' });
const foreign = await catalog.createProduct({ vendorId: otherVendor.id, category: category.id, name: `Foreign ${tag}`, price: 10, stockQty: 5 });

// ---- catalog: filters, sort, status, brands ----
const list = (q) => catalog.listPublicProducts({ page: 1, limit: 50, categoryId: category.id, ...q });
assert.deepEqual((await list({ sort: 'price_asc' })).items.map((p) => p.name), [`Foreign ${tag}`, `Cheap ${tag}`, `Pricey ${tag}`]);
assert.deepEqual((await list({ sort: 'price_desc' })).items.map((p) => p.price), [900, 100, 10]);
assert.equal((await list({ minPrice: 50, maxPrice: 500 })).total, 1);
assert.equal((await list({ brandId: brand.id })).items[0].brandName, brand.name);
assert.equal((await list({ vendorId: otherVendor.id })).total, 1);
assert.ok(!(await list({})).items.some((p) => p.id === draft.id), 'draft product listed');
await assert.rejects(catalog.getPublicProduct(draft.id), /not found/i);
await assert.rejects(catalog.deleteBrand(brand.id), /1 product/);
assert.equal((await catalog.bulkUpdateProducts({ ids: [draft.id], status: 'ARCHIVED' })).updated, 1);

// ---- wishlist / recently viewed ----
await catalog.addToWishlist(user.id, cheap.id);
await catalog.addToWishlist(user.id, cheap.id);
assert.equal((await catalog.listWishlist(user.id)).length, 1);
await assert.rejects(catalog.addToWishlist(user.id, draft.id), /not found/i);
await catalog.recordView(user.id, cheap.id);
await catalog.recordView(user.id, pricey.id);
await catalog.recordView(user.id, cheap.id);
assert.deepEqual((await catalog.listRecentlyViewed(user.id)).map((p) => p.id), [cheap.id, pricey.id]);

// ---- guest cart merge ----
const merged = await cart.mergeItems(user.id, [
  { variantId: cheap.variantId, quantity: 2 },
  { variantId: foreign.variantId, quantity: 1 },
  { variantId: pricey.variantId, quantity: 99 },
]);
assert.equal(merged.cart.itemCount, 2);
assert.equal(merged.skipped.length, 2);

// ---- COD: confirmed at once, stock taken, cart converted; limit enforced ----
const cod = await orders.checkout(user, { addressId: address.id, paymentMethod: 'COD' });
assert.equal(cod.status, 'CONFIRMED');
assert.equal((await variantRow(cheap.variantId)).stock, 48);
assert.equal((await cart.getCart(user.id)).itemCount, 0);
await cart.addItem(user.id, { variantId: pricey.variantId, quantity: 5 });
await assert.rejects(orders.checkout(user, { addressId: address.id, paymentMethod: 'COD' }), /Cash on delivery is available on orders up to/);

// ---- online: failed attempt keeps the order payable, retry captures it ----
const online = await orders.checkout(user, { addressId: address.id });
assert.ok(online.customerId?.startsWith('cust_'));
assert.equal((await variantRow(pricey.variantId)).reserved, 5);
await webhook('payment.failed', online.providerOrderId, `pay_fail_${tag}`);
let o = await orders.getOrder(user.id, online.orderId);
assert.equal(o.status, 'PAYMENT_FAILED');
assert.equal(o.paymentStatus, 'FAILED');
assert.equal((await variantRow(pricey.variantId)).reserved, 5, 'failed payment released the stock hold');
assert.equal((await orders.payOrder(user, online.orderId)).providerOrderId, online.providerOrderId);
await webhook('payment.captured', online.providerOrderId, `pay_ok_${tag}`);
o = await orders.getOrder(user.id, online.orderId);
assert.equal(o.status, 'CONFIRMED');
assert.equal(o.paymentStatus, 'CAPTURED');
assert.deepEqual(await variantRow(pricey.variantId).then((v) => [v.stock, v.reserved]), [0, 0]);

// ---- invoice ----
const pdf = await renderInvoice(await orders.getOrderForInvoice(online.orderId, { userId: user.id }));
assert.equal(pdf.subarray(0, 4).toString(), '%PDF');

// ---- customer cancels a paid order: restock + full refund ----
const cancelled = await orders.cancelOrderByCustomer(user.id, online.orderId, { reason: 'changed my mind' });
assert.equal(cancelled.status, 'CANCELLED');
assert.equal(cancelled.refundStatus, 'processed');
assert.equal(refunds.at(-1).amount, 4500 * 100);
assert.equal((await variantRow(pricey.variantId)).stock, 5);
await assert.rejects(orders.getOrderForInvoice(online.orderId, { userId: user.id }), /No invoice/);

// ---- a failed-payment order can be cancelled; its hold is released, nothing refunded ----
await cart.addItem(user.id, { variantId: cheap.variantId, quantity: 4 });
const failedThenCancelled = await orders.checkout(user, { addressId: address.id });
await webhook('payment.failed', failedThenCancelled.providerOrderId, `pay_f2_${tag}`);
const refundsBefore = refunds.length;
assert.equal((await orders.cancelOrderByCustomer(user.id, failedThenCancelled.orderId, { reason: 'gave up' })).refundStatus, null);
assert.equal(refunds.length, refundsBefore);
assert.equal((await variantRow(cheap.variantId)).reserved, 0);
await assert.rejects(orders.payOrder(user, failedThenCancelled.orderId), /cancelled/);

// ---- unpaid order expires, a late payment is refunded ----
await cart.addItem(user.id, { variantId: cheap.variantId, quantity: 1 });
const stale = await orders.checkout(user, { addressId: address.id });
await prisma.order.update({ where: { id: stale.orderId }, data: { createdAt: new Date(Date.now() - 3600_000) } });
await orders.expireStaleOrders();
assert.equal((await orders.getOrder(user.id, stale.orderId)).status, 'CANCELLED');
assert.equal((await variantRow(cheap.variantId)).reserved, 0);
const refundCount = refunds.length;
await webhook('payment.captured', stale.providerOrderId, `pay_late_${tag}`);
assert.equal(refunds.length, refundCount + 1, 'late capture not refunded');

// ---- vendor flow: accept → pack → ship, admin delivers; reject refunds ----
await cart.addItem(user.id, { variantId: cheap.variantId, quantity: 1 });
const v1 = await orders.checkout(user, { addressId: address.id, paymentMethod: 'COD' });
await assert.rejects(orders.advanceOrderForVendor(vendor.id, v1.orderId, 'PACKED'), /Accept the order first/);
await orders.acceptOrder(vendor.id, v1.orderId);
await assert.rejects(orders.rejectOrder(vendor.id, v1.orderId, { reason: 'nope' }), /haven't accepted/);
await assert.rejects(orders.advanceOrderForVendor(vendor.id, v1.orderId, 'SHIPPED'), /Can't move/);
await orders.advanceOrderForVendor(vendor.id, v1.orderId, 'PACKED');
await orders.advanceOrderForVendor(vendor.id, v1.orderId, 'SHIPPED');
assert.equal((await orders.advanceOrderForAdmin(v1.orderId, 'DELIVERED')).status, 'DELIVERED');
await assert.rejects(orders.cancelOrderByAdmin(v1.orderId, { reason: 'too late' }), /can't be cancelled/);
await assert.rejects(orders.getOrderForVendor(otherVendor.id, v1.orderId), /not found/i);

await cart.addItem(user.id, { variantId: cheap.variantId, quantity: 3 });
const v2 = await orders.checkout(user, { addressId: address.id, paymentMethod: 'COD' });
const before = (await variantRow(cheap.variantId)).stock;
assert.equal((await orders.rejectOrder(vendor.id, v2.orderId, { reason: 'out of stock' })).status, 'CANCELLED');
assert.equal((await variantRow(cheap.variantId)).stock, before + 3);

// ---- reorder ----
const re = await orders.reorder(user.id, v2.orderId);
assert.equal(re.cart.itemCount, 3);
await cart.clearCart(user.id);

// ---- admin console ----
const adminList = await orders.listOrdersForAdmin({ page: 1, limit: 50, search: user.email });
assert.equal(adminList.total, 6);
const detail = await orders.getOrderForAdmin(online.orderId);
assert.equal(detail.payments[0].refunds.length, 1);
const recon = await payments.listPaymentsForAdmin({ page: 1, limit: 50, search: online.orderNumber });
assert.equal(recon.items[0].refunded, 4500);
assert.equal(recon.items[0].needsAttention, false);

// ---- manual stock adjustment can't eat into reserved stock ----
await cart.addItem(user.id, { variantId: cheap.variantId, quantity: 2 });
await orders.checkout(user, { addressId: address.id });
const v = await variantRow(cheap.variantId);
await assert.rejects(inventory.adjustStock(cheap.variantId, { delta: -(v.stock - 1), note: 'x' }, user.id), /reserved/);
await inventory.adjustStock(cheap.variantId, { delta: 10, note: 'received' }, user.id);
assert.equal((await inventory.history(cheap.variantId))[0].note, 'received');
await assert.rejects(catalog.updateProductStock(cheap.id, { stock: 1 }), /reserved/);

// ---- staff / RBAC ----
const staffUser = await prisma.user.create({ data: { firebaseUid: `fbs-${tag}`, email: `s-${tag}@x.in` } });
const staff = await admin.addStaff({ email: staffUser.email, permissions: ['orders'] });
assert.equal(staff.role, 'SUB_ADMIN');
await assert.rejects(admin.addStaff({ email: ownerUser.email, permissions: ['orders'] }), /already a vendor/);
const gate = (perm, u) => new Promise((resolve) => requirePermission(perm)({ user: u }, {}, (err) => resolve(!err)));
assert.equal(await gate('orders', staff), true);
assert.equal(await gate('catalog', staff), false);
assert.equal(await gate('catalog', { role: 'ADMIN', permissions: [] }), true);
await admin.removeStaff(staff.id);
assert.equal((await prisma.user.findUnique({ where: { id: staff.id } })).role, 'CUSTOMER');

console.log('order flows: OK');
await prisma.$disconnect();
process.exit(0);
