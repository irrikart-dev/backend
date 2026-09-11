-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'PACKED';
ALTER TYPE "OrderStatus" ADD VALUE 'SHIPPED';
ALTER TYPE "OrderStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "OrderStatus" ADD VALUE 'RETURNED';

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('CUSTOMER', 'ADMIN');
ALTER TABLE "public"."User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'CUSTOMER';
COMMIT;

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_subOrderId_fkey";

-- DropForeignKey
ALTER TABLE "Refund" DROP CONSTRAINT "Refund_subOrderId_fkey";

-- DropForeignKey
ALTER TABLE "Shipment" DROP CONSTRAINT "Shipment_subOrderId_fkey";

-- DropForeignKey
ALTER TABLE "Vendor" DROP CONSTRAINT "Vendor_userId_fkey";

-- DropForeignKey
ALTER TABLE "VendorPayout" DROP CONSTRAINT "VendorPayout_subOrderId_fkey";

-- DropForeignKey
ALTER TABLE "VendorPayout" DROP CONSTRAINT "VendorPayout_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "VendorSubOrder" DROP CONSTRAINT "VendorSubOrder_orderId_fkey";

-- DropForeignKey
ALTER TABLE "VendorSubOrder" DROP CONSTRAINT "VendorSubOrder_vendorId_fkey";

-- DropIndex
DROP INDEX "OrderItem_subOrderId_idx";

-- DropIndex
DROP INDEX "Refund_subOrderId_idx";

-- DropIndex
DROP INDEX "Shipment_subOrderId_key";

-- AlterTable
ALTER TABLE "OrderItem" DROP COLUMN "subOrderId",
ADD COLUMN     "orderId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Refund" DROP COLUMN "subOrderId",
ADD COLUMN     "orderId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Shipment" DROP COLUMN "subOrderId",
ADD COLUMN     "orderId" TEXT NOT NULL;

-- DropTable
DROP TABLE "Vendor";

-- DropTable
DROP TABLE "VendorPayout";

-- DropTable
DROP TABLE "VendorSubOrder";

-- DropEnum
DROP TYPE "PayoutStatus";

-- DropEnum
DROP TYPE "SubOrderStatus";

-- DropEnum
DROP TYPE "VendorStatus";

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "Refund_orderId_idx" ON "Refund"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_orderId_key" ON "Shipment"("orderId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

