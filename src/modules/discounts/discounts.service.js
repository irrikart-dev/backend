import repository from './discounts.repository.js';
import { NotFoundError, BadRequestError, ConflictError } from '../../common/errors/AppError.js';

export async function validateCoupon(code, { userId, cartSubtotal }) {
  const coupon = await repository.findByCode(code.trim());
  if (!coupon) throw new NotFoundError('Coupon not found');

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
