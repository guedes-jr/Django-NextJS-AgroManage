"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, LoaderCircle, UsersRound } from "lucide-react";
import { calculateLaborTotal, createSwineLabor, getSwineLaborHistory, laborSectors, laborTypes, readLaborDetails, laborSaveError, LaborTransaction, LaborType } from "@/services/swineLaborService";
import { useOrganizationLocale } from "@/lib/locale";
import styles from "../operations.module.css";
import local from "./page.module.css";

const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
const initialForm = () => ({ date: today(), sector: "Geral", worker: "", activity: "", type: "daily" as LaborType, people: "1", quantity: "1", rate: "", notes: "" });
const number = (value: string) => Number(value.replace(",", "."));
export default function LaborPage() {
  const { language, t } = useOrganizationLocale();
  const money = new Intl.NumberFormat(language, { style: "currency", currency: "BRL" });
  const typeLabels: Record<LaborType, string> = { daily: t("livestock.labor.daily"), monthly: t("livestock.labor.monthly"), hourly: t("livestock.labor.hourly") };
  const sectorKeys: Record<string, Parameters<typeof t>[0]> = {
    "Geral": "livestock.labor.sector.general",
    "Maternidade": "livestock.labor.sector.maternity",
    "Creche": "livestock.labor.sector.nursery",
    "Crescimento": "livestock.labor.sector.growth",
    "Engorda": "livestock.labor.sector.finishing",
    "Fábrica de ração": "livestock.labor.sector.feedMill",
    "Limpeza / Manutenção": "livestock.labor.sector.maintenance",
    "Reprodução": "livestock.labor.sector.reproduction",
  };
  const [history, setHistory] = useState<LaborTransaction[]>([]);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const [form, setForm] = useState(initialForm);
  const [period, setPeriod] = useState({ from: `${today().slice(0, 7)}-01`, to: today() });
  const [filter, setFilter] = useState(period);
  useEffect(() => {
    getSwineLaborHistory().then(setHistory)
      .catch(() => setError(t("livestock.labor.loadFailed")))
      .finally(() => setLoading(false));
  }, []);
  const total = calculateLaborTotal(form.type, number(form.people), number(form.quantity), number(form.rate));
  const records = history.filter(item => (!filter.from || item.due_date >= filter.from) && (!filter.to || item.due_date <= filter.to));
  const field = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!total || !form.worker.trim() || !form.activity.trim()) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await createSwineLabor(form.date, { sector: form.sector, worker: form.worker.trim(), activity: form.activity.trim(), type: form.type, people: number(form.people), quantity: form.type === "monthly" ? 1 : number(form.quantity), rate: number(form.rate), observations: form.notes });
      setForm(initialForm()); setMessage(t("livestock.labor.saved"));
      try { setHistory(await getSwineLaborHistory()); } catch { setError(t("livestock.labor.refreshFailed")); }
    } catch (error) { setError(laborSaveError(error)); }
    finally { setSaving(false); }
  };
  return <div className={`${styles.page} ${local.page}`}>
    <header className={styles.header}><div><span className={styles.headerIcon}><UsersRound size={27} /></span><div><h1>{t("livestock.labor.title")}</h1><p>{t("livestock.labor.description")}</p></div></div><Link className={styles.back} href="/home/seguimento/suinos">← {t("livestock.labor.backToSwine")}</Link></header>
    {message && <div className={styles.success} role="status"><CheckCircle2 size={17} />{message}</div>}{error && <div className={styles.error} role="alert">{error}</div>}
    <div className={local.layout}><form className={styles.card} onSubmit={submit}><h2>{t("livestock.labor.newEntry")}</h2><p>{t("livestock.labor.description")}</p><fieldset className={local.formFields} disabled={saving || loading}><div className={styles.grid}>
      <div className={styles.field}><label htmlFor="date">{t("livestock.date")}</label><input id="date" required type="date" value={form.date} onChange={e => field("date", e.target.value)} /></div>
      <div className={styles.field}><label htmlFor="sector">{t("livestock.labor.sectorLabel")}</label><select id="sector" value={form.sector} onChange={e => field("sector", e.target.value)}>{laborSectors.map(sector => <option key={sector} value={sector}>{sectorKeys[sector] ? t(sectorKeys[sector]) : sector}</option>)}</select></div>

      <div className={styles.field}><label htmlFor="worker">{t("livestock.employee")}</label><input id="worker" required value={form.worker} onChange={e => field("worker", e.target.value)} placeholder={t("livestock.labor.employeePlaceholder")} /></div>
      <div className={styles.field}><label htmlFor="activity">{t("livestock.labor.activity")}</label><input id="activity" required value={form.activity} onChange={e => field("activity", e.target.value)} placeholder={t("livestock.labor.activityPlaceholder")} /></div>
      <fieldset className={local.types}><legend>{t("livestock.type")}</legend>{(Object.keys(laborTypes) as LaborType[]).map(type => <label key={type} className={form.type === type ? local.selected : ""}><input type="radio" name="type" checked={form.type === type} onChange={() => setForm(current => ({ ...current, type, quantity: "1" }))} />{typeLabels[type]}</label>)}</fieldset>
      <div className={styles.field}><label htmlFor="people">{t("livestock.labor.peopleCount")}</label><input id="people" required type="number" min="1" step="1" value={form.people} onChange={e => field("people", e.target.value)} /></div>
      {form.type !== "monthly" && <div className={styles.field}><label htmlFor="quantity">{form.type === "daily" ? t("livestock.labor.daysWorked") : t("livestock.labor.hoursPerPerson")}</label><input id="quantity" required type="number" min={form.type === "daily" ? "1" : "0.01"} step={form.type === "daily" ? "1" : "0.01"} value={form.quantity} onChange={e => field("quantity", e.target.value)} /></div>}
      <div className={styles.field}><label htmlFor="rate">{t("livestock.unitValue")} {form.type === "daily" ? t("livestock.labor.ratePerDay") : form.type === "monthly" ? t("livestock.labor.rateMonthly") : t("livestock.labor.ratePerHour")} {t("livestock.labor.perPerson")}</label><input id="rate" required inputMode="decimal" value={form.rate} onChange={e => field("rate", e.target.value)} placeholder="0.00" /></div>
      <div className={local.total}><span>{t("livestock.totalCost")} (R$)</span><strong>{money.format(total)}</strong>{form.type === "monthly" && <small>{t("livestock.labor.monthlyCalculation")}</small>}</div>
      <div className={`${styles.field} ${styles.wide}`}><label htmlFor="notes">{t("livestock.labor.notes")}</label><textarea id="notes" value={form.notes} onChange={e => field("notes", e.target.value)} placeholder={t("livestock.labor.additionalInfo")} /></div>
      <div className={local.actions}><button type="button" onClick={() => { setForm(initialForm()); setMessage(""); }}>{t("livestock.labor.clear")}</button><button className={styles.submit} disabled={!total || saving}>{saving && <LoaderCircle size={18} />}{saving ? t("livestock.labor.saving") : t("livestock.labor.register")}</button></div>
    </div></fieldset></form>
    <section className={`${styles.card} ${local.history}`}><h2>{t("livestock.labor.history")}</h2><p>{t("livestock.labor.description")}</p><form className={local.filters} onSubmit={e => { e.preventDefault(); setFilter(period); }}><div className={styles.field}><label htmlFor="from">{t("livestock.labor.startDate")}</label><input id="from" type="date" value={period.from} onChange={e => setPeriod({ ...period, from: e.target.value })} /></div><div className={styles.field}><label htmlFor="to">{t("livestock.labor.endDate")}</label><input id="to" type="date" min={period.from} value={period.to} onChange={e => setPeriod({ ...period, to: e.target.value })} /></div><button type="submit">{t("livestock.labor.filter")}</button></form>
      <div className={local.tableScroll}><table><thead><tr>{["livestock.date", "livestock.sector", "livestock.employee", "livestock.type", "livestock.people", "livestock.daysHours", "livestock.unitValue", "livestock.totalCost"].map(key => <th key={key}>{t(key as Parameters<typeof t>[0])}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={8}>{t("livestock.loading")}</td></tr> : records.length ? records.map(item => { const detail = readLaborDetails(item.notes); return <tr key={item.id}><td>{new Date(`${item.due_date}T00:00:00`).toLocaleDateString(language)}</td><td>{detail?.sector || t("livestock.notProvided")}</td><td>{detail?.worker || item.description}</td><td>{detail ? typeLabels[detail.type] : t("livestock.notProvided")}</td><td>{detail?.people ?? "—"}</td><td>{detail && detail.type !== "monthly" ? detail.quantity : "—"}</td><td>{detail ? money.format(detail.rate) : "—"}</td><td><strong>{money.format(Number(item.amount))}</strong></td></tr>; }) : <tr><td colSpan={8}>{t("livestock.noRecords")}</td></tr>}</tbody></table></div>
      <div className={local.periodTotal}><span>{t("livestock.labor.periodTotal", { currency: "R$" })}</span><strong>{money.format(records.reduce((sum, item) => sum + Number(item.amount), 0))}</strong></div>
    </section></div>
  </div>;
}
