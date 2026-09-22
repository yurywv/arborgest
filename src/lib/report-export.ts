import "server-only";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import sharp from "sharp";
import type { Report } from "./reports";
import { getObject } from "./storage";

const clean = (v: unknown) => (v === null || v === undefined || v === "—" ? "" : v);

/** CSV com BOM UTF-8 e separador ";" (abre corretamente no Excel pt-BR). Neutraliza fórmulas (CSV injection). */
export function toCsv(r: Report) {
  const esc = (v: unknown) => {
    let s = String(clean(v));
    if (typeof v === "number") s = s.replace(".", ",");
    if (/^[=+\-@\t\r]/.test(s) && typeof v !== "number") s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [r.columns.map((c) => esc(c.label)).join(";"), ...r.rows.map((row) => r.columns.map((c) => esc(row[c.key])).join(";"))];
  return "﻿" + lines.join("\r\n");
}

export async function toXlsx(r: Report, company: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = company;
  wb.created = new Date();
  const ws = wb.addWorksheet(r.title.slice(0, 31).replace(/[\\/?*[\]:]/g, "-"), { views: [{ state: "frozen", ySplit: 4 }] });
  ws.addRow([r.title]).font = { bold: true, size: 14 };
  ws.addRow([`${company} · ${r.subtitle ?? ""} · gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`]).font = { color: { argb: "FF78716C" } };
  ws.addRow([]);
  const header = ws.addRow(r.columns.map((c) => c.label));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF226E40" } }; });
  for (const row of r.rows) ws.addRow(r.columns.map((c) => clean(row[c.key])));
  r.columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width ?? (c.numeric ? 12 : 18); });
  if (r.rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: r.columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function toPdf(r: Report, company: string) {
  const doc = new jsPDF({ orientation: r.columns.length > 7 ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const header = () => {
    doc.setFontSize(9).setTextColor(120).text(company, 12, 10);
    doc.text(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), pageW - 12, 10, { align: "right" });
  };
  header();
  doc.setFontSize(15).setTextColor(20).text(r.title, 12, 20);
  if (r.subtitle) doc.setFontSize(9).setTextColor(90).text(r.subtitle, 12, 26);

  let startY = 31;
  if (r.photos?.length) {
    // Relatório fotográfico: grade 2 × 3 por página com legenda.
    const cols = 2, cellW = (pageW - 24 - 6) / cols, imgH = cellW * 0.72;
    let x = 12, y = startY, col = 0;
    for (const p of r.photos) {
      const buf = await getObject(p.storageKey);
      if (!buf) continue;
      const img = await sharp(buf).rotate().resize(900, 650, { fit: "inside" }).jpeg({ quality: 70 }).toBuffer({ resolveWithObject: true });
      if (y + imgH + 12 > doc.internal.pageSize.getHeight() - 10) {
        doc.addPage(); header(); y = 16; x = 12; col = 0;
      }
      const ratio = img.info.width / img.info.height;
      const w = Math.min(cellW, imgH * ratio), h = w / ratio;
      doc.addImage(img.data.toString("base64"), "JPEG", x + (cellW - w) / 2, y, w, h);
      doc.setFontSize(7.5).setTextColor(60).text(doc.splitTextToSize(p.caption, cellW), x, y + imgH + 4);
      col++;
      if (col === cols) { col = 0; x = 12; y += imgH + 14; } else x += cellW + 6;
    }
    doc.addPage(); header(); startY = 16;
  }

  if (r.columns.length) {
    autoTable(doc, {
      startY,
      head: [r.columns.map((c) => c.label)],
      body: r.rows.map((row) => r.columns.map((c) => {
        const v = clean(row[c.key]);
        return typeof v === "number" ? v.toLocaleString("pt-BR") : String(v);
      })),
      styles: { fontSize: r.columns.length > 12 ? 6 : 7.5, cellPadding: 1.2, overflow: "linebreak" },
      headStyles: { fillColor: [34, 110, 64], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 245, 244] },
      margin: { left: 8, right: 8, top: 14 },
      didDrawPage: () => {
        header();
        const pages = doc.getNumberOfPages();
        doc.setFontSize(8).setTextColor(140).text(`Página ${pages}`, pageW - 12, doc.internal.pageSize.getHeight() - 6, { align: "right" });
      },
    });
  }
  return Buffer.from(doc.output("arraybuffer"));
}
