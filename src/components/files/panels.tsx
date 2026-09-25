import { FileText, Download, Trash2, ImageOff } from "lucide-react";
import type { Document, Photo, User } from "@prisma/client";
import { ActionButton } from "@/components/form";
import { Badge } from "@/components/ui";
import { DOCUMENT_TYPES, PHOTO_TYPES, labelOf } from "@/lib/catalogs";
import { fmtDateTime } from "@/lib/format";
import { fileUrl } from "@/lib/files";
import { deleteDocument, deletePhoto } from "./actions";

type PhotoRow = Photo & { uploadedBy?: Pick<User, "name"> | null };
type DocRow = Document & { uploadedBy?: Pick<User, "name"> | null; proposal?: { number: string } | null };

export function PhotoGallery({ photos, canDelete }: { photos: PhotoRow[]; canDelete?: boolean }) {
  if (!photos.length)
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-stone-500">
        <ImageOff className="size-4" /> Nenhuma foto registrada.
      </p>
    );
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((p) => (
        <li key={p.id} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <a href={fileUrl(p.storageKey)} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] bg-stone-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl(p.storageKey)} alt={p.description ?? labelOf(PHOTO_TYPES, p.type)} loading="lazy" className="size-full object-cover" />
          </a>
          <div className="space-y-1 p-2 text-xs">
            <div className="flex items-center justify-between gap-1">
              <Badge tone="green">{labelOf(PHOTO_TYPES, p.type)}</Badge>
              {canDelete && (
                <ActionButton action={deletePhoto.bind(null, p.id)} confirm="Excluir esta foto?" variant="danger-ghost" size="sm" className="min-h-7 px-1.5">
                  <Trash2 className="size-3.5" />
                </ActionButton>
              )}
            </div>
            {p.description && <p className="line-clamp-2 text-stone-700">{p.description}</p>}
            <p className="text-stone-500">{fmtDateTime(p.takenAt)}{p.uploadedBy ? ` · ${p.uploadedBy.name}` : ""}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

const size = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

export function DocumentList({ docs, canDelete }: { docs: DocRow[]; canDelete?: boolean }) {
  if (!docs.length) return <p className="py-6 text-sm text-stone-500">Nenhum documento anexado.</p>;
  return (
    <ul className="divide-y divide-stone-100">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center gap-3 py-2.5">
          <FileText className="size-8 shrink-0 text-stone-400" />
          <div className="min-w-0 flex-1">
            <a href={fileUrl(d.storageKey)} target="_blank" rel="noopener noreferrer" className="link block truncate">{d.fileName}</a>
            <p className="truncate text-xs text-stone-500">
              {labelOf(DOCUMENT_TYPES, d.type)}{d.proposal ? ` (${d.proposal.number})` : ""} · {size(d.size)} · {fmtDateTime(d.createdAt)}{d.uploadedBy ? ` · ${d.uploadedBy.name}` : ""}
              {d.description ? ` — ${d.description}` : ""}
            </p>
          </div>
          <a href={fileUrl(d.storageKey)} download className="btn btn-ghost btn-sm" aria-label="Baixar"><Download className="size-4" /></a>
          {canDelete && (
            <ActionButton action={deleteDocument.bind(null, d.id)} confirm={`Excluir "${d.fileName}"?`} variant="danger-ghost" size="sm">
              <Trash2 className="size-4" />
            </ActionButton>
          )}
        </li>
      ))}
    </ul>
  );
}
