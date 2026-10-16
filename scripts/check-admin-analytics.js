/**
 * Offline self-check for coupon usage analytics and vendor performance maths.
 * Stubs the repositories, so no DB is touched:  node scripts/check-admin-analytics.js
 */
import assert from 'node:assert/strict';
import discountsRepo from '../src/modules/discounts/discounts.repository.js';
import vendorsRepo from '../src/modules/vendors/vendors.repository.js';
import { listCoupons } from '../src/modules/discounts/discounts.service.js';
import { listPerformance, getPerformance } from '../src/modules/vendors/vendors.service.js';

const coupon = (id) => ({ id, code: id, type: 'FLAT', value: '100', active: true, createdAt: new Date() });
discountsRepo.list = async () => [coupon('A'), coupon('B')];
discountsRepo.listUsagesWithOrders = async () => [
  { couponId: 'A', userId: 'u1', order: { totalAmount: '900', items: [{ quantity: 2, unitPrice: '500' }] } },
  { couponId: 'A', userId: 'u1', order: { totalAmount: '400', items: [{ quantity: 1, unitPrice: '500' }] } },
  { couponId: 'A', userId: 'u2', order: { totalAmount: '200', items: [{ quantity: 1, unitPrice: '300' }] } },
];

const [a, b] = await listCoupons();
assert.deepEqual(
  { uses: a.uses, uniqueCustomers: a.uniqueCustomers, discountGiven: a.discountGiven, revenue: a.revenue },
  { uses: 3, uniqueCustomers: 2, discountGiven: 300, revenue: 1500 }
);
assert.equal(b.uses, 0);
assert.equal(b.discountGiven, 0);

const g = (vendorId, status, n, total, cancelledBy = null) => ({
  vendorId, status, cancelledBy, _count: { _all: n }, _sum: { totalAmount: String(total) },
});
vendorsRepo.groupOrdersForPerformance = async () => [
  g('v1', 'DELIVERED', 6, 6000),
  g('v1', 'SHIPPED', 1, 500),
  g('v1', 'CANCELLED', 2, 800, 'vendor'),
  g('v1', 'CANCELLED', 5, 999, 'customer'), // not the vendor's fault — ignored
  g('v1', 'RETURNED', 1, 300),
  g('v1', 'PLACED', 4, 999), // unpaid — ignored
];
vendorsRepo.listRatedProducts = async () => [
  { vendorId: 'v1', rating: 5, reviewCount: 3 },
  { vendorId: 'v1', rating: 3, reviewCount: 1 },
  { vendorId: 'v2', rating: 4, reviewCount: 2 }, // reviews but no orders still gets a row
];

const rows = await listPerformance();
const v1 = rows.find((r) => r.vendorId === 'v1');
assert.equal(v1.orders, 10);
assert.equal(v1.gmv, 6500);
assert.equal(v1.rejectionRate, 0.2);
assert.equal(v1.returnRate, 0.1);
assert.equal(v1.rating, 4.5);
assert.equal(v1.reviewCount, 4);
const v2 = rows.find((r) => r.vendorId === 'v2');
assert.equal(v2.orders, 0);
assert.equal(v2.rejectionRate, 0);
assert.equal(v2.rating, 4);

vendorsRepo.groupOrdersForPerformance = async () => [];
vendorsRepo.listRatedProducts = async () => [];
assert.equal((await getPerformance('v9')).rating, null);

console.log('admin analytics checks passed');
process.exit(0);
