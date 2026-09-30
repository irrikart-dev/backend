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

  // auto-approved — no moderation queue this pass, per product decision
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
