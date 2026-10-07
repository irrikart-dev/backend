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

// a paid (stock-committed) order was cancelled — put its units back
export async function restockCancelledStock(tx, variantId, quantity, orderId) {
  await repository.restock(variantId, quantity, tx);
  await repository.createLedgerEntry(
    { variantId, changeQty: quantity, reason: 'cancel', refType: 'order', refId: orderId },
    tx
  );
}

// order placed, not yet paid — hold the stock so nobody else can buy it out from under this order
export async function reserveStock(tx, variantId, quantity, orderId) {
  const affected = await repository.reserveStock(variantId, quantity, tx);
  if (affected === 0) throw new ConflictError('Insufficient stock for one or more items');
  await repository.createLedgerEntry(
    { variantId, changeQty: quantity, reason: 'reserve', refType: 'order', refId: orderId },
    tx
  );
}

// payment captured — the hold becomes a real sale
export async function commitReservedStock(tx, variantId, quantity, orderId) {
  await repository.commitStock(variantId, quantity, tx);
  await repository.createLedgerEntry(
    { variantId, changeQty: -quantity, reason: 'order', refType: 'order', refId: orderId },
    tx
  );
}

// payment failed — give the hold back
export async function releaseReservedStock(tx, variantId, quantity, orderId) {
  await repository.releaseStock(variantId, quantity, tx);
  await repository.createLedgerEntry(
    { variantId, changeQty: -quantity, reason: 'release', refType: 'order', refId: orderId },
    tx
  );
}
