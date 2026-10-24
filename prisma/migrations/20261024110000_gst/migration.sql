-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "gstRate" DECIMAL(5,2),
ADD COLUMN     "hsnCode" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "gstRate" DECIMAL(5,2),
ADD COLUMN     "hsnCode" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "gstin" TEXT;
