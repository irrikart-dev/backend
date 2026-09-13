import repository from './cart.repository.js';
import { NotFoundError, ConflictError } from '../../common/errors/AppError.js';

function available(variant) {
  return variant.stock - variant.reserved;
}

function toCartItemDto(item) {
  const { variant } = item;
  const { product } = variant;
  const price = Number(item.priceSnapshot);

  return {
    id: item.id,
    variantId: variant.id,
    productId: product.id,
    name: product.title,
    slug: product.slug,
    image: product.images?.[0]?.url ?? null,
    sku: variant.sku,
    unit: variant.unit,
    quantity: item.quantity,
    price,
    lineTotal: price * item.quantity,
    available: available(variant),
  };
}

function toCartDto(cart) {
  if (!cart) return { id: null, status: 'ACTIVE', items: [], itemCount: 0, subtotal: 0, total: 0 };

  const items = cart.items.map(toCartItemDto);
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return { id: cart.id, status: cart.status, items, itemCount, subtotal, total: subtotal };
}

// ponytail: no DB constraint stops two concurrent first-adds from racing to create two
// ACTIVE carts for the same user (schema only has an index, not a unique constraint on
// userId+ACTIVE). Add a partial unique index if that's ever observed in practice.
async function getOrCreateActiveCart(userId) {
  const existing = await repository.findActiveCartByUserId(userId);
  return existing ?? repository.createCart(userId);
}

export async function getCart(userId) {
  const cart = await repository.findActiveCartWithItems(userId);
  return toCartDto(cart);
}

export async function addItem(userId, { variantId, quantity }) {
  const variant = await repository.findVariantById(variantId);
  if (!variant) throw new NotFoundError('Product variant not found');

  const cart = await getOrCreateActiveCart(userId);
  const existingItem = await repository.findCartItem(cart.id, variantId);
  const desiredQuantity = (existingItem?.quantity ?? 0) + quantity;

  if (desiredQuantity > available(variant)) {
    throw new ConflictError(`Only ${available(variant)} of this item available`);
  }

  const price = Number(variant.price);
  if (existingItem) {
    await repository.updateCartItemQuantity(existingItem.id, desiredQuantity, price);
  } else {
    await repository.createCartItem({ cartId: cart.id, variantId, quantity, priceSnapshot: price });
  }

  return getCart(userId);
}

export async function updateItemQuantity(userId, itemId, quantity) {
  const cart = await repository.findActiveCartByUserId(userId);
  const item = cart && (await repository.findCartItemById(cart.id, itemId));
  if (!item) throw new NotFoundError('Cart item not found');

  const variant = await repository.findVariantById(item.variantId);
  if (!variant) throw new NotFoundError('Product variant not found');
  if (quantity > available(variant)) {
    throw new ConflictError(`Only ${available(variant)} of this item available`);
  }

  await repository.updateCartItemQuantity(itemId, quantity, Number(variant.price));
  return getCart(userId);
}

export async function removeItem(userId, itemId) {
  const cart = await repository.findActiveCartByUserId(userId);
  const item = cart && (await repository.findCartItemById(cart.id, itemId));
  if (!item) throw new NotFoundError('Cart item not found');

  await repository.deleteCartItem(itemId);
  return getCart(userId);
}

export async function clearCart(userId) {
  const cart = await repository.findActiveCartByUserId(userId);
  if (cart) await repository.deleteAllCartItems(cart.id);
  return getCart(userId);
}
