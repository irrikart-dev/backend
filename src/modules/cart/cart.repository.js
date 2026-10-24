import { prisma } from '../../config/db.js';

// what catalog.service isProductSellable needs: product status + vendor payability
const sellableVendor = { select: { status: true, razorpayAccountId: true, routeStatus: true } };

const cartInclude = {
  items: {
    orderBy: { id: 'asc' },
    include: {
      variant: {
        include: {
          product: { include: { images: { take: 1, orderBy: { position: 'asc' } }, vendor: sellableVendor } },
          // a pack's availability comes from the variant it packs
          packOf: true,
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

  // cart-local variant lookup by id — catalog.repository only exposes getVariantBySku.
  // Includes the owning product's vendorId (single-vendor rule) and what the
  // sellability check needs (status, vendor payability).
  findVariantById(variantId) {
    return prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: { select: { vendorId: true, status: true, vendor: sellableVendor } }, packOf: true },
    });
  },

  findVendorById(id) {
    return prisma.vendor.findUnique({ where: { id }, select: { id: true, storeName: true } });
  },

  setCartVendor(cartId, vendorId) {
    return prisma.cart.update({ where: { id: cartId }, data: { vendorId } });
  },

  countCartItems(cartId) {
    return prisma.cartItem.count({ where: { cartId } });
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

  // payment confirmed: this cart's items are now the order's items, not available to edit
  // anymore. Convert rather than delete — keeps the exact snapshot of what was ordered.
  markConverted(cartId, client = prisma) {
    return client.cart.update({ where: { id: cartId }, data: { status: 'CONVERTED' } });
  },
};
