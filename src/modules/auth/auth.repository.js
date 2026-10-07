import { prisma } from '../../config/db.js';
import reviewsRepository from '../reviews/reviews.repository.js';

export const findByFirebaseUid = (firebaseUid) => prisma.user.findUnique({ where: { firebaseUid } });

export const createFromFirebase = ({ firebaseUid, phone, email }) =>
  prisma.user.create({ data: { firebaseUid, phone, email } });

export const updateName = (id, name) => prisma.user.update({ where: { id }, data: { name } });

// One transaction: anything that can be deleted is; rows that orders still
// reference (the user, carts, addresses) are kept but stripped of identity.
export const anonymiseAndPurge = (userId) =>
  prisma.$transaction(async (tx) => {
    const orderCartIds = (
      await tx.order.findMany({ where: { userId }, select: { cartId: true } })
    ).map((o) => o.cartId);
    const orderAddressIds = (
      await tx.order.findMany({
        where: { userId, addressId: { not: null } },
        select: { addressId: true },
      })
    ).map((o) => o.addressId);

    await tx.cartItem.deleteMany({ where: { cart: { userId } } });
    await tx.cart.deleteMany({ where: { userId, id: { notIn: orderCartIds } } });
    await tx.address.deleteMany({ where: { userId, id: { notIn: orderAddressIds } } });
    await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    await tx.wishlistItem.deleteMany({ where: { userId } });
    await tx.recentlyViewed.deleteMany({ where: { userId } });
    await tx.deviceToken.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    const reviewedProductIds = [
      ...new Set(
        (
          await tx.review.findMany({ where: { userId }, select: { productId: true } })
        ).map((r) => r.productId),
      ),
    ];
    await tx.review.deleteMany({ where: { userId } });
    for (const productId of reviewedProductIds) {
      await reviewsRepository.recomputeProductRating(productId, tx);
    }
    await tx.rfqRequest.deleteMany({ where: { userId } });

    await tx.user.update({
      where: { id: userId },
      data: {
        firebaseUid: `deleted:${userId}`,
        phone: null,
        email: null,
        name: null,
        status: 'BLOCKED',
      },
    });
  });
