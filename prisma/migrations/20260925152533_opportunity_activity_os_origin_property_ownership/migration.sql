-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "ownership" TEXT;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "origin" TEXT,
ADD COLUMN     "proposalId" TEXT;

-- CreateTable
CREATE TABLE "OpportunityActivity" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "contactId" TEXT,
    "userId" TEXT,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpportunityActivity_opportunityId_occurredAt_idx" ON "OpportunityActivity"("opportunityId", "occurredAt");

-- CreateIndex
CREATE INDEX "WorkOrder_proposalId_idx" ON "WorkOrder"("proposalId");

-- AddForeignKey
ALTER TABLE "OpportunityActivity" ADD CONSTRAINT "OpportunityActivity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityActivity" ADD CONSTRAINT "OpportunityActivity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityActivity" ADD CONSTRAINT "OpportunityActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "CommercialProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Catálogo único de serviços: "Laudo técnico" passa a "Avaliação de risco".
UPDATE "Opportunity" SET "service" = 'AVALIACAO_RISCO' WHERE "service" = 'LAUDO';
UPDATE "WorkOrder" SET "service" = 'AVALIACAO_RISCO' WHERE "service" = 'LAUDO';
-- OS geradas a partir de orçamento: origem "proposta", vinculada à última proposta aceita/enviada do orçamento.
UPDATE "WorkOrder" w SET "origin" = 'PROPOSTA', "proposalId" = (
  SELECT p."id" FROM "CommercialProposal" p WHERE p."estimateId" = w."pricingEstimateId"
  ORDER BY (p."status" = 'ACEITA') DESC, p."version" DESC LIMIT 1)
WHERE w."pricingEstimateId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "CommercialProposal" p WHERE p."estimateId" = w."pricingEstimateId");
