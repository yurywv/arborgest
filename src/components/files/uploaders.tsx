"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileUp, ImagePlus, Loader2 } from "lucide-react";
import { DOCUMENT_TYPES, PHOTO_TYPES } from "@/lib/catalogs";

type Refs = Partial<Record<"treeId" | "inspectionId" | "interventionId" | "workOrderId" | "clientId" | "propertyId" | "contractId" | "proposalId", string>>;

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
      <div className="grid items-end gap-2 sm:grid-cols-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className="input" aria-label="Tipo de foto">
          {PHOTO_TYPES.filter((t) => types.includes(t.value)).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <label className="min-w-0"><span className="mb-0.5 block text-[11px] font-medium text-stone-500">Descrição (opcional)</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="input" maxLength={500} autoComplete="off"/></label>
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

const FUNCTION_BODY_LIMIT = 4 * 1024 * 1024; // acima disso, na Vercel o arquivo vai direto para o Blob

function directKey(name: string) {
  const d = new Date();
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
  const safe = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+/, "").slice(-120) || "arquivo";
  return `docs/direto/${ym}/${hex}-${safe}`;
}

/** Envia um documento. Arquivos grandes vão direto ao Vercel Blob (quando é o armazenamento em uso) e depois são registrados. */
async function sendDocument(f: File, fields: Record<string, string>) {
  const fd = new FormData();
  fd.set("kind", "document");
  for (const [k, v] of Object.entries(fields)) if (v) fd.set(k, v);
  if (f.size > FUNCTION_BODY_LIMIT) {
    const cfg = await fetch("/api/uploads/blob").then((r) => r.json()).catch(() => ({ direct: false }));
    if (cfg.direct) {
      const { upload } = await import("@vercel/blob/client");
      const key = directKey(f.name);
      await upload(key, f, { access: cfg.access, handleUploadUrl: "/api/uploads/blob", contentType: f.type || undefined, multipart: f.size > 8 * 1024 * 1024 });
      fd.set("blobKey", key);
      fd.set("fileName", f.name);
      return send(fd);
    }
  }
  fd.set("file", f);
  return send(fd);
}

export function DocumentUploader({ refs, proposals }: { refs: Refs; proposals?: { id: string; label: string }[] }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const uid = useId();
  const [type, setType] = useState("");
  const [proposalId, setProposalId] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<{ busy: boolean; msg?: string; error?: boolean }>({ busy: false });

  const pick = () => {
    if (!type) return setStatus({ busy: false, error: true, msg: "Selecione o tipo do documento antes de anexar." });
    ref.current?.click();
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setStatus({ busy: true, msg: "Enviando…" });
    try {
      for (const f of Array.from(files)) {
        setStatus({ busy: true, msg: `Enviando ${f.name}…` });
        await sendDocument(f, { type, description, ...(proposalId && { proposalId }), ...Object.fromEntries(Object.entries(refs).filter(([, v]) => v)) as Record<string, string> });
      }
      setStatus({ busy: false, msg: "Documento(s) enviado(s)." });
      setDescription("");
      setType("");
      setProposalId("");
      router.refresh();
    } catch (e) {
      setStatus({ busy: false, error: true, msg: (e as Error).message });
    } finally {
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <div className="@container space-y-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-3">
      <div className={`grid items-end gap-2 ${proposals?.length ? "@lg:grid-cols-2" : "@lg:grid-cols-[1fr_2fr]"}`}>
        <label className="min-w-0"><span className="mb-0.5 block text-[11px] font-medium text-stone-500">Tipo do documento *</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className="input" id={`doc-type${uid}`}>
            <option value="">Selecione…</option>
            {DOCUMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select></label>
        {!!proposals?.length && (
          <label className="min-w-0"><span className="mb-0.5 block text-[11px] font-medium text-stone-500">Proposta relacionada (opcional)</span>
            <select value={proposalId} onChange={(e) => setProposalId(e.target.value)} className="input" id={`doc-proposal${uid}`}>
              <option value="">Nenhuma</option>
              {proposals.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select></label>
        )}
        <label className={`min-w-0 ${proposals?.length ? "@lg:col-span-2" : ""}`}><span className="mb-0.5 block text-[11px] font-medium text-stone-500">Descrição (opcional)</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="input" maxLength={500} autoComplete="off" id={`doc-description${uid}`}/></label>
      </div>
      <button type="button" disabled={status.busy} onClick={pick} className="btn btn-primary w-full @lg:w-auto">
        {status.busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} Anexar arquivo
      </button>
      <input ref={ref} type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt,.csv,.kml" onChange={(e) => upload(e.target.files)} />
      <p className="text-xs text-stone-500">PDF, imagens, Word, Excel, TXT, CSV ou KML — até 20 MB por arquivo.</p>
      {status.msg && <p className={`text-sm ${status.error ? "text-red-700" : "text-stone-600"}`} role="status">{status.msg}</p>}
    </div>
  );
}
