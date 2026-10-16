-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "reviewCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill from reviews that already exist
UPDATE "Vendor" v
SET "rating" = s.avg_rating, "reviewCount" = s.review_count
FROM (
  SELECT p."vendorId", AVG(r."rating")::DOUBLE PRECISION AS avg_rating, COUNT(*)::INTEGER AS review_count
  FROM "Review" r
  JOIN "Product" p ON p."id" = r."productId"
  WHERE r."status" = 'APPROVED'
  GROUP BY p."vendorId"
) s
WHERE s."vendorId" = v."id";
