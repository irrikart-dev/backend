import { prisma } from '../../config/db.js';

const cartInclude = {
  items: {
    orderBy: { id: 'asc' },
    include: {
      variant: {
        include: {
          product: { include: { images: { take: 1, orderBy: { position: 'asc' } } } },
        },
      },
    },
  },
};

export default {
  findActiveCartByUserId(userId) {
    return prisma.cart.findFirst({ where: { userId, status: 'ACTIVE' } });
  },

  findActiveCartWithItems(userId) {
    return prisma.cart.findFirst({ where: { userId, status: 'ACTIVE' }, include: cartInclude });
  },

  createCart(userId) {
    return prisma.cart.create({ data: { userId, status: 'ACTIVE' } });
  },

  // cart-local variant lookup by id — catalog.repository only exposes getVariantBySku
  findVariantById(variantId) {
    return prisma.productVariant.findUnique({ where: { id: variantId } });
  },

  findCartItem(cartId, variantId) {
    return prisma.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
  },

  // scoped by cartId so an itemId from another user's cart 404s instead of leaking
  findCartItemById(cartId, itemId) {
    return prisma.cartItem.findFirst({ where: { id: itemId, cartId } });
  },

  createCartItem({ cartId, variantId, quantity, priceSnapshot }) {
    return prisma.cartItem.create({ data: { cartId, variantId, quantity, priceSnapshot } });
  },

  updateCartItemQuantity(itemId, quantity, priceSnapshot) {
    return prisma.cartItem.update({ where: { id: itemId }, data: { quantity, priceSnapshot } });
  },

  deleteCartItem(itemId) {
    return prisma.cartItem.delete({ where: { id: itemId } });
  },

  deleteAllCartItems(cartId) {
    return prisma.cartItem.deleteMany({ where: { cartId } });
  },
};
