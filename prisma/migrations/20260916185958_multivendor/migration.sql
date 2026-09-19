-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'VENDOR';

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "storeName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "VendorStatus" NOT NULL DEFAULT 'ACTIVE',
    "commissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "legalBusinessName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "razorpayAccountId" TEXT,
    "routeStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_ownerUserId_key" ON "Vendor"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_slug_key" ON "Vendor"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_razorpayAccountId_key" ON "Vendor"("razorpayAccountId");

-- CreateIndex
CREATE INDEX "Vendor_status_idx" ON "Vendor"("status");

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the system vendor that owns every product IrriKart sells directly (no
-- razorpayAccountId — checkout/capture skip the Route transfer for it, see
-- payments.service.js). Existing products are backfilled onto it below.
INSERT INTO "Vendor" ("id", "storeName", "slug", "status", "commissionPercent", "updatedAt")
VALUES ('vendor_irrikart_system', 'IrriKart', 'irrikart', 'ACTIVE', 0, CURRENT_TIMESTAMP);

-- AlterTable: add Product.vendorId nullable first so existing rows can be backfilled
ALTER TABLE "Product" ADD COLUMN "vendorId" TEXT;

UPDATE "Product" SET "vendorId" = 'vendor_irrikart_system' WHERE "vendorId" IS NULL;

ALTER TABLE "Product" ALTER COLUMN "vendorId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Product_vendorId_active_createdAt_idx" ON "Product"("vendorId", "active", "createdAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Cart" ADD COLUMN "vendorId" TEXT;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Order has no existing rows yet, safe to add as NOT NULL directly
ALTER TABLE "Order" ADD COLUMN "vendorId" TEXT NOT NULL,
ADD COLUMN "vendorAmount" DECIMAL(10,2) NOT NULL,
ADD COLUMN "platformAmount" DECIMAL(10,2) NOT NULL;

-- CreateIndex
CREATE INDEX "Order_vendorId_createdAt_idx" ON "Order"("vendorId", "createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "transferId" TEXT,
ADD COLUMN "transferStatus" TEXT;
