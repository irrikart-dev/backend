-- DropForeignKey
ALTER TABLE "InventoryLedger" DROP CONSTRAINT "InventoryLedger_variantId_fkey";

-- AddForeignKey
ALTER TABLE "InventoryLedger" ADD CONSTRAINT "InventoryLedger_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
