/* Inicialização de ambiente real (sem dados de demonstração):
 *   - cria/atualiza os perfis de acesso padrão
 *   - carrega o catálogo de referência de espécies (só insere as que faltam; não altera edições)
 *   - cria o primeiro administrador a partir de ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME
 * Idempotente. Executar: npm run db:bootstrap
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_ROLES } from "../src/lib/auth/permissions";
import { speciesCatalogData } from "./data/species-catalog";

const db = new PrismaClient();

async function main() {
  for (const r of DEFAULT_ROLES) {
    await db.role.upsert({
      where: { key: r.key },
      create: { ...r, isSystem: true },
      update: {}, // não sobrescreve ajustes feitos em Administração › Perfis
    });
  }
  console.log(`✓ ${DEFAULT_ROLES.length} perfis garantidos`);

  const catalog = speciesCatalogData();
  const { count } = await db.species.createMany({ data: catalog, skipDuplicates: true });
  console.log(`✓ catálogo de espécies: ${count} nova(s), ${catalog.length - count} já existente(s)`);

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("ℹ ADMIN_EMAIL/ADMIN_PASSWORD não definidos — nenhum administrador criado.");
    return;
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error("ADMIN_PASSWORD deve ter 8+ caracteres, com letras e números.");
  }
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) {
    console.log(`ℹ usuário ${email} já existe — mantido.`);
    return;
  }
  const admin = await db.role.findUniqueOrThrow({ where: { key: "ADMIN" } });
  await db.user.create({
    data: { email, name: process.env.ADMIN_NAME ?? "Administrador", passwordHash: await bcrypt.hash(password, 12), roleId: admin.id },
  });
  console.log(`✓ administrador ${email} criado`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
