import repository from './discounts.repository.js';
import { NotFoundError, BadRequestError, ConflictError } from '../../common/errors/AppError.js';

export async function validateCoupon(code, { userId, cartSubtotal }) {
  const coupon = await repository.findByCode(code.trim());
  if (!coupon || !coupon.active) throw new NotFoundError('Coupon not found');

  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    throw new BadRequestError('Coupon has expired');
  }
  if (coupon.minCartValue && cartSubtotal < Number(coupon.minCartValue)) {
    throw new BadRequestError(`Minimum cart value of ${coupon.minCartValue} required`);
  }
  if (coupon.usageLimit != null) {
    const uses = await repository.countUsages(coupon.id);
    if (uses >= coupon.usageLimit) throw new ConflictError('Coupon usage limit reached');
  }
  if (coupon.perUserLimit != null) {
    // ponytail: count-then-record race if the same user fires two concurrent checkouts with
    // this code — add a unique constraint if that's ever observed in practice
    const uses = await repository.countUsagesForUser(coupon.id, userId);
    if (uses >= coupon.perUserLimit) throw new ConflictError('You have already used this coupon');
  }

  return coupon;
}

export function calculateDiscount(coupon, cartSubtotal) {
  const value = Number(coupon.value);
  const raw = coupon.type === 'PERCENT' ? (cartSubtotal * value) / 100 : value;
  return Math.min(Math.round(raw), cartSubtotal);
}

export function recordUsage(tx, { couponId, userId, orderId }) {
  return repository.createUsage({ couponId, userId, orderId }, tx);
}

export function releaseUsage(tx, orderId) {
  return repository.deleteUsageByOrderId(orderId, tx);
}

// ---- admin: coupon management + usage analytics ----

function toCouponDto(c, stats) {
  return {
    id: c.id,
    code: c.code,
    type: c.type,
    value: Number(c.value),
    minCartValue: c.minCartValue == null ? null : Number(c.minCartValue),
    usageLimit: c.usageLimit,
    perUserLimit: c.perUserLimit,
    expiresAt: c.expiresAt,
    active: c.active,
    createdAt: c.createdAt,
    uses: stats?.uses ?? 0,
    uniqueCustomers: stats?.users.size ?? 0,
    // discount isn't stored on the order — it's whatever the coupon took off the line
    // totals, same derivation as orders.service.js's order DTO
    discountGiven: stats?.discountGiven ?? 0,
    revenue: stats?.revenue ?? 0,
  };
}

export async function listCoupons() {
  const [coupons, usages] = await Promise.all([repository.list(), repository.listUsagesWithOrders()]);

  const stats = new Map();
  for (const u of usages) {
    const s = stats.get(u.couponId) ?? { uses: 0, users: new Set(), discountGiven: 0, revenue: 0 };
    const subtotal = u.order.items.reduce((sum, i) => sum + i.quantity * Number(i.unitPrice), 0);
    const total = Number(u.order.totalAmount);
    s.uses += 1;
    s.users.add(u.userId);
    s.discountGiven += Math.max(subtotal - total, 0);
    s.revenue += total;
    stats.set(u.couponId, s);
  }

  return coupons.map((c) => toCouponDto(c, stats.get(c.id)));
}

export async function createCoupon(input) {
  const code = input.code.trim().toUpperCase();
  if (await repository.findByCode(code)) throw new ConflictError(`Coupon ${code} already exists`);
  const row = await repository.create({ ...input, code });
  return toCouponDto(row);
}

export async function updateCoupon(id, input) {
  const existing = await repository.findById(id);
  if (!existing) throw new NotFoundError('Coupon not found');
  // a partial patch can flip FLAT→PERCENT without resending value, so check the merged result
  if ((input.type ?? existing.type) === 'PERCENT' && (input.value ?? Number(existing.value)) > 100) {
    throw new BadRequestError('A percentage discount can be at most 100');
  }
  if (input.code !== undefined) {
    input = { ...input, code: input.code.trim().toUpperCase() };
    const clash = await repository.findByCode(input.code);
    if (clash && clash.id !== id) throw new ConflictError(`Coupon ${input.code} already exists`);
  }
  await repository.update(id, input);
  return (await listCoupons()).find((c) => c.id === id);
}

// a redeemed coupon is referenced by its usages (and the orders behind them), so it
// can only be switched off, not deleted
export async function deleteCoupon(id) {
  if (!(await repository.findById(id))) throw new NotFoundError('Coupon not found');
  if (await repository.countUsages(id)) {
    throw new ConflictError('This coupon has been used — deactivate it instead');
  }
  await repository.delete(id);
}
