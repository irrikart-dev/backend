-- Rename Razorpay-specific columns to provider-agnostic ones, preserving data
ALTER TABLE "Payment" RENAME COLUMN "razorpayOrderId" TO "providerOrderId";
ALTER TABLE "Payment" RENAME COLUMN "razorpayPaymentId" TO "providerPaymentId";

ALTER INDEX "Payment_razorpayOrderId_key" RENAME TO "Payment_providerOrderId_key";
ALTER INDEX "Payment_razorpayPaymentId_key" RENAME TO "Payment_providerPaymentId_key";

-- Existing rows were all Razorpay
ALTER TABLE "Payment" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'razorpay';
