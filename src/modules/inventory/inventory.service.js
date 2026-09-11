import repository from './inventory.repository.js';

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
