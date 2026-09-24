/* Gera os resultados de referência calculados PELO PRÓPRIO EXCEL para os cenários de paridade.
 *
 * Requisitos: macOS + Microsoft Excel. Uso:
 *   npx tsx scripts/pricing-parity/generate-excel-fixtures.mts [/caminho/Arborent_Precificacao_final_v2.xlsx]
 *
 * Funcionamento: copia a planilha para a pasta do Excel (evita pedido de acesso a arquivo), preenche os
 * inputs de cada cenário via AppleScript, recalcula, salva uma cópia por cenário e lê os valores
 * calculados (precisão total) com exceljs. A planilha original nunca é alterada.
 * Saída: src/lib/pricing/parity/excel-results.json (versionado; usado pelos testes).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { OUTPUT_CELLS, SCENARIOS, SHEET, inputCells } from "../../src/lib/pricing/parity/scenarios";

const source = process.argv[2] ?? path.join(homedir(), "Downloads", "Arborent_Precificacao_final_v2.xlsx");
const work = path.join(homedir(), "Library/Containers/com.microsoft.Excel/Data/arborent-parity");
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const base = path.join(work, "base.xlsx");
copyFileSync(source, base);

const posix = (p: string) => `(POSIX file "${p}" as text)`;
const lines: string[] = [
  "with timeout of 900 seconds",
  'tell application "Microsoft Excel"',
  `set wb to open workbook workbook file name ${posix(base)}`,
];
for (const sc of SCENARIOS) {
  lines.push(`set ws to worksheet "${SHEET[sc.service]}" of wb`);
  for (const [cell, v] of Object.entries(inputCells(sc))) lines.push(`set value of range "${cell}" of ws to ${v}`);
  lines.push("calculate");
  lines.push(`save workbook as wb filename ${posix(path.join(work, `${sc.id}.xlsx`))} file format Excel XML file format`);
  lines.push("set wb to active workbook");
}
lines.push("close active workbook saving no", "set v to version", "end tell", "end timeout", "return v");

console.log(`→ Excel: calculando ${SCENARIOS.length} cenários…`);
const excelVersion = execFileSync("osascript", ["-e", lines.join("\n")], { encoding: "utf8" }).trim();

/** Lê o valor calculado (<v>) de uma célula direto do XML — exceljs descarta resultados iguais a 0. */
function cellValue(xml: string, cell: string): number {
  const m = xml.match(new RegExp(`<c r="${cell}"[^>]*>(?:<f[^>]*>[^<]*</f>|<f[^>]*/>)?<v>([^<]*)</v>`));
  if (!m) throw new Error(`célula ${cell} sem valor calculado`);
  return Number(m[1]);
}

const results: Record<string, Record<string, number>> = {};
for (const sc of SCENARIOS) {
  const file = path.join(work, `${sc.id}.xlsx`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(SHEET[sc.service])!;
  const xml = execFileSync("unzip", ["-p", file, `xl/worksheets/sheet${wb.worksheets.indexOf(ws) + 1}.xml`], { encoding: "utf8", maxBuffer: 64 << 20 });
  // Confere que os inputs foram de fato gravados (e que o XML corresponde à aba certa)
  for (const [cell, v] of Object.entries(inputCells(sc))) {
    if (Number(ws.getCell(cell).value) !== v || cellValue(xml, cell) !== v) throw new Error(`${sc.id}: input ${cell} esperado ${v}`);
  }
  results[sc.id] = Object.fromEntries(Object.entries(OUTPUT_CELLS[sc.service]).map(([key, cell]) => [key, cellValue(xml, cell)]));
}

const out = {
  source: path.basename(source),
  sourceSha256: createHash("sha256").update(readFileSync(source)).digest("hex"),
  excelVersion,
  generatedAt: new Date().toISOString(),
  note: "Valores calculados pelo Microsoft Excel a partir da planilha original. Não editar manualmente.",
  results,
};
const dest = path.join(import.meta.dirname, "../../src/lib/pricing/parity/excel-results.json");
writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
rmSync(work, { recursive: true, force: true });
console.log(`✓ ${SCENARIOS.length} cenários gravados em ${path.relative(process.cwd(), dest)} (Excel ${excelVersion})`);
