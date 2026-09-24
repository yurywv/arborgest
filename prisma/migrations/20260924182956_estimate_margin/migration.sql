-- AlterTable
ALTER TABLE "PricingEstimate" ADD COLUMN     "marginOverride" DECIMAL(10,6),
ADD COLUMN     "marginReason" TEXT;
