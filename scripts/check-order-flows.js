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
const reviews = await import('../src/modules/reviews/reviews.service.js');
const returns = await import('../src/modules/returns/returns.service.js');
const shipping = await import('../src/modules/shipping/shipping.service.js');
const notifications = await import('../src/modules/notifications/notifications.service.js');
const { push } = await import('../src/modules/notifications/channels/push.channel.js');
const settings = await import('../src/modules/settings/settings.service.js');
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
// ---- push stub: tokens starting "dead" come back as uninstalled ----
const pushes = [];
push.sendToTokens = async (tokens, message) => {
  pushes.push({ tokens, message });
  const deadTokens = tokens.filter((t) => t.startsWith('dead'));
  return { sent: tokens.length - deadTokens.length, failed: deadTokens.length, deadTokens };
};
const webhook = (event, providerOrderId, paymentId) =>
  payments.handleWebhookEvent(Buffer.from('{}'), 'sig', {
    event,
    payload: { payment: { entity: { id: paymentId, order_id: providerOrderId, method: 'upi' } } },
  });

const variantRow = (id) => prisma.productVariant.findUnique({ where: { id } });

// ---- fixtures ----
// delivery free while the flows below run (a crashed earlier run may have left fee rules behind)
await settings.updateShippingRules({ freeShippingAbove: null, shippingSlabs: [] });
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
// a hidden product can't be carted
await assert.rejects(cart.addItem(user.id, { variantId: draft.variantId, quantity: 1 }), /no longer available/i);
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
assert.ok(!('vendorAmount' in o) && !('platformAmount' in o), 'commission split leaked to customer');
assert.equal(typeof (await orders.getOrderForAdmin(online.orderId)).vendorAmount, 'number');
assert.deepEqual(await variantRow(pricey.variantId).then((v) => [v.stock, v.reserved]), [0, 0]);

// ---- invoice ----
const pdf = await renderInvoice(await orders.getOrderForInvoice(online.orderId, { userId: user.id }));
assert.equal(pdf.subarray(0, 4).toString(), '%PDF');

// ---- customer cancels a paid order: restock + full refund ----
const cancelled = await orders.cancelOrderByCustomer(user.id, online.orderId, { reason: 'changed my mind' });
assert.equal(cancelled.status, 'CANCELLED');
assert.equal(cancelled.refundStatus, 'processed');
assert.equal(refunds.at(-1).amount, 4500 * 100);
assert.deepEqual(cancelled.refunds.map((r) => [r.amount, r.status]), [[4500, 'processed']]);
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

// ---- review moderation: hiding a review takes it out of the product rating ----
const v1Item = (await orders.getOrder(user.id, v1.orderId)).items[0];
await reviews.submitReview(user.id, { orderItemId: v1Item.id, rating: 4, comment: 'good' });
const [queued] = (await reviews.listForAdmin({ search: cheap.name, page: 1, limit: 5 })).items;
assert.equal(queued.status, 'APPROVED');
await reviews.setStatusForAdmin(queued.id, 'REJECTED');
assert.equal((await prisma.product.findUnique({ where: { id: cheap.id } })).reviewCount, 0);
assert.equal((await reviews.listForProduct(cheap.id)).length, 0);
await reviews.setStatusForAdmin(queued.id, 'APPROVED');
assert.equal((await prisma.product.findUnique({ where: { id: cheap.id } })).rating, 4);

await cart.addItem(user.id, { variantId: cheap.variantId, quantity: 3 });
const v2 = await orders.checkout(user, { addressId: address.id, paymentMethod: 'COD' });
const before = (await variantRow(cheap.variantId)).stock;
assert.equal((await orders.rejectOrder(vendor.id, v2.orderId, { reason: 'out of stock' })).status, 'CANCELLED');
assert.equal((await variantRow(cheap.variantId)).stock, before + 3);

