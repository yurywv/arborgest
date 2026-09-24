-- CreateEnum
CREATE TYPE "PricingEngineVersion" AS ENUM ('V1_LEGACY_EXCEL', 'V2_ARBORENT');

-- CreateEnum
CREATE TYPE "PricingEstimateStatus" AS ENUM ('RASCUNHO', 'EM_ELABORACAO', 'EM_APROVACAO_INTERNA', 'APROVADO_INTERNAMENTE', 'ENVIADO_CLIENTE', 'EM_NEGOCIACAO', 'ACEITO', 'RECUSADO', 'CANCELADO', 'EXPIRADO');

-- CreateEnum
CREATE TYPE "ApprovalLevel" AS ENUM ('COMERCIAL', 'GERENCIAL', 'DIRETORIA');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDENTE', 'APROVADO', 'REJEITADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PricingOverrideType" AS ENUM ('MARGEM', 'CUSTO_ADICIONAL', 'PRECO_FINAL', 'DESCONTO_PERCENTUAL', 'DESCONTO_VALOR', 'REMOCAO');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('RASCUNHO', 'EMITIDA', 'ENVIADA', 'ACEITA', 'RECUSADA', 'CANCELADA', 'SUBSTITUIDA');

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "pricingEstimateId" TEXT;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "pricingEstimateId" TEXT;

