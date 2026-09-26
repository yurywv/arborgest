import "server-only";
import crypto from "node:crypto";

/* Cifra segredos gravados no banco (ex.: senha de app do Gmail) com AES-256-GCM.
 * A chave deriva de AUTH_SECRET: sem ela o valor salvo não pode ser lido. */
const key = (purpose: string) => {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET ausente: não é possível proteger segredos.");
  return crypto.createHash("sha256").update(`arborgest:${purpose}:${secret}`).digest();
};

export function seal(plain: string, purpose: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(purpose), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}

export function open(sealed: string, purpose: string): string | null {
  try {
    const [v, iv, tag, data] = sealed.split(".");
    if (v !== "v1") return null;
    const d = crypto.createDecipheriv("aes-256-gcm", key(purpose), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
