"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileUp, ImagePlus, Loader2 } from "lucide-react";
import { DOCUMENT_TYPES, PHOTO_TYPES } from "@/lib/catalogs";

type Refs = Partial<Record<"treeId" | "inspectionId" | "interventionId" | "workOrderId" | "clientId" | "propertyId" | "contractId", string>>;

/** Reduz a foto no próprio aparelho (máx. 2000 px, JPEG) antes do envio: economiza dados móveis e evita limites de upload. */
async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.size < 900_000) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

async function send(fd: FormData) {
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Falha no envio (${res.status}).`);
  return json;
}

export function PhotoUploader({ refs, defaultType = "GERAL", types = PHOTO_TYPES.map((t) => t.value) }: { refs: Refs; defaultType?: string; types?: string[] }) {
  const router = useRouter();
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState(defaultType);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<{ busy: boolean; msg?: string; error?: boolean }>({ busy: false });

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setStatus({ busy: true, msg: `Enviando ${files.length} foto(s)…` });
    let ok = 0;
    try {
      for (const f of Array.from(files)) {
        const blob = await compressImage(f);
        const fd = new FormData();
        fd.set("kind", "photo");
        fd.set("type", type);
        fd.set("description", description);
        fd.set("takenAt", new Date(f.lastModified || Date.now()).toISOString());
        for (const [k, v] of Object.entries(refs)) if (v) fd.set(k, v);
        fd.set("file", blob, f.name.replace(/\.\w+$/, "") + ".jpg");
        await send(fd);
        ok++;
      }
      setStatus({ busy: false, msg: `${ok} foto(s) enviada(s).` });
      setDescription("");
      router.refresh();
    } catch (e) {
      setStatus({ busy: false, error: true, msg: (e as Error).message });
    } finally {
      if (camRef.current) camRef.current.value = "";
      if (galRef.current) galRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className="input" aria-label="Tipo de foto">
          {PHOTO_TYPES.filter((t) => types.includes(t.value)).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (opcional)" className="input" maxLength={500} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={status.busy} onClick={() => camRef.current?.click()} className="btn btn-primary min-h-12">
          {status.busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />} Câmera
        </button>
        <button type="button" disabled={status.busy} onClick={() => galRef.current?.click()} className="btn btn-secondary min-h-12">
          <ImagePlus className="size-5" /> Galeria
        </button>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => upload(e.target.files)} />
      <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
      {status.msg && <p className={`text-sm ${status.error ? "text-red-700" : "text-stone-600"}`} role="status">{status.msg}</p>}
    </div>
  );
}

export function DocumentUploader({ refs }: { refs: Refs }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [type, setType] = useState("LAUDO");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<{ busy: boolean; msg?: string; error?: boolean }>({ busy: false });

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setStatus({ busy: true, msg: "Enviando…" });
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.set("kind", "document");
        fd.set("type", type);
        fd.set("description", description);
        for (const [k, v] of Object.entries(refs)) if (v) fd.set(k, v);
        fd.set("file", f);
        await send(fd);
      }
      setStatus({ busy: false, msg: "Documento(s) enviado(s)." });
      setDescription("");
      router.refresh();
    } catch (e) {
      setStatus({ busy: false, error: true, msg: (e as Error).message });
    } finally {
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
        <select value={type} onChange={(e) => setType(e.target.value)} className="input" aria-label="Tipo de documento">
          {DOCUMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (opcional)" className="input" maxLength={500} />
        <button type="button" disabled={status.busy} onClick={() => ref.current?.click()} className="btn btn-primary">
          {status.busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} Anexar
        </button>
      </div>
      <input ref={ref} type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt,.csv,.kml" onChange={(e) => upload(e.target.files)} />
      <p className="text-xs text-stone-500">PDF, imagens, Word, Excel, TXT, CSV ou KML — até 20 MB (4 MB na Vercel).</p>
      {status.msg && <p className={`text-sm ${status.error ? "text-red-700" : "text-stone-600"}`} role="status">{status.msg}</p>}
    </div>
  );
}
