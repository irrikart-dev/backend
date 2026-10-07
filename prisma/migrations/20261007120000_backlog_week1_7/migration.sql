-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ONLINE', 'COD');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUB_ADMIN';

-- Product.active -> Product.status. Live products become PUBLISHED, hidden ones DRAFT,
-- so nothing changes visibility in the app.
ALTER TABLE "Product" ADD COLUMN "status" "ProductStatus" NOT NULL DEFAULT 'PUBLISHED';
UPDATE "Product" SET "status" = 'DRAFT' WHERE "active" = false;
DROP INDEX "Product_categoryId_active_createdAt_idx";
DROP INDEX "Product_vendorId_active_createdAt_idx";
ALTER TABLE "Product" DROP COLUMN "active";
CREATE INDEX "Product_categoryId_status_createdAt_idx" ON "Product"("categoryId", "status", "createdAt");
CREATE INDEX "Product_vendorId_status_createdAt_idx" ON "Product"("vendorId", "status", "createdAt");

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'ONLINE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "razorpayCustomerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_razorpayCustomerId_key" ON "User"("razorpayCustomerId");

-- AlterTable
ALTER TABLE "InventoryLedger" ADD COLUMN "note" TEXT;
