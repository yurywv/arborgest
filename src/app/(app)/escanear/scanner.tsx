"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, Search } from "lucide-react";

/** Extrai o código ARB de um QR (URL /arvores/ARB-000001 ou o próprio código). */
function extractCode(text: string) {
  const m = text.match(/ARB-\d{6,}/i);
  return m ? m[0].toUpperCase() : null;
}

export function Scanner() {
  const router = useRouter();
  const ref = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [manual, setManual] = useState("");

  const stop = async () => {
    try {
      if (ref.current?.isScanning) await ref.current.stop();
    } catch {}
    setRunning(false);
  };

  const start = async () => {
    setError(null);
    try {
      ref.current ??= new Html5Qrcode("qr-reader", { verbose: false });
      await ref.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.7); return { width: s, height: s }; } },
        async (text) => {
          const code = extractCode(text);
          if (!code) {
            setError("QR Code não reconhecido como etiqueta de árvore.");
            return;
          }
          await stop();
          if (navigator.vibrate) navigator.vibrate(80);
          router.push(`/arvores/${code}`);
        },
        () => {},
      );
      setRunning(true);
    } catch (e) {
      setRunning(false);
      setError(String(e).includes("Permission") || String(e).includes("NotAllowed")
        ? "Permissão da câmera negada. Libere o acesso nas configurações do navegador."
        : "Não foi possível abrir a câmera neste dispositivo.");
    }
  };

  useEffect(() => {
    start();
    return () => { stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl bg-black">
        <div id="qr-reader" className="mx-auto aspect-square w-full max-w-md" />
      </div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {!running && (
        <button onClick={start} className="btn btn-primary min-h-14 w-full text-base"><Camera className="size-5" /> Abrir câmera</button>
      )}
      <form
        className="card flex items-end gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const code = extractCode(manual) ?? (/^\d+$/.test(manual.trim()) ? `ARB-${manual.trim().padStart(6, "0")}` : null);
          if (code) router.push(`/arvores/${code}`);
          else router.push(`/busca?q=${encodeURIComponent(manual)}`);
        }}
      >
        <label className="min-w-0 flex-1"><span className="mb-0.5 block text-xs font-medium text-stone-500">Código da árvore (digitação manual)</span>
          <input value={manual} onChange={(e) => setManual(e.target.value)} className="input" inputMode="text" autoComplete="off" /></label>
        <button className="btn btn-secondary" aria-label="Buscar"><Search className="size-4" /></button>
      </form>
    </div>
  );
}