// ---- returns: one open request per order, COD refund is manual, full return → RETURNED ----
assert.ok((await orders.getOrder(user.id, v1.orderId)).returnableUntil, 'delivered order has no return window');
const ret = (orderId, extra = {}) => returns.requestReturn(user.id, { orderId, type: 'RETURN', reason: 'damaged', photoUrls: [], ...extra });
await assert.rejects(ret(v1.orderId, { items: [{ orderItemId: v1Item.id, quantity: v1Item.quantity + 1 }] }), /can still be returned/);
const rq = await ret(v1.orderId);
await assert.rejects(ret(v1.orderId), /already in progress/);
let shelf = (await variantRow(cheap.variantId)).stock;
const rqDone = await returns.complete(rq.id, {});
assert.deepEqual([rqDone.status, rqDone.refundStatus, rqDone.refundAmount], ['COMPLETED', 'manual', v1Item.totalPrice]);
assert.equal((await variantRow(cheap.variantId)).stock, shelf + v1Item.quantity);
assert.equal((await orders.getOrder(user.id, v1.orderId)).status, 'RETURNED');
await assert.rejects(ret(v1.orderId), /Only a delivered order/);

// ---- partial return of a couponed online order is refunded pro rata; then manual refunds ----
async function deliveredOnline(lines, couponCode) {
  for (const l of lines) await cart.addItem(user.id, l);
  const placed = await orders.checkout(user, { addressId: address.id, couponCode });
  await webhook('payment.captured', placed.providerOrderId, `pay_${placed.orderNumber}`);
  await orders.acceptOrder(vendor.id, placed.orderId);
  await orders.advanceOrderForVendor(vendor.id, placed.orderId, 'PACKED');
  await orders.advanceOrderForVendor(vendor.id, placed.orderId, 'SHIPPED');
  await orders.advanceOrderForAdmin(placed.orderId, 'DELIVERED');
  return orders.getOrder(user.id, placed.orderId);
}
await prisma.coupon.create({ data: { code: `TEN${tag}`.toUpperCase(), type: 'PERCENT', value: 10 } });
const mixed = await deliveredOnline(
  [{ variantId: cheap.variantId, quantity: 2 }, { variantId: pricey.variantId, quantity: 1 }],
  `TEN${tag}`
);
assert.equal(mixed.amount, 990);
const priceyLine = mixed.items.find((i) => i.variantId === pricey.variantId);
const partial = await ret(mixed.id, { type: 'RETURN', items: [{ orderItemId: priceyLine.id, quantity: 1 }] });
assert.equal((await returns.getForAdmin(partial.id)).suggestedRefund, 810);
await returns.approve(partial.id, { note: 'pickup booked' });
const partialDone = await returns.complete(partial.id, { restock: false });
assert.deepEqual([partialDone.refundAmount, partialDone.refundStatus], [810, 'processed']);
assert.equal(refunds.at(-1).amount, 810 * 100);
assert.equal((await orders.getOrder(user.id, mixed.id)).status, 'DELIVERED', 'partial return closed the order');

await assert.rejects(payments.refundOrderByAdmin({ orderId: mixed.id, amount: 200, reason: 'goodwill' }), /Only ₹180/);
assert.equal((await payments.refundOrderByAdmin({ orderId: mixed.id, amount: 80, reason: 'goodwill' })).amount, 80);
// a refund made in the Razorpay dashboard arrives by webhook only, then settles
const dashRefund = (event, status) =>
  payments.handleWebhookEvent(Buffer.from('{}'), 'sig', {
    event,
    payload: {
      refund: { entity: { id: `rfnd_dash_${tag}`, payment_id: `pay_${mixed.orderNumber}`, amount: 5000, status } },
      payment: { entity: { id: `pay_${mixed.orderNumber}`, order_id: 'x' } },
    },
  });
await dashRefund('refund.created', 'pending');
await dashRefund('refund.processed', 'processed');
const refundList = await payments.listRefundsForAdmin({ search: mixed.orderNumber, page: 1, limit: 10 });
assert.deepEqual(refundList.items.map((r) => [r.amount, r.status]).sort(), [[50, 'processed'], [80, 'processed'], [810, 'processed']]);
assert.equal((await payments.refundOrderByAdmin({ orderId: mixed.id, reason: 'close out' })).amount, 50);
await assert.rejects(payments.refundOrderByAdmin({ orderId: mixed.id, reason: 'again' }), /refunded in full/);
await assert.rejects(returns.reject(partial.id, { note: 'too late' }), /already completed/);

