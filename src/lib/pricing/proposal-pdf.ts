import "server-only";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatAddress } from "@/lib/address";
import type { CommercialProposal, CommercialProposalItem } from "@prisma/client";

type Proposal = CommercialProposal & {
  items: CommercialProposalItem[];
  client: { legalName: string; tradeName: string | null; document: string | null; address: string | null; addressNumber: string | null; city: string | null; state: string | null };
  contact: { name: string; email: string | null; phone: string | null; mobile: string | null } | null;
  property: { name: string; address: string | null; number: string | null; complement: string | null; district: string | null; city: string | null; state: string | null } | null;
  estimate?: { number: string } | null;
};

type Company = { name: string; phone?: string; email?: string; document?: string; address?: string };

const BRAND: [number, number, number] = [31, 111, 67];
const brl = (v: unknown) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (d: Date | null | undefined) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const fmtDoc = (d?: string | null) => {
  const n = (d ?? "").replace(/\D/g, "");
  if (n.length === 14) return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (n.length === 11) return n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d ?? "";
};

/** Logotipo vetorial Arborent (copa + tronco + nome) — sem dependência de arquivo de imagem. */
function logo(doc: jsPDF, x: number, y: number) {
  doc.setFillColor(...BRAND);
  doc.circle(x + 6, y + 5, 5, "F");
  doc.circle(x + 2.6, y + 8, 3.4, "F");
  doc.circle(x + 9.4, y + 8, 3.4, "F");
  doc.setFillColor(107, 74, 47);
  doc.rect(x + 5.1, y + 9, 1.8, 6, "F");
  doc.setFont("helvetica", "bold").setFontSize(17).setTextColor(...BRAND).text("ARBORENT", x + 15, y + 8.5);
  doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(110).text("Gestão e manejo arbóreo", x + 15, y + 13);
}

/** PDF da proposta comercial — apenas informações destinadas ao cliente (sem custos internos, margens ou salários). */
export function proposalPdf(p: Proposal, company: Company) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  const footer = () => {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(220).line(M, H - 14, W - M, H - 14);
      doc.setFontSize(7.5).setTextColor(120);
      doc.text([company.name, company.document ? `CNPJ ${fmtDoc(company.document)}` : "", company.phone ?? "", company.email ?? ""].filter(Boolean).join("  ·  "), M, H - 9);
      doc.text(`Proposta ${p.number} · página ${i} de ${pages}`, W - M, H - 9, { align: "right" });
    }
  };

  logo(doc, M, 12);
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(40).text(`PROPOSTA COMERCIAL`, W - M, 17, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(90);
  doc.text(`Nº ${p.number}${p.version > 1 ? ` (versão ${p.version})` : ""}`, W - M, 22, { align: "right" });
  doc.text(`Data: ${dt(p.date)}  ·  Válida até: ${dt(p.validUntil)}`, W - M, 27, { align: "right" });
  doc.setDrawColor(...BRAND).setLineWidth(0.6).line(M, 33, W - M, 33).setLineWidth(0.2);

  // Título
  let y = 42;
  doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(20);
  const title = doc.splitTextToSize(p.title, W - 2 * M);
  doc.text(title, M, y);
  y += title.length * 6 + 2;

  // Dados do cliente
  const cli = p.client;
  const rows: [string, string][] = [
    ["Cliente", `${cli.tradeName ?? cli.legalName}${cli.tradeName ? ` — ${cli.legalName}` : ""}`],
    ...(cli.document ? [["CPF/CNPJ", fmtDoc(cli.document)] as [string, string]] : []),
    ...(p.contact ? [["A/C", [p.contact.name, p.contact.email, p.contact.mobile ?? p.contact.phone].filter(Boolean).join(" · ")] as [string, string]] : []),
    ...(p.property ? [["Local", [p.property.name, formatAddress(p.property).replace(/ · /g, ", ")].filter(Boolean).join(" — ")] as [string, string]] : []),
  ];
  autoTable(doc, {
    startY: y, theme: "plain", margin: { left: M, right: M },
    styles: { fontSize: 9, cellPadding: { top: 1, bottom: 1, left: 0, right: 2 }, textColor: 40 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 24, textColor: 90 } },
    body: rows,
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  const section = (label: string, text?: string | null) => {
    if (!text?.trim()) return;
    const lines = doc.splitTextToSize(text.trim(), W - 2 * M);
    if (y + 10 + lines.length * 4.4 > H - 22) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(...BRAND).text(label.toUpperCase(), M, y);
    y += 5;
    doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(40).text(lines, M, y);
    y += lines.length * 4.4 + 5;
  };

  section("Objeto", p.object);
  section("Escopo", p.scope);

  // Tabela de serviços e valores
  if (y > H - 70) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(...BRAND).text("SERVIÇOS E VALORES", M, y);
  autoTable(doc, {
    startY: y + 3, margin: { left: M, right: M },
    head: [["Serviço", "Quantidade", "Valor unitário", "Valor total"]],
    body: p.items.map((i) => [
      i.description ? `${i.title}\n${i.description}` : i.title,
      `${Number(i.quantity).toLocaleString("pt-BR")} ${i.unit}${Number(i.quantity) === 1 ? "" : "s"}`,
      brl(i.unitPrice),
      brl(i.total),
    ]),
    styles: { fontSize: 9, cellPadding: 2.2, textColor: 30 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 28 }, 2: { halign: "right", cellWidth: 30 }, 3: { halign: "right", cellWidth: 32 } },
    alternateRowStyles: { fillColor: [246, 248, 246] },
    foot: [
      ...(Number(p.discountAmount) > 0
        ? [["Subtotal", "", "", brl(p.subtotal)], ["Desconto", "", "", `- ${brl(p.discountAmount)}`]]
        : []),
      ["TOTAL DA PROPOSTA", "", "", brl(p.total)],
    ],
    footStyles: { fillColor: [236, 243, 238], textColor: 20, fontStyle: "bold", halign: "right" },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  section("Prazo de execução", p.deadline);
  section("Condições comerciais e forma de pagamento", [p.paymentTerms, p.conditions].filter(Boolean).join("\n\n"));
  section("Validade da proposta", p.validUntil ? `Esta proposta é válida até ${dt(p.validUntil)}.` : null);
  section("Premissas", p.assumptions);
  section("Exclusões", p.exclusions);
  section("Responsabilidades", p.responsibilities);
  section("Observações", p.notes);

  // Aceite
  if (y > H - 62) { doc.addPage(); y = 24; }
  doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(...BRAND).text("ACEITE", M, y);
  y += 5;
  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(40)
    .text(doc.splitTextToSize(`Declaro estar de acordo com os termos desta proposta nº ${p.number}, no valor total de ${brl(p.total)}.`, W - 2 * M), M, y);
  y += 18;
  const colW = (W - 2 * M - 12) / 2;
  doc.setDrawColor(120).line(M, y, M + colW, y).line(M + colW + 12, y, W - M, y);
  doc.setFontSize(8.5).setTextColor(90);
  doc.text("Contratante — nome, cargo e assinatura", M, y + 4.5);
  doc.text("Local e data", M + colW + 12, y + 4.5);
  y += 16;
  doc.line(M, y, M + colW, y);
  doc.text(`${company.name}`, M, y + 4.5);

  footer();
  return Buffer.from(doc.output("arraybuffer"));
}
