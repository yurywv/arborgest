// Armazenamento de arquivos com três drivers:
//  - "local": disco (desenvolvimento / Railway com volume persistente)
//  - "s3": qualquer serviço compatível com S3 (AWS S3, Cloudflare R2, Supabase Storage, MinIO)
//  - "vercel-blob": Vercel Blob (store privado); escolhido automaticamente quando existe BLOB_READ_WRITE_TOKEN
// Os arquivos são sempre privados; o acesso passa por /api/files/[...key], que exige login.
import fs from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as blob from "@vercel/blob";

type Driver = "local" | "s3" | "vercel-blob";
const driver = (): Driver =>
  (process.env.STORAGE_DRIVER || (process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "local")) as Driver;
const blobAccess = () => (process.env.BLOB_ACCESS === "public" ? "public" : "private") as "public" | "private";
const KEY_RE = /^[a-z0-9][a-z0-9/_.-]{2,200}$/i;

export function assertSafeKey(key: string) {
  if (!KEY_RE.test(key) || key.includes("..") || key.includes("//")) throw new Error("Chave de arquivo inválida.");
}

function localPath(key: string) {
  assertSafeKey(key);
  const root = path.resolve(process.env.LOCAL_UPLOAD_DIR ?? "./uploads");
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Caminho inválido.");
  return full;
}

let s3: S3Client | null = null;
function s3Client() {
  if (!s3) {
    s3 = new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return s3;
}
const bucket = () => {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET não configurado.");
  return b;
};

export async function putObject(key: string, body: Buffer, contentType: string) {
  assertSafeKey(key);
  if (driver() === "vercel-blob") {
    await blob.put(key, body, { access: blobAccess(), contentType, addRandomSuffix: false, allowOverwrite: true });
    return;
  }
  if (driver() === "s3") {
    await s3Client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
    return;
  }
  const p = localPath(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, body);
}

/** Lê o objeto inteiro (usado em relatórios PDF e no driver local). */
export async function getObject(key: string): Promise<Buffer | null> {
  assertSafeKey(key);
  try {
    if (driver() === "vercel-blob") {
      const r = await blob.get(key, { access: blobAccess() });
      if (!r || r.statusCode !== 200) return null;
      return Buffer.from(await new Response(r.stream).arrayBuffer());
    }
    if (driver() === "s3") {
      const r = await s3Client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
      const bytes = await r.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    }
    return await fs.readFile(localPath(key));
  } catch {
    return null;
  }
}

/** URL temporária (5 min) para download direto do bucket; null no driver local. */
export async function signedUrl(key: string, fileName?: string): Promise<string | null> {
  if (driver() !== "s3") return null;
  return getSignedUrl(
    s3Client(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: fileName ? `inline; filename="${encodeURIComponent(fileName)}"` : undefined,
    }),
    { expiresIn: 300 },
  );
}

export async function deleteObject(key: string) {
  assertSafeKey(key);
  try {
    if (driver() === "vercel-blob") await blob.del(key);
    else if (driver() === "s3") await s3Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
    else await fs.unlink(localPath(key));
  } catch (e) {
    console.warn("[storage] falha ao remover", key, e);
  }
}
