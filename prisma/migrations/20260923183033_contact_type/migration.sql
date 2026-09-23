-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('GERAL', 'ADMINISTRATIVO', 'COMERCIAL', 'TECNICO');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "type" "ContactType" NOT NULL DEFAULT 'GERAL';

-- CreateIndex
CREATE INDEX "Contact_type_idx" ON "Contact"("type");
