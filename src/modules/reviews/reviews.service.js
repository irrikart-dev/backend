import repository from './reviews.repository.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/AppError.js';

// A review is gated to a paid order, not specifically a *delivered* one —
// there's no shipment-status pipeline driving orders past CONFIRMED yet
// (that's the Shiprocket integration, not built), so requiring DELIVERED
// would make this feature permanently unreachable. Revisit once shipment
// tracking is real.
const REVIEWABLE_ORDER_STATUSES = ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'];

function toReviewDto(review) {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    userName: review.user?.name ?? 'Verified buyer',
  };
}

export async function submitReview(userId, { orderItemId, rating, comment }) {
  const orderItem = await repository.findOrderItemForUser(orderItemId, userId);
  if (!orderItem) throw new NotFoundError('Order item not found');

  if (!REVIEWABLE_ORDER_STATUSES.includes(orderItem.order.status)) {
    throw new BadRequestError('This order has not been paid yet');
  }

  if (await repository.findByOrderItemId(orderItemId)) {
    throw new ConflictError('You already reviewed this item');
  }

  // live on submit — staff moderate after the fact (setStatusForAdmin)
  await repository.create({
    productId: orderItem.variant.productId,
    userId,
    orderItemId,
    rating,
    comment: comment ?? null,
    status: 'APPROVED',
  });

  await repository.recomputeProductRating(orderItem.variant.productId);
}

export async function listForProduct(productId) {
  const reviews = await repository.listForProduct(productId);
  return reviews.map(toReviewDto);
}

// ---- admin moderation ----
// Reviews still go live on submit; moderation is after the fact — staff hide a
// review by rejecting it (or restore it), and the product/vendor rating follows.

function toAdminDto(r) {
  return {
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    status: r.status,
    createdAt: r.createdAt,
    product: r.product,
    customer: r.user,
  };
}

export async function listForAdmin({ status, rating, search, page, limit }) {
  const contains = (field) => ({ [field]: { contains: search, mode: 'insensitive' } });
  const where = {
    ...(status ? { status } : {}),
    ...(rating ? { rating } : {}),
    ...(search
      ? { OR: [contains('comment'), { product: contains('title') }, { user: { OR: ['name', 'phone', 'email'].map(contains) } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    repository.listForAdmin(where, { skip: (page - 1) * limit, take: limit }),
    repository.countForAdmin(where),
  ]);
  return { items: rows.map(toAdminDto), page, limit, total };
}

export async function setStatusForAdmin(id, status) {
  const existing = await repository.findById(id);
  if (!existing) throw new NotFoundError('Review not found');
  const row = await repository.updateStatus(id, status);
  if (existing.status !== status) await repository.recomputeProductRating(row.productId);
  return toAdminDto(row);
}
