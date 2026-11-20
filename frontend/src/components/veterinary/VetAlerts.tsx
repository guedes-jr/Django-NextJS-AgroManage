"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Bell, CalendarDays, CalendarRange, FileText, Image as ImageIcon, Printer, Share2 } from "lucide-react";
import type { VetStatus } from "@/services/veterinaryService";
import styles from "./veterinary.module.css";
import { StatusPill, VetKpis, type VetContext } from "./VeterinaryArea";
import { exportPdf, exportPng, printPdf, sharePdf, type ExportDocument } from "./vetExport";
import { CATEGORIES, STATUSES, addDays, animalDetails, categoryLabel, diffDays, lastLabel, naturalCompare, nextKey, nextLabel, norm, statusLabel } from "./vetText";

type Deadline = "" | "late" | "today" | "7" | "15" | "30" | "none";
type Group = "fz" | "pr" | "st" | "";
const PRESETS: Array<[string, string]> = [["", "vet.all"], ["late", "vet.late"], ["today", "vet.today"], ["7", "vet.alerts.next7"], ["s:protocol", "vet.status.protocol"], ["s:inseminated", "vet.alerts.inseminated"], ["s:pregnant", "vet.alerts.pregnant"], ["s:open", "vet.alerts.open"]];

export function VetAlerts({ ctx }: { ctx: VetContext }) {
  const { t, fmt, animals, clients, today, language } = ctx;
  const [farm, setFarm] = useState("");
  const [status, setStatus] = useState<VetStatus | "">("");
  const [procedure, setProcedure] = useState("");
  const [deadline, setDeadline] = useState<Deadline>("");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<Group>("fz");
  const [order, setOrder] = useState<"dt" | "br">("dt");
  const [busy, setBusy] = useState(false);

  const procedures = useMemo(() => {
    const seen = new Map<string, string>();
    animals.filter(a => !farm || a.client === farm).forEach(a => seen.set(nextKey(a.next), nextLabel(t, a.next)));
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], language));
  }, [animals, farm, t, language]);

  // One row per animal with its next procedure (prototype vAlRows).
  const rows = useMemo(() => {
    const q = norm(query);
    return animals.filter(a => {
      if (farm && a.client !== farm) return false;
      if (status && a.status !== status) return false;
      if (procedure && nextKey(a.next) !== procedure) return false;
      if (category && a.category !== category) return false;
      const d = a.next.date;
      if (deadline === "late" && a.deadline !== "late") return false;
      if (deadline === "today" && a.deadline !== "today") return false;
      if ((deadline === "7" || deadline === "15" || deadline === "30") && !(d && d <= addDays(today, Number(deadline)))) return false;
      if (deadline === "none" && d) return false;
      if (q && !norm(`${a.identifier} ${a.name} ${a.client_name}`).includes(q)) return false;
      return true;
    }).sort((x, y) => {
      if (order === "br") return naturalCompare(x.identifier, y.identifier, language);
      const dx = x.next.date || "9999", dy = y.next.date || "9999";
      return dx < dy ? -1 : dx > dy ? 1 : naturalCompare(x.identifier, y.identifier, language);
    });
  }, [animals, farm, status, procedure, category, deadline, query, order, today, language]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof rows>();
    rows.forEach(r => {
      const key = group === "fz" ? r.client_name : group === "pr" ? nextLabel(t, r.next) : group === "st" ? statusLabel(t, r.status) : "";
      map.set(key, [...(map.get(key) || []), r]);
    });
    const list = [...map.entries()].map(([title, items]) => ({ title, items }));
    if (group) list.sort((a, b) => a.title.localeCompare(b.title, language));
    return list;
  }, [rows, group, t, language]);

  const late = rows.filter(r => r.deadline === "late").length;
  const due = rows.filter(r => r.deadline === "today").length;
  const allLate = animals.filter(a => a.deadline === "late").length;
  const allToday = animals.filter(a => a.deadline === "today").length;
  const allWeek = animals.filter(a => a.deadline === "week").length;

  const dateCell = (day: string | null) => {
    if (!day) return "—";
    const n = diffDays(day, today);
    return `${fmt.fd5(day)}${n < 0 ? t("vet.alerts.lateDays", { days: -n }) : n === 0 ? t("vet.alerts.todayMark") : ""}`;
  };
  const filterText = () => {
    const parts: string[] = [];
    const client = clients.find(c => c.id === farm);
    if (client) parts.push(`${t("vet.report.farm")}: ${client.name}`);
    if (status) parts.push(`${t("vet.alerts.situation")}: ${statusLabel(t, status)}`);
    if (procedure) parts.push(`${t("vet.report.procedure")}: ${procedures.find(p => p[0] === procedure)?.[1] || ""}`);
    if (category) parts.push(`${t("vet.report.category")}: ${categoryLabel(t, category as never)}`);
    if (deadline) parts.push(`${t("vet.alerts.deadline")}: ${t(({ late: "vet.late", today: "vet.today", "7": "vet.alerts.upTo7", "15": "vet.alerts.upTo15", "30": "vet.alerts.upTo30", none: "vet.alerts.noDate" } as const)[deadline]).toLowerCase()}`);
    if (query) parts.push(`${t("vet.report.filterBusca")}: ${query}`);
    return parts.length ? parts.join(" · ") : t("vet.alerts.noFilters");
  };
  const preset = (key: string) => {
    setDeadline(""); setStatus(""); setProcedure(""); setCategory(""); setQuery("");
    if (key.startsWith("s:")) setStatus(key.slice(2) as VetStatus);
    else setDeadline(key as Deadline);
  };
  const presetOn = (key: string) => key === "" ? !deadline && !status && !procedure && !category && !query : key.startsWith("s:") ? status === key.slice(2) && !deadline : deadline === key && !status;

  const columns = [t("vet.animals.identifier"), t("vet.report.category"), t("vet.alerts.situation"), t("vet.launch.lastProcedure"), t("vet.launch.nextProcedure"), t("vet.alerts.colDate"), t("vet.alerts.colDetails")];
  const buildDocument = (): ExportDocument => ({
    title: t("vet.alerts.pdfTitle"),
    subtitle: [`${fmt.fd(today)} · ${t("vet.alerts.summary", { count: rows.length })}${late ? ` · ${t("vet.alerts.summaryLate", { count: late })}` : ""}${due ? ` · ${t("vet.alerts.summaryToday", { count: due })}` : ""}`, filterText()],
    columns,
    groups: groups.map(g => ({ title: g.title, rows: g.items.map(r => [`${r.identifier}${group === "fz" ? "" : ` · ${r.client_name}`}`, categoryLabel(t, r.category), statusLabel(t, r.status), lastLabel(t, fmt, r.last), nextLabel(t, r.next), dateCell(r.next.date), animalDetails(t, fmt, r, today)]) })),
    fileName: "lista_de_curral",
  });
  const run = async (action: (doc: ExportDocument) => Promise<unknown>) => {
    setBusy(true);
    try {
      if ((await action(buildDocument())) === false) ctx.notify(t("vet.export.shareFallback"));
    } finally {
      setBusy(false);
    }
  };

  if (!animals.length) return <div className={styles.panel}><p className={styles.muted}>{t("vet.alerts.empty")}</p></div>;

  const select = (label: string, value: string, onChange: (v: string) => void, options: Array<[string, string]>) => (
    <label className={styles.field}>
      <span>{label}</span>
      <select className="form-select" value={value} onChange={e => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    </label>
  );

  return (
    <>
      <p className={styles.muted} style={{ margin: "0 0 12px" }}>{t("vet.alerts.subtitle")}</p>
      <VetKpis items={[
        { label: t("vet.late"), value: allLate, icon: AlertTriangle, tone: "danger" },
        { label: t("vet.today"), value: allToday, icon: CalendarDays, tone: "warning" },
        { label: t("vet.week"), value: allWeek, icon: CalendarRange, tone: "info" },
      ]} />
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2><Bell size={18} className={styles.ok} aria-hidden="true" /> {t("vet.alerts.heading")}</h2>
          <span className={styles.muted}>
            <b>{t("vet.alerts.summary", { count: rows.length })}</b>
            {late > 0 && <span className={styles.danger}> · <b>{t("vet.alerts.summaryLate", { count: late })}</b></span>}
            {due > 0 && <span className={styles.warn}> · <b>{t("vet.alerts.summaryToday", { count: due })}</b></span>}
          </span>
        </div>
        <div className={styles.chips} style={{ marginBottom: 10 }}>
          {PRESETS.map(([key, label]) => <button key={key || "all"} type="button" className={`${styles.chip} ${presetOn(key) ? styles.chipOn : ""}`} onClick={() => preset(key)}>{t(label as never)}</button>)}
        </div>
        <input type="search" className="form-control mb-2" placeholder={t("vet.report.search")} value={query} onChange={e => setQuery(e.target.value)} />
        <div className={styles.filters}>
          {select(t("vet.report.farm"), farm, v => { setFarm(v); setProcedure(""); }, [["", t("vet.allFarms")], ...clients.map(c => [c.id, c.name] as [string, string])])}
          {select(t("vet.alerts.situation"), status, v => setStatus(v as VetStatus | ""), [["", t("vet.allFem")], ...STATUSES.map(s => [s, statusLabel(t, s)] as [string, string])])}
          {select(t("vet.alerts.nextProcedure"), procedure, setProcedure, [["", t("vet.all")], ...procedures])}
          {select(t("vet.alerts.deadline"), deadline, v => setDeadline(v as Deadline), [["", t("vet.alerts.any")], ["late", t("vet.late")], ["today", t("vet.today")], ["7", t("vet.alerts.upTo7")], ["15", t("vet.alerts.upTo15")], ["30", t("vet.alerts.upTo30")], ["none", t("vet.alerts.noDate")]])}
          {select(t("vet.report.category"), category, setCategory, [["", t("vet.allFem")], ...CATEGORIES.map(c => [c, categoryLabel(t, c)] as [string, string])])}
          {select(t("vet.alerts.groupBy"), group, v => setGroup(v as Group), [["fz", t("vet.alerts.byFarm")], ["pr", t("vet.alerts.byProcedure")], ["st", t("vet.alerts.bySituation")], ["", t("vet.alerts.noGroup")]])}
          {select(t("vet.alerts.orderBy"), order, v => setOrder(v as "dt" | "br"), [["dt", t("vet.alerts.byDate")], ["br", t("vet.alerts.byIdentifier")]])}
        </div>
        <p className={styles.muted} style={{ marginTop: 8 }}>{filterText()}</p>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>{t("vet.alerts.list")}</h2>
          <div className={`${styles.actions} flex-wrap`}>
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy || !rows.length} onClick={() => void run(printPdf)}><Printer size={14} aria-hidden="true" /> {t("vet.alerts.print")}</button>
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy || !rows.length} onClick={() => void run(exportPdf)}><FileText size={14} aria-hidden="true" /> {t("vet.alerts.pdf")}</button>
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy || !rows.length} onClick={() => void run(exportPng)}><ImageIcon size={14} aria-hidden="true" /> {t("vet.alerts.image")}</button>
            <button type="button" className="btn btn-sm btn-agro" disabled={busy || !rows.length} onClick={() => void run(sharePdf)}><Share2 size={14} aria-hidden="true" /> {t("vet.alerts.share")}</button>
          </div>
        </div>
        {!rows.length ? <p className={styles.muted}>{t("vet.alerts.none")}</p> : groups.map(g => (
          <div key={g.title || "all"}>
            {g.title && <div className={styles.groupTitle}>{g.title} <span className={styles.muted}>({g.items.length})</span></div>}
            <div className={styles.tableWrap}>
              <table className={styles.table} style={{ minWidth: 720 }}>
                <thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {g.items.map(r => (
                    <tr key={r.id}>
                      <td><b>{r.identifier}</b>{r.name && <div className={styles.muted}>{r.name}</div>}{group !== "fz" && <div className={styles.muted}>{r.client_name}</div>}</td>
                      <td>{categoryLabel(t, r.category)}</td>
                      <td><StatusPill tone={r.status_tone}>{statusLabel(t, r.status)}</StatusPill></td>
                      <td>{lastLabel(t, fmt, r.last)}</td>
                      <td>{nextLabel(t, r.next)}</td>
                      <td style={{ whiteSpace: "nowrap", fontWeight: r.deadline === "late" || r.deadline === "today" ? 600 : undefined }} className={r.deadline === "late" ? styles.danger : r.deadline === "today" ? styles.warn : undefined}>{dateCell(r.next.date)}</td>
                      <td className={styles.muted}>{animalDetails(t, fmt, r, today)}</td>
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
