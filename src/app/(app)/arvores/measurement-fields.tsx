"use client";
import { useState } from "react";
import { Calculator } from "lucide-react";
import { Field, NumberField, TextArea } from "@/components/form";
import { crownArea, dapFromCap, equivalentDap } from "@/lib/arbo";

const n = (s: string) => {
  const v = Number(s.replace(",", "."));
  return s.trim() && Number.isFinite(v) ? v : null;
};

/** Campos de biometria com cálculo automático de DAP (CAP/π), DAP equivalente multifuste e área de copa. */
export function MeasurementFields({ prefix = "", showDate = true, showNotes = true }: { prefix?: string; showDate?: boolean; showNotes?: boolean }) {
  const [cap, setCap] = useState("");
  const [dap, setDap] = useState("");
  const [stems, setStems] = useState("");
  const [ns, setNs] = useState("");
  const [ew, setEw] = useState("");

  const stemList = stems.split(/[;\s]+/).map((s) => n(s.replace(/,$/, ""))).filter((x): x is number => !!x);
  const calcDap = stemList.length > 1 ? equivalentDap(stemList) : n(cap) ? dapFromCap(n(cap)!) : null;
  const area = crownArea(n(ns), n(ew));
  const p = (k: string) => prefix + k;

  return (
    <>
      {showDate && <Field name={p("measuredAt")} type="date" label="Data da medição" defaultValue={new Date().toISOString().slice(0, 10)} />}
      <NumberField name={p("measurementHeight")} label="Altura da medição" suffix="m" defaultValue="1,3" />
      <NumberField name={p("cap")} label="CAP — circunferência" suffix="cm" value={cap} onChange={(e) => setCap(e.target.value)} hint="Preencha o CAP para calcular o DAP." />
      <NumberField name={p("dap")} label="DAP — diâmetro" suffix="cm" value={calcDap ? String(calcDap).replace(".", ",") : dap} onChange={(e) => setDap(e.target.value)} readOnly={!!calcDap}
        className={calcDap ? "bg-brand-50 font-semibold" : ""} hint={calcDap ? (stemList.length > 1 ? "DAP equivalente √Σd² (multifuste)" : "Calculado: DAP = CAP / π") : undefined} />
      <NumberField name={p("stemCount")} label="Número de fustes" decimals={false} defaultValue="1" />
      <Field name={p("stemDaps")} label="DAP de cada fuste (cm)" value={stems} onChange={(e) => setStems(e.target.value)} hint="Separe por ponto e vírgula ou espaço." />
      <NumberField name={p("totalHeight")} label="Altura total" suffix="m" />
      <NumberField name={p("stemHeight")} label="Altura do fuste" suffix="m" />
      <NumberField name={p("crownBaseHeight")} label="Altura do início da copa" suffix="m" />
      <div />
      <NumberField name={p("crownDiameterNS")} label="Diâmetro da copa N-S" suffix="m" value={ns} onChange={(e) => setNs(e.target.value)} />
      <NumberField name={p("crownDiameterEW")} label="Diâmetro da copa L-O" suffix="m" value={ew} onChange={(e) => setEw(e.target.value)} />
      <div className="flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 text-sm sm:col-span-2">
        <Calculator className="size-4 text-stone-500" />
        Área aproximada da copa (elipse): <strong>{area ? `${String(area).replace(".", ",")} m²` : "—"}</strong>
      </div>
      {showNotes && <TextArea name={p("notes")} label="Observações da medição" rows={2} wrapClassName="sm:col-span-2" />}
    </>
  );
}
