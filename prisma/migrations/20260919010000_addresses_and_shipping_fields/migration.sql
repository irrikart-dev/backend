-- AlterTable: Address gets a required recipient name/phone.
-- No backend module has ever existed for this table, so it should be empty
-- in production — NOT NULL with no default is safe.
ALTER TABLE "Address" ADD COLUMN "name" TEXT NOT NULL;
ALTER TABLE "Address" ADD COLUMN "phone" TEXT NOT NULL;

-- AlterTable: Order gets an optional delivery address link.
ALTER TABLE "Order" ADD COLUMN "addressId" TEXT;

-- AlterTable: ProductVariant gets shipping weight/dimensions with defaults.
ALTER TABLE "ProductVariant" ADD COLUMN "weightKg" DOUBLE PRECISION NOT NULL DEFAULT 0.5;
ALTER TABLE "ProductVariant" ADD COLUMN "lengthCm" DOUBLE PRECISION NOT NULL DEFAULT 10;
ALTER TABLE "ProductVariant" ADD COLUMN "widthCm" DOUBLE PRECISION NOT NULL DEFAULT 10;
ALTER TABLE "ProductVariant" ADD COLUMN "heightCm" DOUBLE PRECISION NOT NULL DEFAULT 10;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
