-- CreateTable
CREATE TABLE "_OpportunityRiskAssessments" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_OpportunityRiskAssessments_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_OpportunityInspections" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_OpportunityInspections_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_EstimateInspections" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EstimateInspections_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_EstimateRiskAssessments" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EstimateRiskAssessments_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_OpportunityRiskAssessments_B_index" ON "_OpportunityRiskAssessments"("B");

-- CreateIndex
CREATE INDEX "_OpportunityInspections_B_index" ON "_OpportunityInspections"("B");

-- CreateIndex
CREATE INDEX "_EstimateInspections_B_index" ON "_EstimateInspections"("B");

-- CreateIndex
CREATE INDEX "_EstimateRiskAssessments_B_index" ON "_EstimateRiskAssessments"("B");

-- AddForeignKey
ALTER TABLE "_OpportunityRiskAssessments" ADD CONSTRAINT "_OpportunityRiskAssessments_A_fkey" FOREIGN KEY ("A") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OpportunityRiskAssessments" ADD CONSTRAINT "_OpportunityRiskAssessments_B_fkey" FOREIGN KEY ("B") REFERENCES "RiskAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OpportunityInspections" ADD CONSTRAINT "_OpportunityInspections_A_fkey" FOREIGN KEY ("A") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OpportunityInspections" ADD CONSTRAINT "_OpportunityInspections_B_fkey" FOREIGN KEY ("B") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EstimateInspections" ADD CONSTRAINT "_EstimateInspections_A_fkey" FOREIGN KEY ("A") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EstimateInspections" ADD CONSTRAINT "_EstimateInspections_B_fkey" FOREIGN KEY ("B") REFERENCES "PricingEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EstimateRiskAssessments" ADD CONSTRAINT "_EstimateRiskAssessments_A_fkey" FOREIGN KEY ("A") REFERENCES "PricingEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EstimateRiskAssessments" ADD CONSTRAINT "_EstimateRiskAssessments_B_fkey" FOREIGN KEY ("B") REFERENCES "RiskAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
