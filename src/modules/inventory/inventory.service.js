import repository from './inventory.repository.js';
import { ConflictError } from '../../common/errors/AppError.js';

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

export function history(variantId) {
  return repository.listForVariant(variantId);
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
