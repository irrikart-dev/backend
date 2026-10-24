-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "packOfId" TEXT,
ADD COLUMN     "unitsPerPack" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "ProductVariant_packOfId_idx" ON "ProductVariant"("packOfId");

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_packOfId_fkey" FOREIGN KEY ("packOfId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