-- CreateTable
CREATE TABLE "PricingParameterVersion" (
    "id" TEXT NOT NULL,
    "major" INTEGER NOT NULL,
    "minor" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "engineVersion" "PricingEngineVersion" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "snapshot" JSONB NOT NULL,
    "v2ValidatedAt" TIMESTAMP(3),
    "v2ValidatedNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingParameterVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingParameter" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" DECIMAL(18,6),
    "textValue" TEXT,
    "unit" TEXT,

    CONSTRAINT "PricingParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingService" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'árvore',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingProductivityRule" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "treesPerDay" DECIMAL(12,4) NOT NULL,

    CONSTRAINT "PricingProductivityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingModifier" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "factor" DECIMAL(10,6) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "addsDays" INTEGER NOT NULL DEFAULT 0,
    "legacyInProduct" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PricingModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingServiceType" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "code" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "factor" DECIMAL(10,6) NOT NULL,
    "includesLicense" BOOLEAN,
    "cacambaArvoresPor" DECIMAL(10,2),

    CONSTRAINT "PricingServiceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingLicenseTier" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "minTrees" INTEGER NOT NULL,
    "maxTrees" INTEGER,
    "divisor" DECIMAL(10,4) NOT NULL,
    "hours" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "PricingLicenseTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingEstimate" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "parentId" TEXT,
    "title" TEXT,
    "clientId" TEXT NOT NULL,
    "contactId" TEXT,
    "propertyId" TEXT,
    "opportunityId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "commercialOwnerId" TEXT,
    "technicalOwnerId" TEXT,
    "status" "PricingEstimateStatus" NOT NULL DEFAULT 'RASCUNHO',
    "parameterVersionId" TEXT NOT NULL,
    "internalNotes" TEXT,
    "commercialNotes" TEXT,
    "calculatedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "itemsTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountType" TEXT,
    "discountValue" DECIMAL(14,4),
    "discountReason" TEXT,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "negotiatedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "operationalCostTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(8,6) NOT NULL DEFAULT 0,
    "calculatedMargin" DECIMAL(10,6),
    "effectiveMargin" DECIMAL(10,6),
    "requiredApproval" "ApprovalLevel",
    "approvedLevel" "ApprovalLevel",
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingEstimateItem" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "serviceCode" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL,
    "inputs" JSONB NOT NULL,
    "currentCalculationId" TEXT,
    "operationalCost" DECIMAL(14,2) NOT NULL,
    "calculatedPrice" DECIMAL(14,2) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "marginOverride" DECIMAL(10,6),
    "extraCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "extraCostReason" TEXT,
    "priceOverride" DECIMAL(14,2),
    "negotiatedPrice" DECIMAL(14,2) NOT NULL,
    "effectiveMargin" DECIMAL(10,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingEstimateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingCalculation" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT,
    "itemId" TEXT,
    "parameterVersionId" TEXT NOT NULL,
    "engineVersion" "PricingEngineVersion" NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "operationalCost" DECIMAL(14,2) NOT NULL,
    "finalPrice" DECIMAL(14,2) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingCalculationComponent" (
    "id" TEXT NOT NULL,
    "calculationId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "value" DECIMAL(20,6) NOT NULL,
    "formula" TEXT NOT NULL,

    CONSTRAINT "PricingCalculationComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingOverride" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "itemId" TEXT,
    "type" "PricingOverrideType" NOT NULL,
    "previousValue" DECIMAL(20,6),
    "newValue" DECIMAL(20,6),
    "calculatedPrice" DECIMAL(14,2),
    "negotiatedPrice" DECIMAL(14,2),
    "difference" DECIMAL(14,2),
    "discountPercent" DECIMAL(10,6),
    "reason" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialProposal" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "estimateId" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'RASCUNHO',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "clientId" TEXT NOT NULL,
    "contactId" TEXT,
    "propertyId" TEXT,
    "title" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "scope" TEXT,
    "deadline" TEXT,
    "paymentTerms" TEXT,
    "conditions" TEXT,
    "assumptions" TEXT,
    "exclusions" TEXT,
    "responsibilities" TEXT,
    "notes" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "sentTo" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "acceptedBy" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialProposalItem" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "estimateItemId" TEXT,

    CONSTRAINT "CommercialProposalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalApproval" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "level" "ApprovalLevel" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDENTE',
    "marginAtRequest" DECIMAL(10,6) NOT NULL,
    "totalAtRequest" DECIMAL(14,2) NOT NULL,
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "comment" TEXT,

    CONSTRAINT "ProposalApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "estimateId" TEXT,
    "field" TEXT,
    "previousValue" TEXT,
    "newValue" TEXT,
    "justification" TEXT,
    "ip" TEXT,

    CONSTRAINT "PricingAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PricingItemTrees" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PricingItemTrees_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingParameterVersion_label_key" ON "PricingParameterVersion"("label");

-- CreateIndex
CREATE INDEX "PricingParameterVersion_active_idx" ON "PricingParameterVersion"("active");

-- CreateIndex
CREATE UNIQUE INDEX "PricingParameter_versionId_key_key" ON "PricingParameter"("versionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PricingService_code_key" ON "PricingService"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PricingProductivityRule_versionId_serviceCode_difficulty_key" ON "PricingProductivityRule"("versionId", "serviceCode", "difficulty");

-- CreateIndex
CREATE UNIQUE INDEX "PricingModifier_versionId_serviceCode_key_key" ON "PricingModifier"("versionId", "serviceCode", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PricingServiceType_versionId_serviceCode_code_key" ON "PricingServiceType"("versionId", "serviceCode", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PricingEstimate_number_key" ON "PricingEstimate"("number");

-- CreateIndex
CREATE INDEX "PricingEstimate_status_idx" ON "PricingEstimate"("status");

-- CreateIndex
CREATE INDEX "PricingEstimate_clientId_idx" ON "PricingEstimate"("clientId");

-- CreateIndex
CREATE INDEX "PricingEstimate_date_idx" ON "PricingEstimate"("date");

-- CreateIndex
CREATE UNIQUE INDEX "PricingEstimateItem_currentCalculationId_key" ON "PricingEstimateItem"("currentCalculationId");

-- CreateIndex
CREATE INDEX "PricingEstimateItem_estimateId_idx" ON "PricingEstimateItem"("estimateId");

-- CreateIndex
CREATE INDEX "PricingCalculation_itemId_idx" ON "PricingCalculation"("itemId");

-- CreateIndex
CREATE INDEX "PricingOverride_estimateId_idx" ON "PricingOverride"("estimateId");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialProposal_number_key" ON "CommercialProposal"("number");

-- CreateIndex
CREATE INDEX "CommercialProposal_estimateId_idx" ON "CommercialProposal"("estimateId");

-- CreateIndex
CREATE INDEX "ProposalApproval_estimateId_idx" ON "ProposalApproval"("estimateId");

-- CreateIndex
CREATE INDEX "ProposalApproval_status_idx" ON "ProposalApproval"("status");

-- CreateIndex
CREATE INDEX "PricingAuditLog_estimateId_idx" ON "PricingAuditLog"("estimateId");

-- CreateIndex
CREATE INDEX "PricingAuditLog_createdAt_idx" ON "PricingAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "_PricingItemTrees_B_index" ON "_PricingItemTrees"("B");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_pricingEstimateId_fkey" FOREIGN KEY ("pricingEstimateId") REFERENCES "PricingEstimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_pricingEstimateId_fkey" FOREIGN KEY ("pricingEstimateId") REFERENCES "PricingEstimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingParameterVersion" ADD CONSTRAINT "PricingParameterVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingParameter" ADD CONSTRAINT "PricingParameter_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PricingParameterVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingProductivityRule" ADD CONSTRAINT "PricingProductivityRule_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PricingParameterVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingModifier" ADD CONSTRAINT "PricingModifier_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PricingParameterVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingServiceType" ADD CONSTRAINT "PricingServiceType_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PricingParameterVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingLicenseTier" ADD CONSTRAINT "PricingLicenseTier_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PricingParameterVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingEstimate" ADD CONSTRAINT "PricingEstimate_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PricingEstimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingEstimate" ADD CONSTRAINT "PricingEstimate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingEstimate" ADD CONSTRAINT "PricingEstimate_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingEstimate" ADD CONSTRAINT "PricingEstimate_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingEstimate" ADD CONSTRAINT "PricingEstimate_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingEstimate" ADD CONSTRAINT "PricingEstimate_commercialOwnerId_fkey" FOREIGN KEY ("commercialOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingEstimate" ADD CONSTRAINT "PricingEstimate_technicalOwnerId_fkey" FOREIGN KEY ("technicalOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingEstimate" ADD CONSTRAINT "PricingEstimate_parameterVersionId_fkey" FOREIGN KEY ("parameterVersionId") REFERENCES "PricingParameterVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingEstimate" ADD CONSTRAINT "PricingEstimate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingEstimateItem" ADD CONSTRAINT "PricingEstimateItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "PricingEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingEstimateItem" ADD CONSTRAINT "PricingEstimateItem_currentCalculationId_fkey" FOREIGN KEY ("currentCalculationId") REFERENCES "PricingCalculation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingCalculation" ADD CONSTRAINT "PricingCalculation_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "PricingEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingCalculation" ADD CONSTRAINT "PricingCalculation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PricingEstimateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingCalculation" ADD CONSTRAINT "PricingCalculation_parameterVersionId_fkey" FOREIGN KEY ("parameterVersionId") REFERENCES "PricingParameterVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingCalculation" ADD CONSTRAINT "PricingCalculation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingCalculationComponent" ADD CONSTRAINT "PricingCalculationComponent_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "PricingCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingOverride" ADD CONSTRAINT "PricingOverride_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "PricingEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingOverride" ADD CONSTRAINT "PricingOverride_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PricingEstimateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingOverride" ADD CONSTRAINT "PricingOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialProposal" ADD CONSTRAINT "CommercialProposal_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "PricingEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialProposal" ADD CONSTRAINT "CommercialProposal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialProposal" ADD CONSTRAINT "CommercialProposal_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialProposal" ADD CONSTRAINT "CommercialProposal_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialProposal" ADD CONSTRAINT "CommercialProposal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialProposalItem" ADD CONSTRAINT "CommercialProposalItem_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "CommercialProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalApproval" ADD CONSTRAINT "ProposalApproval_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "PricingEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalApproval" ADD CONSTRAINT "ProposalApproval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalApproval" ADD CONSTRAINT "ProposalApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingAuditLog" ADD CONSTRAINT "PricingAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingAuditLog" ADD CONSTRAINT "PricingAuditLog_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "PricingEstimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PricingItemTrees" ADD CONSTRAINT "_PricingItemTrees_A_fkey" FOREIGN KEY ("A") REFERENCES "PricingEstimateItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PricingItemTrees" ADD CONSTRAINT "_PricingItemTrees_B_fkey" FOREIGN KEY ("B") REFERENCES "Tree"("id") ON DELETE CASCADE ON UPDATE CASCADE;
