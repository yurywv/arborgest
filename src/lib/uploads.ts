import "server-only";
import crypto from "node:crypto";
import sharp from "sharp";

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_DOC_BYTES = 20 * 1024 * 1024;

const DOC_MIME: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/msword": ["doc"],
  "application/vnd.ms-excel": ["xls"],
  "text/plain": ["txt"],
  "text/csv": ["csv"],
  "application/vnd.google-earth.kml+xml": ["kml"],
};

const ext = (name: string) => name.toLowerCase().split(".").pop() ?? "";

/** Verifica assinatura binária (magic bytes) coerente com a extensão declarada. */
function sniff(buf: Buffer, extension: string) {
  const head = buf.subarray(0, 8);
  if (extension === "pdf") return head.subarray(0, 4).toString() === "%PDF";
  if (["jpg", "jpeg"].includes(extension)) return head[0] === 0xff && head[1] === 0xd8;
  if (extension === "png") return head[0] === 0x89 && head.subarray(1, 4).toString() === "PNG";
  if (["docx", "xlsx"].includes(extension)) return head[0] === 0x50 && head[1] === 0x4b; // ZIP
  if (["doc", "xls"].includes(extension)) return head[0] === 0xd0 && head[1] === 0xcf; // OLE
  if (["txt", "csv", "kml"].includes(extension)) return !buf.subarray(0, 4096).includes(0);
  return false;
}

export function safeFileName(name: string) {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return base.slice(-80).replace(/^[-.]+/, "") || "arquivo";
}

const datePrefix = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const rand = () => crypto.randomBytes(12).toString("hex");

/** Normaliza foto: valida que é imagem real, corrige orientação EXIF, redimensiona e remove metadados. */
export async function processPhoto(buf: Buffer) {
  if (buf.length > MAX_PHOTO_BYTES) throw new Error("Foto maior que 15 MB.");
  let img;
  try {
    img = sharp(buf, { failOn: "error" }).rotate();
    await img.metadata();
  } catch {
    throw new Error("Arquivo de imagem inválido ou não suportado.");
  }
  const out = await img.resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return {
    buffer: out.data,
    width: out.info.width,
    height: out.info.height,
    mimeType: "image/jpeg",
    key: `photos/${datePrefix()}/${rand()}.jpg`,
  };
}

export function validateDocument(buf: Buffer, fileName: string, declaredMime: string) {
  if (buf.length > MAX_DOC_BYTES) throw new Error("Documento maior que 20 MB.");
  if (buf.length === 0) throw new Error("Arquivo vazio.");
  const e = ext(fileName);
  const mime = Object.entries(DOC_MIME).find(([, exts]) => exts.includes(e))?.[0];
  if (!mime) throw new Error("Tipo de arquivo não permitido. Use PDF, imagens, Word, Excel, TXT, CSV ou KML.");
  if (!sniff(buf, e)) throw new Error("O conteúdo do arquivo não corresponde à extensão.");
  void declaredMime;
  return { mimeType: mime, key: `docs/${datePrefix()}/${rand()}-${safeFileName(fileName)}` };
}

/** Chaves de documentos enviados direto do navegador para o Vercel Blob (arquivos acima do limite de 4,5 MB das funções). */
export const DIRECT_DOC_KEY = /^docs\/direto\/\d{4}-\d{2}\/[a-f0-9]{24}-[a-z0-9._-]{1,120}$/;
