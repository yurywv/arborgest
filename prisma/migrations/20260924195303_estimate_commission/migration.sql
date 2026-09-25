-- AlterEnum
ALTER TYPE "PricingOverrideType" ADD VALUE 'COMISSAO';

-- AlterTable
ALTER TABLE "PricingEstimate" ADD COLUMN     "commissionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "commissionBase" TEXT,
ADD COLUMN     "commissionPercent" DECIMAL(10,6),
ADD COLUMN     "commissionReason" TEXT,
ADD COLUMN     "commissionTo" TEXT,
ADD COLUMN     "marginAfterCommission" DECIMAL(10,6);
