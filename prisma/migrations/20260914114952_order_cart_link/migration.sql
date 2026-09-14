-- Link each Order to the cart it was placed from, so payment confirmation can convert
-- exactly that cart instead of guessing at the user's current active cart
ALTER TABLE "Order" ADD COLUMN     "cartId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
