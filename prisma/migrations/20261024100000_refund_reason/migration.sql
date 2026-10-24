-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "reason" TEXT;

-- CreateIndex
CREATE INDEX "Refund_createdAt_idx" ON "Refund"("createdAt");
