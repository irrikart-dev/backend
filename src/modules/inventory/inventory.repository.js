import { prisma } from '../../config/db.js';

export default {
  createLedgerEntry({ variantId, changeQty, reason, refType = null, refId = null }) {
    return prisma.inventoryLedger.create({
      data: { variantId, changeQty, reason, refType, refId },
    });
  },

  listForVariant(variantId) {
    return prisma.inventoryLedger.findMany({
      where: { variantId },
      orderBy: { createdAt: 'desc' },
    });
  },
};
