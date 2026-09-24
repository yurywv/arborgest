-- CreateTable
CREATE TABLE "CompensationRule" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "lawReference" TEXT NOT NULL,
    "seedlingsPerTree" DECIMAL(10,2) NOT NULL,
    "freightValue" DECIMAL(12,2),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompensationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompensationRule_state_city_idx" ON "CompensationRule"("state", "city");

-- CreateIndex
CREATE UNIQUE INDEX "CompensationRule_city_state_lawReference_key" ON "CompensationRule"("city", "state", "lawReference");
