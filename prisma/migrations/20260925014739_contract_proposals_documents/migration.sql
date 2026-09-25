-- AlterTable
ALTER TABLE "CommercialProposal" ADD COLUMN     "contractId" TEXT,
ALTER COLUMN "estimateId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "proposalId" TEXT;

-- CreateIndex
CREATE INDEX "CommercialProposal_contractId_idx" ON "CommercialProposal"("contractId");

-- CreateIndex
CREATE INDEX "CommercialProposal_clientId_idx" ON "CommercialProposal"("clientId");

-- CreateIndex
CREATE INDEX "Document_clientId_idx" ON "Document"("clientId");

-- CreateIndex
CREATE INDEX "Document_contractId_idx" ON "Document"("contractId");

-- CreateIndex
CREATE INDEX "Document_proposalId_idx" ON "Document"("proposalId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "CommercialProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialProposal" ADD CONSTRAINT "CommercialProposal_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
