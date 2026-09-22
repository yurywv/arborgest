"use client";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type Datum = { label: string; value: number; color?: string; href?: string };

const BRAND = "#318a52";

function TooltipBox({ active, payload }: { active?: boolean; payload?: { payload: Datum }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium text-stone-600">{d.label}</div>
      <div className="font-bold text-stone-900 tabular-nums">{d.value}</div>
    </div>
  );
}

/** Barras horizontais (magnitude). Cor única, salvo quando o dado é um status (condição/risco). */
export function HBarChart({ data, height }: { data: Datum[]; height?: number }) {
  const h = height ?? Math.max(120, data.length * 30 + 20);
  if (!data.length) return <p className="py-8 text-center text-sm text-stone-500">Sem dados.</p>;
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }} barCategoryGap={4}>
        <CartesianGrid horizontal={false} stroke="#e7e5e4" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={118} tick={{ fontSize: 12, fill: "#44403c" }} axisLine={false} tickLine={false} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: "#f5f5f4" }} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20} label={{ position: "right", fontSize: 11, fill: "#44403c" }}>
          {data.map((d, i) => <Cell key={i} fill={d.color ?? BRAND} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
