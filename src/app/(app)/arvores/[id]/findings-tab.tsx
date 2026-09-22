import Link from "next/link";
import { Check, Minus } from "lucide-react";
import type { Inspection, InspectionFinding, User } from "@prisma/client";
import { FINDINGS_BY_CATEGORY, LEVEL3, labelOf, type FindingCategoryKey } from "@/lib/catalogs";
import { fmtDate, fmtNum } from "@/lib/format";
import { Card, ConditionBadge, DataList } from "@/components/ui";

type Insp = Inspection & { findings: InspectionFinding[]; inspector: Pick<User, "name"> | null };

const CONDITION_FIELD: Record<FindingCategoryKey, "rootCondition" | "trunkCondition" | "crownCondition" | "phytoCondition"> = {
  RAIZES: "rootCondition", TRONCO: "trunkCondition", COPA: "crownCondition", FITOSSANIDADE: "phytoCondition",
};

/** Aba Raízes / Tronco / Copa / Fitossanidade: estado da última inspeção + evolução histórica. */
export function FindingsTab({ category, inspections, treeCode }: { category: FindingCategoryKey; inspections: Insp[]; treeCode: string }) {
  const cat = FINDINGS_BY_CATEGORY[category];
  const last = inspections[0];
  if (!last)
    return (
      <Card>
        <p className="text-sm text-stone-500">
          Sem inspeções registradas. <Link className="link" href={`/inspecoes/nova?arvore=${treeCode}`}>Registrar a primeira inspeção</Link>.
        </p>
      </Card>
    );
  const present = new Map(last.findings.filter((f) => f.category === category).map((f) => [f.code, f]));
  const extra: [string, React.ReactNode][] = [];
  if (category === "TRONCO" && last.trunkLeanDegrees != null) extra.push(["Inclinação do tronco", `${fmtNum(last.trunkLeanDegrees)}°`]);
  if (category === "COPA" && last.deadBranchesPercent != null) extra.push(["Percentual de galhos secos", `${fmtNum(last.deadBranchesPercent)}%`]);
  if (category === "FITOSSANIDADE") {
    extra.push(["Severidade", labelOf(LEVEL3, last.phytoSeverity)], ["Diagnóstico provável", last.probableDiagnosis], ["Diagnóstico confirmado", last.confirmedDiagnosis]);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card
        title={`${cat.label} — última inspeção (${fmtDate(last.inspectedAt)})`}
        className="lg:col-span-2"
        actions={<ConditionBadge value={last[CONDITION_FIELD[category]]} />}
      >
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {cat.options.map((o) => {
            const f = present.get(o.value);
            return (
              <li key={o.value} className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm ${f ? "bg-amber-50 font-medium text-amber-900" : "text-stone-500"}`}>
                {f ? <Check className="mt-0.5 size-4 shrink-0 text-amber-600" /> : <Minus className="mt-0.5 size-4 shrink-0 text-stone-300" />}
                <span>{o.label}{f?.notes && <span className="block text-xs font-normal">{f.notes}</span>}</span>
              </li>
            );
          })}
        </ul>
        {extra.length > 0 && <div className="mt-4"><DataList items={extra} /></div>}
        {category === "FITOSSANIDADE" && last.notes && <p className="mt-3 text-sm whitespace-pre-line text-stone-700">{last.notes}</p>}
      </Card>
      <Card title="Evolução">
        <ol className="space-y-3">
          {inspections.map((i) => {
            const fs = i.findings.filter((f) => f.category === category);
            return (
              <li key={i.id} className="border-l-2 border-stone-200 pl-3">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/inspecoes/${i.id}`} className="text-sm font-medium hover:underline">{fmtDate(i.inspectedAt)}</Link>
                  <ConditionBadge value={i[CONDITION_FIELD[category]]} />
                </div>
                <p className="text-xs text-stone-500">
                  {fs.length ? fs.map((f) => labelOf(cat.options, f.code)).join(", ") : "Sem achados"}
                </p>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
