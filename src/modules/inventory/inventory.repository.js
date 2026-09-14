import { prisma } from '../../config/db.js';

export default {
  createLedgerEntry({ variantId, changeQty, reason, refType = null, refId = null }, client = prisma) {
    return client.inventoryLedger.create({
      data: { variantId, changeQty, reason, refType, refId },
    });
  },

  listForVariant(variantId) {
    return prisma.inventoryLedger.findMany({
      where: { variantId },
      orderBy: { createdAt: 'desc' },
    });
  },

  // atomic check-and-increment: 0 rows affected means insufficient stock, no lock needed
  reserveStock(variantId, quantity, client = prisma) {
    return client.$executeRaw`UPDATE "ProductVariant" SET reserved = reserved + ${quantity} WHERE id = ${variantId} AND stock - reserved >= ${quantity}`;
  },

  // capture: hold becomes a real deduction
  commitStock(variantId, quantity, client = prisma) {
    return client.$executeRaw`UPDATE "ProductVariant" SET stock = stock - ${quantity}, reserved = reserved - ${quantity} WHERE id = ${variantId}`;
  },

  // payment failed/cancelled: give the hold back
  releaseStock(variantId, quantity, client = prisma) {
    return client.$executeRaw`UPDATE "ProductVariant" SET reserved = reserved - ${quantity} WHERE id = ${variantId}`;
  },
};
