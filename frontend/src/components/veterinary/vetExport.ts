/* Excel, PDF, image, share and print for the report and the corral list (prototype vRxOut / vAlOut). */
export interface ExportGroup { title: string; rows: string[][] }
export interface ExportDocument { title: string; subtitle: string[]; columns: string[]; groups: ExportGroup[]; fileName: string }

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function exportXlsx(doc: ExportDocument) {
  const XLSX = await import("xlsx");
  const rows: string[][] = [[doc.title], ...doc.subtitle.map(s => [s]), [], doc.columns];
  doc.groups.forEach(group => {
    if (group.title) rows.push([`${group.title} (${group.rows.length})`]);
    group.rows.forEach(row => rows.push(row));
  });
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = doc.columns.map((_, i) => ({ wch: Math.min(48, Math.max(10, ...rows.map(r => String(r[i] ?? "").length))) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Relatório".slice(0, 31));
  const data = XLSX.write(book, { bookType: "xlsx", type: "array" });
  download(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${doc.fileName}.xlsx`);
}

async function buildPdf(doc: ExportDocument) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(doc.title, 32, 36);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(80);
  let y = 52;
  doc.subtitle.forEach(line => {
    const wrapped = pdf.splitTextToSize(line, pdf.internal.pageSize.getWidth() - 64) as string[];
    pdf.text(wrapped, 32, y);
    y += wrapped.length * 11;
  });
  const body: Array<Array<string | { content: string; colSpan: number; styles: Record<string, unknown> }>> = [];
  doc.groups.forEach(group => {
    if (group.title) body.push([{ content: `${group.title} (${group.rows.length})`, colSpan: doc.columns.length, styles: { fillColor: [234, 244, 236], fontStyle: "bold", textColor: [20, 83, 45] } }]);
    group.rows.forEach(row => body.push(row));
  });
  autoTable(pdf, {
    startY: y + 4, head: [doc.columns], body, theme: "grid", margin: { left: 32, right: 32 },
    styles: { fontSize: 7.5, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [21, 128, 61], textColor: 255, fontStyle: "bold" },
  });
  return pdf;
}

export async function exportPdf(doc: ExportDocument) {
  const pdf = await buildPdf(doc);
  pdf.save(`${doc.fileName}.pdf`);
}

export async function printPdf(doc: ExportDocument) {
  const pdf = await buildPdf(doc);
  pdf.autoPrint();
  window.open(pdf.output("bloburl"), "_blank");
}

/** A readable PNG for messaging apps: title, filters and the table drawn on a canvas. */
export function renderPng(doc: ExportDocument): Promise<Blob> {
  const width = 1600, pad = 40, rowHeight = 30, headerHeight = 36;
  const lines = doc.groups.reduce((n, g) => n + g.rows.length + (g.title ? 1 : 0), 0);
  const height = pad * 2 + 46 + doc.subtitle.length * 22 + 16 + headerHeight + lines * rowHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, width, height);
  c.fillStyle = "#14532d";
  c.font = "600 26px system-ui, Arial, sans-serif";
  c.fillText(doc.title, pad, pad + 24);
  c.fillStyle = "#475569";
  c.font = "15px system-ui, Arial, sans-serif";
  let y = pad + 56;
  doc.subtitle.forEach(line => { c.fillText(line, pad, y); y += 22; });
  y += 8;
  const widths = doc.columns.map((col, i) => Math.max(col.length, ...doc.groups.flatMap(g => g.rows.map(r => String(r[i] ?? "").length)).slice(0, 200), 4));
  const total = widths.reduce((s, w) => s + Math.min(w, 40), 0);
  const columnWidth = widths.map(w => (Math.min(w, 40) / total) * (width - pad * 2));
  const clip = (text: string, max: number) => {
    let value = text;
    while (value && c.measureText(value).width > max - 10) value = value.slice(0, -1);
    return value === text ? text : `${value.slice(0, -1)}…`;
  };
  const drawRow = (cells: string[], top: number, bold = false, color = "#0f172a") => {
    let x = pad;
    c.fillStyle = color;
    c.font = `${bold ? "600 " : ""}14px system-ui, Arial, sans-serif`;
    cells.forEach((cell, i) => { c.fillText(clip(String(cell ?? ""), columnWidth[i]), x + 6, top + 20); x += columnWidth[i]; });
  };
  c.fillStyle = "#15803d";
  c.fillRect(pad, y, width - pad * 2, headerHeight);
  drawRow(doc.columns, y + 4, true, "#ffffff");
  y += headerHeight;
  doc.groups.forEach(group => {
    if (group.title) {
      c.fillStyle = "#eaf4ec";
      c.fillRect(pad, y, width - pad * 2, rowHeight);
      drawRow([`${group.title} (${group.rows.length})`], y, true, "#14532d");
      y += rowHeight;
    }
    group.rows.forEach((row, index) => {
      if (index % 2) { c.fillStyle = "#f8fafc"; c.fillRect(pad, y, width - pad * 2, rowHeight); }
      drawRow(row, y);
      y += rowHeight;
    });
  });
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob!), "image/png"));
}

export async function exportPng(doc: ExportDocument) {
  download(await renderPng(doc), `${doc.fileName}.png`);
}

/** Native share sheet with the PDF when supported; otherwise the file is downloaded. Returns false on fallback. */
export async function sharePdf(doc: ExportDocument) {
  const pdf = await buildPdf(doc);
  const blob = pdf.output("blob");
  const file = new File([blob], `${doc.fileName}.pdf`, { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: doc.title });
      return true;
    } catch {
      return true;
    }
  }
  download(blob, `${doc.fileName}.pdf`);
  return false;
}

/** Native share sheet with the PNG when supported; otherwise the image is downloaded. Returns false on fallback. */
export async function sharePng(doc: ExportDocument) {
  const blob = await renderPng(doc);
  const file = new File([blob], `${doc.fileName}.png`, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: doc.title });
    } catch {
      /* the user closed the share sheet */
    }
    return true;
  }
  download(blob, `${doc.fileName}.png`);
  return false;
}

/** wa.me link with the text; the phone is completed with the Brazilian country code when missing. */
export function whatsappLink(phone: string, text: string) {
  const digits = (phone || "").replace(/\D/g, "");
  const number = digits ? (digits.length <= 11 ? `55${digits}` : digits) : "";
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
