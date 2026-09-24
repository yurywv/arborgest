/* Inicialização de ambiente real (sem dados de demonstração):
 *   - cria/atualiza os perfis de acesso padrão
 *   - carrega o catálogo de referência de espécies (só insere as que faltam; não altera edições)
 *   - cria o primeiro administrador a partir de ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME
 * Idempotente. Executar: npm run db:bootstrap
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_ROLES, PERMISSION_MIGRATIONS } from "../src/lib/auth/permissions";
import { ensurePricingSetup } from "../src/lib/pricing/store-core";
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

  // Novos módulos: acrescenta as permissões padrão aos perfis de sistema já existentes (uma única vez,
  // para não desfazer ajustes posteriores feitos em Administração › Perfis).
  for (const m of PERMISSION_MIGRATIONS) {
    const key = `perm_migration:${m.id}`;
    if (await db.setting.findUnique({ where: { key } })) continue;
    for (const r of DEFAULT_ROLES) {
      const wanted = r.permissions.filter((p) => m.perms.includes(p));
      if (!wanted.length) continue;
      const role = await db.role.findUnique({ where: { key: r.key } });
      if (role) await db.role.update({ where: { id: role.id }, data: { permissions: [...new Set([...role.permissions, ...wanted])] } });
    }
    await db.setting.create({ data: { key, value: new Date().toISOString() } });
    console.log(`✓ permissões do módulo "${m.id}" aplicadas aos perfis`);
  }

  const pricing = await ensurePricingSetup(db);
  console.log(pricing.created ? "✓ precificação: versão 1.0 (legado Excel) criada" : "✓ precificação: parâmetros existentes mantidos");

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
