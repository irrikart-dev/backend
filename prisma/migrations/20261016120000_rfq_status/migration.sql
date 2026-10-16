-- CreateEnum
CREATE TYPE "RfqStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');

-- DropIndex
DROP INDEX "RfqRequest_createdAt_idx";

-- AlterTable
ALTER TABLE "RfqRequest" ADD COLUMN "status" "RfqStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN "adminNote" TEXT;

-- CreateIndex
CREATE INDEX "RfqRequest_status_createdAt_idx" ON "RfqRequest"("status", "createdAt");
