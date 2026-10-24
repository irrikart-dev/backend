import repository from './inventory.repository.js';
import { prisma } from '../../config/db.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/AppError.js';

/** Writes one audit row every time stock changes, whatever the cause. */
export function recordAdjustment(variantId, changeQty, reason, ref = {}) {
  if (changeQty === 0) return null;
  return repository.createLedgerEntry({
    variantId,
    changeQty,
    reason,
    refType: ref.refType ?? null,
    refId: ref.refId ?? null,
  });
}

export async function history(variantId) {
  const rows = await repository.listForVariant(variantId);
  return rows.map((r) => ({
    id: r.id,
    changeQty: r.changeQty,
    reason: r.reason,
    refType: r.refType,
    refId: r.refId,
    note: r.note,
    createdAt: r.createdAt,
  }));
}

// admin stock correction with a reason — "received 50", "3 damaged in transit"
export async function adjustStock(variantId, { delta, note }, userId) {
  await prisma.$transaction(async (tx) => {
    const variant = await tx.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundError('Variant not found');
    await assertNotPack(tx, variantId);
    const affected = await repository.adjust(variantId, delta, tx);
    if (affected === 0) {
      throw new BadRequestError(
        `Can't remove ${-delta}: only ${variant.stock - variant.reserved} unit(s) aren't reserved by pending orders`
      );
    }
    await repository.createLedgerEntry(
      { variantId, changeQty: delta, reason: 'manual', refType: 'user', refId: userId, note },
      tx
    );
  });
  return prisma.productVariant.findUnique({ where: { id: variantId } });
}

// catalogue form's absolute "stock = N" edit. The row lock makes the reserved check and
// the ledger delta exact even while checkouts reserve/commit the same SKU concurrently.
export async function setStockLevel(variantId, stock) {
  await prisma.$transaction(async (tx) => {
    const variant = await repository.lockVariant(variantId, tx);
    if (!variant) throw new NotFoundError('Variant not found');
    await assertNotPack(tx, variantId);
    // units held by unpaid orders can't be taken away from under them
    if (stock < variant.reserved) {
      throw new BadRequestError(`${variant.reserved} unit(s) are reserved by pending orders — stock can't go below that`);
    }
    const delta = stock - variant.stock;
    if (delta === 0) return;
    await tx.productVariant.update({ where: { id: variantId }, data: { stock } });
    await repository.createLedgerEntry({ variantId, changeQty: delta, reason: 'manual' }, tx);
  });
}

// A pack variant (a dozen, a carton) keeps no stock of its own: moving N packs moves
// N × unitsPerPack units of the variant it packs. Every order-driven stock move goes
// through this, so the ledger always records base units on the base variant.
async function stockTarget(tx, variantId, quantity) {
  const v = await tx.productVariant.findUnique({ where: { id: variantId }, select: { packOfId: true, unitsPerPack: true } });
  return v?.packOfId ? [v.packOfId, quantity * v.unitsPerPack] : [variantId, quantity];
}

async function assertNotPack(tx, variantId) {
  const v = await tx.productVariant.findUnique({ where: { id: variantId }, select: { packOfId: true } });
  if (v?.packOfId) throw new BadRequestError('A pack has no stock of its own — adjust the variant it packs');
}

// a paid (stock-committed) order was cancelled — put its units back
export async function restockCancelledStock(tx, packVariantId, packQuantity, orderId) {
  const [variantId, quantity] = await stockTarget(tx, packVariantId, packQuantity);
  await repository.restock(variantId, quantity, tx);
  await repository.createLedgerEntry(
    { variantId, changeQty: quantity, reason: 'cancel', refType: 'order', refId: orderId },
    tx
  );
}

// goods came back from a delivered order (customer return, or a courier RTO)
export async function restockReturnedStock(tx, packVariantId, packQuantity, ref) {
  const [variantId, quantity] = await stockTarget(tx, packVariantId, packQuantity);
  await repository.restock(variantId, quantity, tx);
  await repository.createLedgerEntry({ variantId, changeQty: quantity, reason: 'return', ...ref }, tx);
}

// order placed, not yet paid — hold the stock so nobody else can buy it out from under this order
export async function reserveStock(tx, packVariantId, packQuantity, orderId) {
  const [variantId, quantity] = await stockTarget(tx, packVariantId, packQuantity);
  const affected = await repository.reserveStock(variantId, quantity, tx);
  if (affected === 0) throw new ConflictError('Insufficient stock for one or more items');
  await repository.createLedgerEntry(
    { variantId, changeQty: quantity, reason: 'reserve', refType: 'order', refId: orderId },
    tx
  );
}

// payment captured — the hold becomes a real sale
export async function commitReservedStock(tx, packVariantId, packQuantity, orderId) {
  const [variantId, quantity] = await stockTarget(tx, packVariantId, packQuantity);
  await repository.commitStock(variantId, quantity, tx);
  await repository.createLedgerEntry(
    { variantId, changeQty: -quantity, reason: 'order', refType: 'order', refId: orderId },
    tx
  );
}

// payment failed — give the hold back
export async function releaseReservedStock(tx, packVariantId, packQuantity, orderId) {
  const [variantId, quantity] = await stockTarget(tx, packVariantId, packQuantity);
  await repository.releaseStock(variantId, quantity, tx);
  await repository.createLedgerEntry(
    { variantId, changeQty: -quantity, reason: 'release', refType: 'order', refId: orderId },
    tx
  );
}
