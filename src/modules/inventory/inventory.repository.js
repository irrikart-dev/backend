import { prisma } from '../../config/db.js';

export default {
  createLedgerEntry({ variantId, changeQty, reason, refType = null, refId = null, note = null }, client = prisma) {
    return client.inventoryLedger.create({
      data: { variantId, changeQty, reason, refType, refId, note },
    });
  },

  // SELECT … FOR UPDATE: holds the row until the caller's transaction ends
  async lockVariant(variantId, client) {
    const [row] = await client.$queryRaw`SELECT id, stock, reserved FROM "ProductVariant" WHERE id = ${variantId} FOR UPDATE`;
    return row ?? null;
  },

  listForVariant(variantId, take = 100) {
    return prisma.inventoryLedger.findMany({
      where: { variantId },
      orderBy: { createdAt: 'desc' },
      take,
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

  // paid order cancelled: the sold units go back on the shelf
  restock(variantId, quantity, client = prisma) {
    return client.$executeRaw`UPDATE "ProductVariant" SET stock = stock + ${quantity} WHERE id = ${variantId}`;
  },

  // manual +/- adjustment; 0 rows affected means it would dip below what's reserved
  adjust(variantId, delta, client = prisma) {
    return client.$executeRaw`UPDATE "ProductVariant" SET stock = stock + ${delta} WHERE id = ${variantId} AND stock + ${delta} >= reserved`;
  },

  // payment failed/cancelled: give the hold back
  releaseStock(variantId, quantity, client = prisma) {
    return client.$executeRaw`UPDATE "ProductVariant" SET reserved = reserved - ${quantity} WHERE id = ${variantId}`;
  },
};
