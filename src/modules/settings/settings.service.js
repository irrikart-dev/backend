import repository from './settings.repository.js';

function toShippingDto(s) {
  return {
    freeShippingAbove: s.freeShippingAbove == null ? null : Number(s.freeShippingAbove),
    shippingSlabs: (s.shippingSlabs ?? []).map((slab) => ({ upToKg: Number(slab.upToKg), fee: Number(slab.fee) })),
    updatedAt: s.updatedAt,
  };
}

export async function getShippingRules() {
  return toShippingDto(await repository.get());
}

export async function updateShippingRules({ freeShippingAbove, shippingSlabs }) {
  const sorted = [...shippingSlabs].sort((a, b) => a.upToKg - b.upToKg);
  return toShippingDto(await repository.update({ freeShippingAbove, shippingSlabs: sorted }));
}

/**
 * Delivery fee for a parcel: free at or above the free-shipping value, otherwise the
 * first weight slab it fits in (heavier than every slab → the last one). No slabs = free.
 */
export function shippingFee(rules, { weightKg, goodsTotal }) {
  const slabs = rules.shippingSlabs;
  if (!slabs.length) return 0;
  if (rules.freeShippingAbove != null && goodsTotal >= rules.freeShippingAbove) return 0;
  return (slabs.find((s) => weightKg <= s.upToKg) ?? slabs.at(-1)).fee;
}
