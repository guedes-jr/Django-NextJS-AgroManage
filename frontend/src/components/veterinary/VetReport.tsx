"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, FileText, Image as ImageIcon, Printer, Share2 } from "lucide-react";
import { veterinaryService, vetError, type VetReport as Report, type VetReportFilters, type VetReportResult } from "@/services/veterinaryService";
import styles from "./veterinary.module.css";
import type { VetContext } from "./VeterinaryArea";
import { exportPdf, exportPng, exportXlsx, printPdf, sharePdf, type ExportDocument } from "./vetExport";
import {
  CATEGORIES, categoryLabel, conductLabel, deadlineMark, nextLabel, reportConduct, reportDetails, reportKindLabel, resultLabel,
} from "./vetText";

const PROCEDURES = ["insemination", "insemination_not_done", "diagnosis", "iatf_protocol", "observe_heat", "induction", "discard"];
const RESULTS: VetReportResult[] = ["pregnant", "open", "awaiting"];
const GROUP_ORDER: VetReportResult[] = ["pregnant", "open", "awaiting", ""];
const RESULT_COLOR: Record<string, string> = { pregnant: "#15803d", open: "#b91c1c", awaiting: "#b45309" };

export function VetReport({ ctx }: { ctx: VetContext }) {
  const { t, fmt, clients, today } = ctx;
  const [filters, setFilters] = useState<VetReportFilters>({ mode: "event" });
  const [query, setQuery] = useState("");
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<VetReportFilters>) => setFilters(f => ({ ...f, ...patch }));

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      veterinaryService.report({ ...filters, q: query }, controller.signal)
        .then(result => { setData(result); setError(""); })
        .catch(err => { if (!controller.signal.aborted) setError(vetError(err, t("vet.error"))); });
    }, query ? 300 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [filters, query, t]);

  const groupTitle = (result: VetReportResult) => result ? t(result === "pregnant" ? "vet.report.pregnant" : result === "open" ? "vet.report.open" : "vet.result.awaiting") : t("vet.report.groupNone");

  // Columns and rows shared by the screen and every export (prototype vRxCfg).
  const table = useMemo(() => {
    if (!data) return null;
    const event = filters.mode !== "animal";
    const singleFarm = new Set(data.rows.map(r => r.client)).size < 2;
    const columns = event
      ? [t("vet.report.colDate"), t("vet.report.colFarm"), t("vet.report.colAnimal"), t("vet.report.category"), t("vet.report.procedure"), t("vet.report.result"), t("vet.report.colConduct"), t("vet.report.bull"), t("vet.report.colDetails"), t("vet.report.colNext"), t("vet.report.colNextDate"), t("vet.report.responsible"), t("vet.report.colNotes")]
      : [t("vet.report.colAnimal"), t("vet.report.colFarm"), t("vet.report.category"), t("vet.report.procedures"), t("vet.report.inseminations"), t("vet.report.bull"), t("vet.report.result"), t("vet.report.colCalving"), t("vet.report.colLast"), t("vet.report.colNext"), t("vet.report.colNextDate")];
    const drop = new Set<number>([...(singleFarm ? [1] : []), ...(event ? [] : [3])]);
    const groups = new Map<VetReportResult, Array<{ cells: string[]; result: VetReportResult }>>();
    const push = (result: VetReportResult, cells: string[]) => {
      const list = groups.get(result) || [];
      list.push({ cells: cells.filter((_, i) => !drop.has(i)), result });
      groups.set(result, list);
    };
    if (event) {
      data.rows.forEach(r => push(r.report_result, [
        fmt.fd(r.date), r.client_name, `${r.identifier}${r.animal_name ? ` (${r.animal_name})` : ""}`, categoryLabel(t, r.category), reportKindLabel(t, r.report_kind),
        resultLabel(t, r.report_result), reportConduct(t, r.origin), r.report_bull, reportDetails(t, fmt, r),
        r.next ? nextLabel(t, r.next) : "—", r.next ? deadlineMark(t, fmt, r.next.date, today).replace(t("vet.noDate"), "—") : "—", r.responsible, r.notes,
      ]));
    } else {
      data.animals.forEach(a => push(a.result, [
        `${a.identifier}${a.animal_name ? ` (${a.animal_name})` : ""}`, a.client_name, categoryLabel(t, a.category), String(a.count),
        a.inseminations.map(d => fmt.fd5(d)).join("; ") || "—", a.bulls.join(", ") || "—", resultLabel(t, a.result) || "—",
        a.calving_date ? fmt.fd(a.calving_date) : "—", a.last ? `${reportKindLabel(t, a.last.report_kind)} · ${fmt.fd5(a.last.date)}` : "—",
        a.next ? nextLabel(t, a.next) : "—", a.next ? deadlineMark(t, fmt, a.next.date, today).replace(t("vet.noDate"), "—") : "—",
      ]));
    }
    const ordered = GROUP_ORDER.filter(g => groups.has(g)).map(g => ({ key: g, title: groupTitle(g), rows: groups.get(g)! }));
    const resultIndex = columns.filter((_, i) => !drop.has(i)).indexOf(t("vet.report.result"));
    return { columns: columns.filter((_, i) => !drop.has(i)), groups: ordered, singleFarm, resultIndex, event };
  }, [data, filters.mode, fmt, t, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const filterText = () => {
    const parts: string[] = [];
    const client = clients.find(c => c.id === filters.client);
    if (client) parts.push(`${t("vet.report.farm")}: ${client.name}`);
    else if (table?.singleFarm && data?.rows[0]) parts.push(`${t("vet.report.farm")}: ${data.rows[0].client_name}${data.rows[0].farm_name ? ` · ${data.rows[0].farm_name}` : ""}`);
    if (filters.date) parts.push(`${t("vet.report.manageDate")}: ${fmt.fd(filters.date)}`);
    else parts.push(t("vet.report.periodAll"));
    if (filters.procedure) parts.push(`${t("vet.report.procedure")}: ${procedureLabel(filters.procedure)}`);
    if (filters.result) parts.push(`${t("vet.report.result")}: ${resultLabel(t, filters.result as VetReportResult)}`);
    if (filters.bull) parts.push(`${t("vet.report.bull")}: ${filters.bull}`);
    if (filters.category) parts.push(`${t("vet.report.category")}: ${categoryLabel(t, filters.category as never)}`);
    if (filters.responsible) parts.push(`${t("vet.report.responsible")}: ${filters.responsible}`);
    if (query) parts.push(`${t("vet.report.filterBusca")}: ${query}`);
    return parts.join(" · ");
  };
  const procedureLabel = (key: string) => (["observe_heat", "induction", "discard"].includes(key) ? conductLabel(t, key) : reportKindLabel(t, key as never));

  const stats = data?.stats;
  const buildDocument = (): ExportDocument => ({
    title: t(table?.event ? "vet.report.pdfTitle" : "vet.report.pdfTitleAnimal"),
    subtitle: [
      t("vet.report.pdfSummary", { date: fmt.fd(today), procedures: stats?.procedures ?? 0, animals: stats?.animals ?? 0, inseminations: stats?.inseminations ?? 0, pregnant: stats?.pregnant ?? 0, open: stats?.open ?? 0 })
        + (stats?.rate != null ? t("vet.report.pdfRate", { rate: Math.round(stats.rate) }) : ""),
      filterText(),
    ],
    columns: table?.columns || [],
    groups: (table?.groups || []).map(g => ({ title: g.title, rows: g.rows.map(r => r.cells) })),
    fileName: "relatorio_veterinario",
  });
  const run = async (action: (doc: ExportDocument) => Promise<unknown>) => {
    setBusy(true);
    try {
      const shared = await action(buildDocument());
      if (shared === false) ctx.notify(t("vet.export.shareFallback"));
    } finally {
      setBusy(false);
    }
  };

  const select = (label: string, value: string | undefined, onChange: (v: string) => void, options: Array<[string, string]>, first: string) => (
    <label className={styles.field}>
      <span>{label}</span>
      <select className="form-select" value={value || ""} onChange={e => onChange(e.target.value)}>
        <option value="">{first}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );

  return (
    <>
      <p className={styles.muted} style={{ margin: "0 0 12px" }}>{t("vet.report.subtitle")}</p>
      <section className={styles.panel}>
        <div className={styles.panelHead}><h2><FileText size={18} className={styles.ok} aria-hidden="true" /> {t("vet.report.heading")}</h2></div>
        <input type="search" className="form-control mb-2" placeholder={t("vet.report.search")} value={query} onChange={e => setQuery(e.target.value)} />
        <div className={styles.filters}>
          {select(t("vet.report.farm"), filters.client, v => set({ client: v, date: "" }), clients.map(c => [c.id, c.name]), t("vet.allFarms"))}
          <div className={styles.field} style={{ flex: "1 1 100%" }}>
            <span>{t("vet.report.manageDate")}</span>
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <input type="date" className="form-control" style={{ maxWidth: 170 }} max={today} value={filters.date || ""} onChange={e => set({ date: e.target.value })} />
              <div className={styles.chips}>
                <button type="button" className={`${styles.chip} ${!filters.date ? styles.chipOn : ""}`} onClick={() => set({ date: "" })}>{t("vet.report.allDates")}</button>
                {(data?.recent_dates || []).map(d => <button key={d.date} type="button" className={`${styles.chip} ${filters.date === d.date ? styles.chipOn : ""}`} onClick={() => set({ date: d.date })}>{fmt.fd5(d.date)} ({d.count})</button>)}
              </div>
            </div>
          </div>
          {select(t("vet.report.procedure"), filters.procedure, v => set({ procedure: v }), PROCEDURES.map(p => [p, procedureLabel(p)]), t("vet.all"))}
          {select(t("vet.report.result"), filters.result, v => set({ result: v }), RESULTS.map(r => [r, resultLabel(t, r)]), t("vet.all"))}
          {select(t("vet.report.bull"), filters.bull, v => set({ bull: v }), (data?.bulls || []).map(b => [b.name, `${b.name} (${b.count})`]), t("vet.all"))}
          {select(t("vet.report.category"), filters.category, v => set({ category: v }), CATEGORIES.map(c => [c, categoryLabel(t, c)]), t("vet.allFem"))}
          {select(t("vet.report.responsible"), filters.responsible, v => set({ responsible: v }), (data?.responsibles || []).map(r => [r, r]), t("vet.all"))}
          <label className={styles.field}>
            <span>{t("vet.report.show")}</span>
            <select className="form-select" value={filters.mode} onChange={e => set({ mode: e.target.value as "event" | "animal" })}>
              <option value="event">{t("vet.report.eachProcedure")}</option>
              <option value="animal">{t("vet.report.byAnimal")}</option>
            </select>
          </label>
        </div>
        <p className={styles.muted} style={{ marginTop: 8 }}>{filterText()}</p>
      </section>

      {error && <div role="alert" className="alert alert-danger py-2">{error}</div>}
      <section className={styles.panel}>
        <div className="d-flex gap-1 text-center">
          {[
            [stats?.procedures ?? "—", t("vet.report.procedures")], [stats?.animals ?? "—", t("vet.report.animals")], [stats?.inseminations ?? "—", t("vet.report.inseminations")],
            [stats?.pregnant ?? "—", t("vet.report.pregnant"), "#15803d"], [stats?.open ?? "—", t("vet.report.open"), "#b91c1c"],
            [stats?.rate != null ? `${Math.round(stats.rate)}%` : "—", t("vet.report.rate") + (stats?.rate_total ? t("vet.report.rateOf", { pregnant: stats.rate_pregnant, total: stats.rate_total }) : "")],
          ].map(([value, label, color]) => (
            <div key={String(label)} style={{ flex: "1 1 0", minWidth: 0, padding: "4px 0" }}>
              <div className={styles.kpiValue} style={{ color: color as string | undefined }}>{value}</div>
              <div className={styles.kpiLabel}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>{t(table?.event === false ? "vet.report.byAnimal" : "vet.report.done")}</h2>
          <div className={`${styles.actions} flex-wrap`}>
            <button type="button" className="btn btn-sm btn-agro" disabled={busy || !table?.groups.length} onClick={() => void run(exportXlsx)}><FileSpreadsheet size={14} aria-hidden="true" /> {t("vet.report.excel")}</button>
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy || !table?.groups.length} onClick={() => void run(exportPdf)}><FileText size={14} aria-hidden="true" /> {t("vet.report.pdf")}</button>
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy || !table?.groups.length} onClick={() => void run(exportPng)}><ImageIcon size={14} aria-hidden="true" /> {t("vet.report.image")}</button>
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy || !table?.groups.length} onClick={() => void run(sharePdf)}><Share2 size={14} aria-hidden="true" /> {t("vet.report.share")}</button>
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy || !table?.groups.length} onClick={() => void run(printPdf)}><Printer size={14} aria-hidden="true" /> {t("vet.report.print")}</button>
          </div>
        </div>
        {!table ? <p className={styles.muted}>{t("vet.loading")}</p> : !table.groups.length ? <p className={styles.muted}>{t("vet.report.none")}</p> : table.groups.map(group => (
          <div key={group.key || "none"}>
            <div className={styles.groupTitle}>{group.title} <span className={styles.muted}>({group.rows.length})</span></div>
            <div className={styles.tableWrap}>
              <table className={styles.table} style={{ minWidth: table.event ? 860 : 720 }}>
                <thead><tr>{table.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {group.rows.map((row, i) => (
                    <tr key={i}>
                      {row.cells.map((cell, j) => (
                        <td key={j} style={j === table.resultIndex && row.result ? { color: RESULT_COLOR[row.result], fontWeight: 600 } : j === (table.singleFarm ? 1 : 2) && table.event ? { fontWeight: 600 } : undefined}>{cell || "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
