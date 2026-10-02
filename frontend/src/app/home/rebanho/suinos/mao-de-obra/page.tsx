"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, LoaderCircle, UsersRound } from "lucide-react";
import { calculateLaborTotal, createSwineLabor, getSwineLaborHistory, laborSectors, laborTypes, readLaborDetails, laborSaveError, LaborTransaction, LaborType } from "@/services/swineLaborService";
import styles from "../operations.module.css";
import local from "./page.module.css";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
const initialForm = () => ({ date: today(), sector: "Geral", worker: "", activity: "", type: "daily" as LaborType, people: "1", quantity: "1", rate: "", notes: "" });
const number = (value: string) => Number(value.replace(",", "."));
export default function LaborPage() {
  const [history, setHistory] = useState<LaborTransaction[]>([]);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const [form, setForm] = useState(initialForm);
  const [period, setPeriod] = useState({ from: `${today().slice(0, 7)}-01`, to: today() });
  const [filter, setFilter] = useState(period);
  useEffect(() => {
    getSwineLaborHistory().then(setHistory)
      .catch(() => setError("Não foi possível carregar os lançamentos. Recarregue a página para tentar novamente."))
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
      setForm(initialForm()); setMessage("Lançamento registrado por setor e no financeiro.");
      try { setHistory(await getSwineLaborHistory()); } catch { setError("Lançamento salvo. Recarregue a página para atualizar o histórico."); }
    } catch (error) { setError(laborSaveError(error)); }
    finally { setSaving(false); }
  };
  return <div className={`${styles.page} ${local.page}`}>
    <header className={styles.header}><div><span className={styles.headerIcon}><UsersRound size={27} /></span><div><h1>Mão de Obra</h1><p>Registre os custos de mão de obra por setor da granja.</p></div></div><Link className={styles.back} href="/home/rebanho/suinos">← Voltar para Suínos</Link></header>
    {message && <div className={styles.success} role="status"><CheckCircle2 size={17} />{message}</div>}{error && <div className={styles.error} role="alert">{error}</div>}
    <div className={local.layout}><form className={styles.card} onSubmit={submit}><h2>Novo lançamento</h2><p>Informe o setor e os dados do serviço realizado.</p><fieldset className={local.formFields} disabled={saving || loading}><div className={styles.grid}>
      <div className={styles.field}><label htmlFor="date">Data</label><input id="date" required type="date" value={form.date} onChange={e => field("date", e.target.value)} /></div>
      <div className={styles.field}><label htmlFor="sector">Setor</label><select id="sector" value={form.sector} onChange={e => field("sector", e.target.value)}>{laborSectors.map(sector => <option key={sector}>{sector}</option>)}</select></div>

      <div className={styles.field}><label htmlFor="worker">Funcionário / Equipe</label><input id="worker" required value={form.worker} onChange={e => field("worker", e.target.value)} placeholder="Nome do funcionário ou equipe" /></div>
      <div className={styles.field}><label htmlFor="activity">Atividade realizada</label><input id="activity" required value={form.activity} onChange={e => field("activity", e.target.value)} placeholder="Ex.: manejo, limpeza, alimentação" /></div>
      <fieldset className={local.types}><legend>Tipo de lançamento</legend>{(Object.keys(laborTypes) as LaborType[]).map(type => <label key={type} className={form.type === type ? local.selected : ""}><input type="radio" name="type" checked={form.type === type} onChange={() => setForm(current => ({ ...current, type, quantity: "1" }))} />{laborTypes[type]}</label>)}</fieldset>
      <div className={styles.field}><label htmlFor="people">Quantidade de pessoas</label><input id="people" required type="number" min="1" step="1" value={form.people} onChange={e => field("people", e.target.value)} /></div>
      {form.type !== "monthly" && <div className={styles.field}><label htmlFor="quantity">{form.type === "daily" ? "Dias trabalhados" : "Horas por pessoa"}</label><input id="quantity" required type="number" min={form.type === "daily" ? "1" : "0.01"} step={form.type === "daily" ? "1" : "0.01"} value={form.quantity} onChange={e => field("quantity", e.target.value)} /></div>}
      <div className={styles.field}><label htmlFor="rate">Valor {form.type === "daily" ? "por dia" : form.type === "monthly" ? "mensal" : "por hora"} / pessoa (R$)</label><input id="rate" required inputMode="decimal" value={form.rate} onChange={e => field("rate", e.target.value)} placeholder="0,00" /></div>
      <div className={local.total}><span>Custo total (R$)</span><strong>{money.format(total)}</strong>{form.type === "monthly" && <small>Um mês por lançamento: pessoas × valor mensal.</small>}</div>
      <div className={`${styles.field} ${styles.wide}`}><label htmlFor="notes">Observações (opcional)</label><textarea id="notes" value={form.notes} onChange={e => field("notes", e.target.value)} placeholder="Informações adicionais…" /></div>
      <div className={local.actions}><button type="button" onClick={() => { setForm(initialForm()); setMessage(""); }}>Limpar</button><button className={styles.submit} disabled={!total || saving}>{saving && <LoaderCircle size={18} />}Registrar lançamento</button></div>
    </div></fieldset></form>
    <section className={`${styles.card} ${local.history}`}><h2>Lançamentos recentes</h2><p>Custos de mão de obra registrados na granja.</p><form className={local.filters} onSubmit={e => { e.preventDefault(); setFilter(period); }}><div className={styles.field}><label htmlFor="from">De</label><input id="from" type="date" value={period.from} onChange={e => setPeriod({ ...period, from: e.target.value })} /></div><div className={styles.field}><label htmlFor="to">Até</label><input id="to" type="date" min={period.from} value={period.to} onChange={e => setPeriod({ ...period, to: e.target.value })} /></div><button type="submit">Filtrar</button></form>
      <div className={local.tableScroll}><table><thead><tr>{["Data", "Setor", "Funcionário", "Tipo", "Pessoas", "Dias/Horas", "Valor unitário", "Custo total"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={8}>Carregando…</td></tr> : records.length ? records.map(item => { const detail = readLaborDetails(item.notes); return <tr key={item.id}><td>{new Date(`${item.due_date}T00:00:00`).toLocaleDateString("pt-BR")}</td><td>{detail?.sector || "Não informado"}</td><td>{detail?.worker || item.description}</td><td>{detail ? laborTypes[detail.type] : "Não informado"}</td><td>{detail?.people ?? "—"}</td><td>{detail && detail.type !== "monthly" ? detail.quantity : "—"}</td><td>{detail ? money.format(detail.rate) : "—"}</td><td><strong>{money.format(Number(item.amount))}</strong></td></tr>; }) : <tr><td colSpan={8}>Nenhum lançamento no período.</td></tr>}</tbody></table></div>
      <div className={local.periodTotal}><span>Total no período (R$)</span><strong>{money.format(records.reduce((sum, item) => sum + Number(item.amount), 0))}</strong></div>
    </section></div>
  </div>;
}
