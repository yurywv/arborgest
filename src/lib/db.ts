import { PrismaClient } from "@prisma/client";

// Neon (integração Vercel) fornece DATABASE_URL_UNPOOLED; o schema usa DIRECT_URL para migrations.
process.env.DIRECT_URL ||= process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
