-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "addressComplement" TEXT,
ADD COLUMN     "addressNumber" TEXT;

-- AlterTable
ALTER TABLE "Tree" ADD COLUMN     "addressNumber" TEXT;

-- Dados existentes: separa o número que foi digitado no fim do logradouro ("Rua das Flores, 123" / "Praça X, s/n").
-- Só age quando o número está vazio e o final é inequívoco; os demais endereços ficam como estão.
UPDATE "Client"
SET "addressNumber" = (regexp_match("address", '^(.*\S)\s*,\s*([0-9]{1,6}[A-Za-z]?|[sS]/[nN])\s*$'))[2],
    "address"       = (regexp_match("address", '^(.*\S)\s*,\s*([0-9]{1,6}[A-Za-z]?|[sS]/[nN])\s*$'))[1]
WHERE "addressNumber" IS NULL AND "address" ~ '^(.*\S)\s*,\s*([0-9]{1,6}[A-Za-z]?|[sS]/[nN])\s*$';

UPDATE "Property"
SET "number"  = (regexp_match("address", '^(.*\S)\s*,\s*([0-9]{1,6}[A-Za-z]?|[sS]/[nN])\s*$'))[2],
    "address" = (regexp_match("address", '^(.*\S)\s*,\s*([0-9]{1,6}[A-Za-z]?|[sS]/[nN])\s*$'))[1]
WHERE ("number" IS NULL OR "number" = '') AND "address" ~ '^(.*\S)\s*,\s*([0-9]{1,6}[A-Za-z]?|[sS]/[nN])\s*$';

UPDATE "Tree"
SET "addressNumber" = (regexp_match("address", '^(.*\S)\s*,\s*([0-9]{1,6}[A-Za-z]?|[sS]/[nN])\s*$'))[2],
    "address"       = (regexp_match("address", '^(.*\S)\s*,\s*([0-9]{1,6}[A-Za-z]?|[sS]/[nN])\s*$'))[1]
WHERE "addressNumber" IS NULL AND "address" ~ '^(.*\S)\s*,\s*([0-9]{1,6}[A-Za-z]?|[sS]/[nN])\s*$';
