import type { PlatformFinanceReport, PlatformOrganization, PlatformPlan } from "@/types/platform";
const currency = (value: string | number) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string | null) => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString("pt-BR") : "—";
const text = (value: unknown) => String(value ?? "");
const safeText = (value: unknown) => { const result = text(value); return /^[=+\-@\t\r]/.test(result) ? `'${result}` : result; };
const statuses: Record<string, string> = { draft: "Rascunho", open: "Em aberto", paid: "Paga", overdue: "Vencida", void: "Cancelada", uncollectible: "Incobrável" };
type Filters = Record<string, string>;
type CompoundArchive = {
    FileIndex: {
        name: string;
        content: Uint8Array;
    }[];
};
type CompoundTools = {
    read: (data: Uint8Array, options: {
        type: string;
    }) => CompoundArchive;
    write: (archive: CompoundArchive, options: {
        type: string;
        fileType: string;
    }) => ArrayBuffer;
    utils: {
        cfb_add: (archive: CompoundArchive, path: string, content: Uint8Array) => void;
    };
};
export async function exportFinanceReport(report: PlatformFinanceReport, format: "pdf" | "xlsx", filters: Filters, organizations: PlatformOrganization[], plans: PlatformPlan[]) {
    const response = await fetch("/logo_agro_leaf.png");
    if (!response.ok)
        throw new Error("Não foi possível carregar a logo do relatório.");
    const logo = new Uint8Array(await response.arrayBuffer());
    const logoUrl = URL.createObjectURL(new Blob([logo], { type: "image/png" }));
    try {
        const dimensions = await new Promise<{
            width: number;
            height: number;
        }>((resolve, reject) => { const img = new Image(); img.onload = () => resolve({ width: img.width, height: img.height }); img.onerror = reject; img.src = logoUrl; });
        const basis = { due_date: "vencimento", issued_at: "emissão", paid_at: "pagamento" }[filters.date_field] || "vencimento";
        const filterLabels = [`Período por ${basis}: ${date(filters.date_from || null)} a ${date(filters.date_to || null)}`, `Organização: ${organizations.find(o => o.id === filters.organization)?.name || "Todas"}`, `Plano: ${plans.find(p => p.id === filters.plan)?.name || "Todos"}`, `Status: ${statuses[filters.status] || "Todos"}`, `Busca: ${filters.search || "—"}`];
        const metrics: [
            [
                string,
                string | number
            ],
            ...Array<[
                string,
                string | number
            ]>
        ] = [["MRR atual", report.dashboard.mrr], ["ARR atual", report.dashboard.arr], ["Recebido no período", report.dashboard.received_period], ["Saldo a receber", report.dashboard.outstanding], ["Saldo vencido", report.dashboard.overdue_amount]];
        const stamp = `Gerado em ${new Date(report.generated_at).toLocaleString("pt-BR")} por ${report.generated_by || "Equipe da plataforma"}`;
        const headers = ["Fatura", "Organização", "Plano", "Vencimento", "Total (R$)", "Recebido (R$)", "Saldo (R$)", "Status"];
        const rows = report.invoices.map(i => [i.number, i.organization_name, i.plan_name, date(i.due_date), Number(i.total), Number(i.amount_paid), Number(i.amount_due), statuses[i.effective_status || i.status] || i.status_display]);
        const totals = report.invoices.reduce((sum, i) => ({ total: Math.round((sum.total + Number(i.total))*100)/100, paid: Math.round((sum.paid + Number(i.amount_paid))*100)/100, due: Math.round((sum.due + Number(i.amount_due))*100)/100 }), { total: 0, paid: 0, due: 0 });
        const filename = `fazenda-mais-financeiro-${new Date(report.generated_at).toISOString().slice(0, 10)}`;
        if (format === "pdf") {
            const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
            const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
            const width = doc.internal.pageSize.getWidth();
            doc.addImage(logo, "PNG", 14, 9, 22, 22 * dimensions.height / dimensions.width, undefined, "FAST");
            doc.setFontSize(14); doc.setTextColor(25, 80, 59); doc.text("Fazenda Mais", 40, 22);
            doc.setFontSize(18);
            doc.setTextColor(25, 80, 59);
            doc.text("Relatório financeiro SaaS", width - 14, 19, { align: "right" });
            doc.setFontSize(8);
            doc.setTextColor(90, 105, 98);
            doc.text(stamp, width - 14, 26, { align: "right" });
            doc.setFontSize(9);
            doc.text(filterLabels, 14, 42);
            let y = 72;
            doc.setFillColor(236, 246, 240);
            doc.roundedRect(14, y, width - 28, 23, 3, 3, "F");
            metrics.forEach(([label, value], index) => { const x = 19 + index * (width - 38) / 5; doc.setFontSize(8); doc.setTextColor(82, 101, 90); doc.text(label, x, y + 7); doc.setFontSize(13); doc.setTextColor(25, 80, 59); doc.text(currency(value), x, y + 16); });
            y += 30;
            doc.setFontSize(8);
            doc.setTextColor(90, 105, 98);
            doc.text("MRR e ARR: assinaturas atuais. Demais indicadores: filtros aplicados. Totais da tabela incluem todos os status selecionados.", 14, y);
            y += 7;
            autoTable(doc, { startY: y, head: [headers], body: rows.map(row => row.map((v, index) => index >= 4 && index <= 6 ? currency(Number(v)) : text(v))), foot: [["TOTAL", `${rows.length} faturas`, "", "", currency(totals.total), currency(totals.paid), currency(totals.due), ""]], showFoot: "lastPage", theme: "striped", styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [25, 105, 77] }, footStyles: { fillColor: [236, 246, 240], textColor: [25, 80, 59] }, columnStyles: { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } }, margin: { left: 14, right: 14, bottom: 16 } });
            if (report.payments.length) {
                doc.addPage();
                doc.setFontSize(14);
                doc.text("Histórico de pagamentos das faturas filtradas", 14, 18);
                autoTable(doc, { startY: 25, head: [["Fatura", "Organização", "Data", "Forma", "Status", "Valor (R$)", "Observação"]], body: report.payments.map(p => [p.invoice_number, p.organization_name, date(p.paid_at), p.payment_method, p.status_display, currency(p.amount), p.notes]), styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [25, 105, 77] }, margin: { bottom: 16 } });
            }
            const pages = doc.getNumberOfPages();
            for (let page = 1; page <= pages; page++) {
                doc.setPage(page);
                doc.setFontSize(8);
                doc.setTextColor(110);
                doc.text("Fazenda Mais · Financeiro da plataforma", 14, doc.internal.pageSize.getHeight() - 8);
                doc.text(`Página ${page} de ${pages}`, width - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
            }
            doc.save(`${filename}.pdf`);
        }
        else {
            const XLSX = await import("xlsx");
            const workbook = XLSX.utils.book_new();
            const summaryRows: unknown[][] = [["", "Fazenda Mais"], [], [], [], [], [], ["RELATÓRIO FINANCEIRO SAAS"], [stamp], [], ...filterLabels.map(label => [safeText(label)]), [], ["Indicador", "Valor (R$)"], ...metrics.map(([label, value]) => [label, Number(value)]), ["Faturas filtradas", report.invoices.length], ["Faturas em atraso (%)", report.dashboard.overdue_rate], [], ["MRR e ARR representam as assinaturas atuais, não recebimentos."], ["Os totais das tabelas incluem todos os status selecionados."], ["Histórico de pagamentos inclui todos os pagamentos das faturas filtradas."]];
            const summary = XLSX.utils.aoa_to_sheet(summaryRows);
            summary['!cols'] = [{ wch: 65 }, { wch: 24 }];
            for (let row = 16; row <= 20; row++) {
                const cell = summary[`B${row + 1}`];
                if (cell)
                    cell.z = '"R$" #,##0.00';
            }
            XLSX.utils.book_append_sheet(workbook, summary, "Resumo");
            const invoiceSheet = XLSX.utils.aoa_to_sheet([headers, ...rows.map((row, i) => row.map((v, index) => index === 3 ? new Date(`${report.invoices[i].due_date}T12:00:00`) : typeof v === "string" ? safeText(v) : v)), ["TOTAL", `${rows.length} faturas`, "", "", totals.total, totals.paid, totals.due, ""]], { cellDates: true });
            invoiceSheet['!cols'] = [{ wch: 24 }, { wch: 35 }, { wch: 22 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
            invoiceSheet['!autofilter'] = { ref: `A1:H${rows.length + 1}` };
            for (let row = 2; row <= rows.length + 2; row++) {
                for (const col of ['E', 'F', 'G']) {
                    const cell = invoiceSheet[`${col}${row}`];
                    if (cell)
                        cell.z = '"R$" #,##0.00';
                }
                if (invoiceSheet[`D${row}`])
                    invoiceSheet[`D${row}`].z = 'dd/mm/yyyy';
            }
            XLSX.utils.book_append_sheet(workbook, invoiceSheet, "Faturas");
            const paymentSheet = XLSX.utils.aoa_to_sheet([["Fatura", "Organização", "Data", "Forma", "Status", "Valor (R$)", "Observação"], ...report.payments.map(p => [safeText(p.invoice_number), safeText(p.organization_name), p.paid_at ? new Date(p.paid_at) : "", safeText(p.payment_method), p.status_display, Number(p.amount), safeText(p.notes)])], { cellDates: true });
            paymentSheet['!cols'] = [{ wch: 24 }, { wch: 35 }, { wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 60 }];
            paymentSheet['!autofilter'] = { ref: `A1:G${report.payments.length + 1}` };
            for (let row = 2; row <= report.payments.length + 1; row++) {
                paymentSheet[`F${row}`].z = '"R$" #,##0.00';
                if (paymentSheet[`C${row}`].t === 'd')
                    paymentSheet[`C${row}`].z = 'dd/mm/yyyy hh:mm';
            }
            XLSX.utils.book_append_sheet(workbook, paymentSheet, "Pagamentos");
            // Embed the brand image into the OOXML package; SheetJS already supplies ZIP utilities.
            const cfb = (XLSX as unknown as {
                CFB: CompoundTools;
            }).CFB;
            const archive = cfb.read(new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" })), { type: "array" });
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();
            const patch = (path: string, from: string, to: string) => { const entry = archive.FileIndex.find(e => e.name === path.split('/').at(-1)); if (!entry)
                throw new Error(`Parte do relatório não encontrada: ${path}`); const updated = decoder.decode(entry.content).replace(from, to); cfb.utils.cfb_add(archive, path, encoder.encode(updated)); };
            patch('xl/worksheets/sheet1.xml', '</worksheet>', '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdLogo"/></worksheet>');
            patch('[Content_Types].xml', '</Types>', '<Default Extension="png" ContentType="image/png"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
            cfb.utils.cfb_add(archive, 'xl/worksheets/_rels/sheet1.xml.rels', encoder.encode('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>'));
            cfb.utils.cfb_add(archive, 'xl/drawings/_rels/drawing1.xml.rels', encoder.encode('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.png"/></Relationships>'));
            cfb.utils.cfb_add(archive, 'xl/drawings/drawing1.xml', encoder.encode(`<?xml version="1.0" encoding="UTF-8"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>95250</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>95250</xdr:rowOff></xdr:from><xdr:ext cx="900000" cy="${Math.round(900000 * dimensions.height / dimensions.width)}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Logo Fazenda Mais"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="900000" cy="${Math.round(900000 * dimensions.height / dimensions.width)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`));
            cfb.utils.cfb_add(archive, 'xl/media/logo.png', logo);
            const output = cfb.write(archive, { type: "array", fileType: "zip" });
            const url = URL.createObjectURL(new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `${filename}.xlsx`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    }
    finally {
        URL.revokeObjectURL(logoUrl);
    }
}