// ---- courier feed moves the order; return window closes ----
await cart.addItem(user.id, { variantId: cheap.variantId, quantity: 1 });
const fed = await orders.checkout(user, { addressId: address.id, paymentMethod: 'COD' });
await prisma.shipment.create({ data: { orderId: fed.orderId, shiprocketShipmentId: `sr_fed_${tag}` } });
await shipping.recordWebhookEvent({ shipment_id: `sr_fed_${tag}`, current_status: 'IN TRANSIT' });
let fedOrder = await orders.getOrderForAdmin(fed.orderId);
assert.deepEqual([fedOrder.status, fedOrder.accepted], ['SHIPPED', true]);
await shipping.recordWebhookEvent({ shipment_id: `sr_fed_${tag}`, current_status: 'DELIVERED' });
fedOrder = await orders.getOrderForAdmin(fed.orderId);
assert.equal(fedOrder.status, 'DELIVERED');
assert.ok(fedOrder.deliveredAt);
await prisma.order.update({ where: { id: fed.orderId }, data: { deliveredAt: new Date(Date.now() - 30 * 86400_000) } });
await assert.rejects(ret(fed.orderId), /within 7 days/);

// ---- RTO: parcel comes back undelivered — order RETURNED, restocked, online payment refunded ----
await cart.addItem(user.id, { variantId: cheap.variantId, quantity: 2 });
const rto = await orders.checkout(user, { addressId: address.id });
await webhook('payment.captured', rto.providerOrderId, `pay_rto_${tag}`);
await assert.rejects(returns.receiveRto(rto.orderId), /not reported/);
await prisma.shipment.create({ data: { orderId: rto.orderId, shiprocketShipmentId: `sr_rto_${tag}` } });
await shipping.recordWebhookEvent({ shipment_id: `sr_rto_${tag}`, current_status: 'RTO' });
assert.ok((await shipping.listIssuesForAdmin()).shipments.some((x) => x.order.id === rto.orderId));
shelf = (await variantRow(cheap.variantId)).stock;
assert.deepEqual(await returns.receiveRto(rto.orderId), { orderId: rto.orderId, status: 'RETURNED', refundStatus: 'processed' });
assert.equal(refunds.at(-1).amount, 200 * 100);
assert.equal((await variantRow(cheap.variantId)).stock, shelf + 2);
await assert.rejects(returns.receiveRto(rto.orderId), /can't be marked/);

// ---- reorder ----
const re = await orders.reorder(user.id, v2.orderId);
assert.equal(re.cart.itemCount, 3);
await cart.clearCart(user.id);

// ---- coupons: first-order and personal coupons, and the offers list ----
const discounts = await import('../src/modules/discounts/discounts.service.js');
const newbie = await prisma.user.create({ data: { firebaseUid: `fbn-${tag}`, email: `n-${tag}@x.in` } });
const welcome = await discounts.createCoupon({ code: `WELCOME${tag}`, type: 'FLAT', value: 50, firstOrderOnly: true, listed: true, description: '₹50 off your first order' });
const mineOnly = await discounts.createCoupon({ code: `JUSTYOU${tag}`, type: 'PERCENT', value: 5, customerContact: newbie.email.toUpperCase() });
assert.equal(mineOnly.customer.id, newbie.id);
await assert.rejects(discounts.createCoupon({ code: `NOBODY${tag}`, type: 'FLAT', value: 5, customerContact: 'ghost@x.in' }), /No customer account/);
await assert.rejects(discounts.validateCoupon(welcome.code, { userId: user.id, cartSubtotal: 500 }), /first order/);
await assert.rejects(discounts.validateCoupon(mineOnly.code, { userId: user.id, cartSubtotal: 500 }), /not found/i);
assert.equal((await discounts.validateCoupon(mineOnly.code, { userId: newbie.id, cartSubtotal: 500 })).id, mineOnly.id);
const offerCodes = async (u) => (await discounts.listOffers(u)).map((o) => o.code);
assert.ok((await offerCodes(newbie.id)).includes(welcome.code) && (await offerCodes(newbie.id)).includes(mineOnly.code));
assert.ok(!(await offerCodes(user.id)).includes(welcome.code), 'first-order offer shown to a repeat customer');
assert.ok(!(await offerCodes(user.id)).includes(mineOnly.code), "someone else's personal coupon listed");
assert.ok(!(await offerCodes(user.id)).includes(`TEN${tag}`.toUpperCase()), 'unlisted coupon in offers');

// ---- notifications: lifecycle events land in the centre and on every device; dead tokens pruned ----
const liveToken = `live-token-${tag}-0123456789`;
const deadToken = `dead-token-${tag}-0123456789`;
await notifications.registerDevice(user.id, { fcmToken: liveToken, platform: 'android' });
await notifications.registerDevice(user.id, { fcmToken: deadToken, platform: 'ios' });
await cart.addItem(user.id, { variantId: cheap.variantId, quantity: 1 });
const notified = await orders.checkout(user, { addressId: address.id, paymentMethod: 'COD' });
const confirmPush = pushes.at(-1);
assert.deepEqual(confirmPush.tokens.sort(), [deadToken, liveToken].sort());
assert.equal(confirmPush.message.data.orderId, notified.orderId);
assert.equal(confirmPush.message.data.type, 'ORDER_CONFIRMED');
assert.equal(await prisma.deviceToken.count({ where: { fcmToken: deadToken } }), 0, 'dead token kept');
await orders.cancelOrderByAdmin(notified.orderId, { reason: 'seller out of stock' });
assert.match(pushes.at(-1).message.body, /cancelled by IrriKart/);
const centre = await notifications.listMine(user.id, { page: 1, limit: 5 });
assert.deepEqual(centre.items.slice(0, 2).map((n) => n.type), ['ORDER_CANCELLED', 'ORDER_CONFIRMED']);
assert.ok(centre.unread >= 2);
await notifications.markRead(user.id, centre.items[0].id);
assert.equal((await notifications.listMine(user.id, { page: 1, limit: 5 })).unread, centre.unread - 1);
await notifications.markAllRead(user.id);
assert.equal((await notifications.listMine(user.id, { page: 1, limit: 1 })).unread, 0);
await assert.rejects(notifications.markRead(ownerUser.id, centre.items[0].id), /not found/i);
const campaign = await notifications.sendCampaign({ title: 'Monsoon sale', body: '10% off drip kits', link: '/c/drip' }, ownerUser.id);
assert.ok(campaign.recipients >= 1 && campaign.pushSent >= 1);
assert.equal((await notifications.listMine(user.id, { page: 1, limit: 1 })).items[0].type, 'CAMPAIGN');
await notifications.removeDevice(user.id, { fcmToken: liveToken });

// ---- admin console ----
const adminList = await orders.listOrdersForAdmin({ page: 1, limit: 50, search: user.email });
assert.equal(adminList.total, 10);
const detail = await orders.getOrderForAdmin(online.orderId);
assert.equal(detail.payments[0].refunds.length, 1);
const recon = await payments.listPaymentsForAdmin({ page: 1, limit: 50, search: online.orderNumber });
assert.equal(recon.items[0].refunded, 4500);
assert.equal(recon.items[0].needsAttention, false);

// ---- delivery fee rules, quote, GST breakup; commission is on goods only ----
await settings.updateShippingRules({ freeShippingAbove: 1000, shippingSlabs: [{ upToKg: 5, fee: 90 }, { upToKg: 1, fee: 40 }] });
assert.deepEqual((await settings.getShippingRules()).shippingSlabs.map((x) => x.upToKg), [1, 5]);
assert.equal(settings.shippingFee(await settings.getShippingRules(), { weightKg: 9, goodsTotal: 10 }), 90, 'heavier than every slab');
await catalog.updateProduct(cheap.id, { gstRate: 18, hsnCode: '8424' });
await cart.addItem(user.id, { variantId: cheap.variantId, quantity: 1 });
const q = await orders.quote(user.id);
assert.deepEqual([q.subtotal, q.shipping, q.total, q.freeShippingAbove], [100, 40, 140, 1000]);
assert.deepEqual(q.tax.lines, [{ rate: 18, taxable: 84.75, tax: 15.25 }]);
const shipped = await orders.checkout(user, { addressId: address.id, paymentMethod: 'COD' });
assert.equal(shipped.amount, 140);
const shippedAdmin = await orders.getOrderForAdmin(shipped.orderId);
assert.deepEqual([shippedAdmin.shipping, shippedAdmin.discount, shippedAdmin.items[0].gstRate], [40, 0, 18]);
assert.equal(shippedAdmin.vendorAmount + shippedAdmin.platformAmount, 140);
assert.equal(shippedAdmin.vendorAmount, Math.round(100 * (1 - Number(vendor.commissionPercent) / 100)), 'commission charged on delivery fee');
await cart.addItem(user.id, { variantId: cheap.variantId, quantity: 10 });
assert.equal((await orders.quote(user.id)).shipping, 0, 'free-shipping threshold ignored');
await cart.clearCart(user.id);
await settings.updateShippingRules({ freeShippingAbove: null, shippingSlabs: [] });

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
