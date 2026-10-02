"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { BadgeDollarSign, CheckCircle2, LoaderCircle, ShoppingCart, Trash2 } from "lucide-react";
import apiClient from "@/services/api";
import styles from "../operations.module.css";
import saleStyles from "./sales.module.css";

type Batch = { id: string; batch_code: string; quantity: number; status: string; species_code: string };
type Sale = { id: string; date: string; batch_code: string; quantity: number; weight_kg: string; price_per_kg: string; amount: string; buyer: string; responsible: string };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");
const initialForm = () => ({ batch: "", mode: "whole", quantity: "", weight: "", price: "", buyer: "", responsible: "", notes: "", date: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}` });

const fetchSales = () => Promise.allSettled([
  apiClient.get("/livestock/batches/", { params: { page_size: 200 } }),
  apiClient.get("/livestock/batches/sales/"),
]);

export default function SalesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [history, setHistory] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [batchError, setBatchError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState(initialForm);
  const applyData = ([a, b]: Awaited<ReturnType<typeof fetchSales>>) => {
    if (a.status === "fulfilled") {
      setBatches((a.value.data.results || a.value.data || []).filter((x: Batch) => x.species_code === "suinos" && x.status === "active" && x.quantity > 0));
      setBatchError("");
    } else {
      setBatchError("Não foi possível carregar os lotes. Tente novamente.");
    }
    if (b.status === "fulfilled") {
      setHistory(b.value.data);
      setHistoryError("");
    } else {
      setHistoryError("Não foi possível carregar o histórico de vendas. Tente novamente.");
    }
  };
  const load = () => fetchSales().then(applyData);
  useEffect(() => {
    let active = true;
    fetchSales().then(([a, b]) => {
      if (!active) return;
      if (a.status === "fulfilled") {
        setBatches((a.value.data.results || a.value.data || []).filter((x: Batch) => x.species_code === "suinos" && x.status === "active" && x.quantity > 0));
      } else {
        setBatchError("Não foi possível carregar os lotes. Tente novamente.");
      }
      if (b.status === "fulfilled") {
        setHistory(b.value.data);
      } else {
        setHistoryError("Não foi possível carregar o histórico de vendas. Tente novamente.");
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const retry = async () => {
    setLoading(true);
    try { await load(); } finally { setLoading(false); }
  };
  const chosen = batches.find(x => x.id === form.batch);
  const quantity = form.mode === "whole" ? chosen?.quantity || 0 : Number(form.quantity);
  const weight = Number(form.weight);
  const price = Number(form.price);
  const amount = Math.round(weight * price * 100) / 100;
  const valid = !!chosen && Number.isInteger(quantity) && quantity > 0 && quantity <= chosen.quantity && weight > 0 && price > 0 && Number.isFinite(amount);
  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await apiClient.post(`/livestock/batches/${chosen!.id}/register-sale/`, {
        mode: form.mode, quantity, weight_kg: form.weight, price_per_kg: form.price,
        date: form.date, buyer: form.buyer, responsible: form.responsible, notes: form.notes,
      });
      setMessage("Venda registrada e receita lançada no financeiro."); setForm(initialForm());
      try { await load(); } catch { setError("Venda registrada. Não foi possível atualizar a lista; recarregue a página."); }
    } catch { setError("Não foi possível registrar a venda. Confira os dados e a quantidade disponível no lote."); }
    finally { setSaving(false); }
  };
  return <div className={`${styles.page} ${styles.sale}`}>
    <header className={styles.header}><div><span className={styles.headerIcon}><BadgeDollarSign size={27} /></span><div><h1>Nova Venda de Animais</h1><p>Registre a venda de animais do lote selecionado.</p></div></div><Link className={styles.back} href="/home/rebanho/suinos/reproducao?tab=engorda">← Voltar para Engorda</Link></header>
    <div className={saleStyles.layout}>
      <form className={styles.card} onSubmit={submit}>
        {message && <div role="status" className={styles.success}><CheckCircle2 size={17} />{message}</div>}
        {error && <div role="alert" className={styles.error}>{error}</div>}
        {batchError && <div role="alert" className={styles.error}>{batchError}<button type="button" onClick={retry} disabled={loading || saving}>Tentar novamente</button></div>}
        <fieldset disabled={saving || loading} className={saleStyles.fields}>
          <div className={styles.grid}>
            <div className={`${styles.field} ${styles.wide}`}><label htmlFor="batch">Lote</label><select id="batch" required value={form.batch} onChange={e => setForm({ ...form, batch: e.target.value, quantity: "", weight: "", price: "" })}><option value="">{loading ? "Carregando lotes…" : "Selecione um lote"}</option>{batches.map(x => <option key={x.id} value={x.id}>{x.batch_code} — {x.quantity} animais</option>)}</select>{!loading && !batchError && !batches.length && <small>Nenhum lote ativo disponível.</small>}</div>
            <fieldset className={`${saleStyles.choices} ${styles.wide}`}><legend>O que será vendido?</legend>{[["whole", "Lote inteiro"], ["partial", "Parte do lote"]].map(([value, label]) => <label key={value} className={form.mode === value ? saleStyles.selected : ""}><input type="radio" name="sale-mode" checked={form.mode === value} onChange={() => setForm({ ...form, mode: value, quantity: "" })} />{label}</label>)}</fieldset>
            <div className={styles.field}><label htmlFor="quantity">Quantidade de animais</label><input id="quantity" type="number" required min="1" max={chosen?.quantity} step="1" readOnly={form.mode === "whole"} value={form.mode === "whole" ? chosen?.quantity ?? "" : form.quantity} onChange={e => update("quantity", e.target.value)} /></div>
            <div className={styles.field}><label htmlFor="weight">Peso total (kg)</label><input id="weight" type="number" required min="0.001" step="0.001" value={form.weight} placeholder="Informe o peso total" onChange={e => update("weight", e.target.value)} /></div>
            <div className={styles.field}><label htmlFor="price">Valor por kg (R$)</label><input id="price" type="number" required min="0.01" step="0.01" value={form.price} placeholder="0,00" onChange={e => update("price", e.target.value)} /></div>
            <div className={styles.field}><label htmlFor="total">Valor total da venda (R$)</label><output id="total" className={saleStyles.total}>{money.format(Number.isFinite(amount) ? amount : 0)}</output></div>
            <div className={styles.field}><label htmlFor="buyer">Comprador</label><input id="buyer" required maxLength={200} value={form.buyer} onChange={e => update("buyer", e.target.value)} placeholder="Nome ou empresa" /></div>
            <div className={styles.field}><label htmlFor="date">Data da venda</label><input id="date" type="date" required value={form.date} onChange={e => update("date", e.target.value)} /></div>
            <div className={styles.field}><label htmlFor="responsible">Responsável pela venda</label><input id="responsible" maxLength={200} value={form.responsible} onChange={e => update("responsible", e.target.value)} placeholder="Nome do responsável" /></div>
            <div className={styles.field}><label htmlFor="notes">Observações (opcional)</label><input id="notes" value={form.notes} onChange={e => update("notes", e.target.value)} placeholder="Observações…" /></div>
            <div className={`${saleStyles.actions} ${styles.wide}`}><button type="button" className={saleStyles.clear} onClick={() => { setForm(initialForm()); setError(""); setMessage(""); }}><Trash2 size={18} />Limpar</button><button className={styles.submit} disabled={!valid || saving}>{saving ? <LoaderCircle size={18} /> : <BadgeDollarSign size={18} />}{saving ? "Registrando…" : "Registrar Venda"}</button></div>
          </div>
        </fieldset>
      </form>
      <section className={styles.card}><div className={saleStyles.historyHeader}><div><h2><ShoppingCart size={20} /> Vendas recentes</h2><p>Últimas vendas de animais registradas no sistema.</p></div><button type="button" className={saleStyles.clear} onClick={() => setShowAll(!showAll)}>{showAll ? "Ver vendas recentes" : "Ver todas as vendas"}</button></div>
        {historyError && <div role="alert" className={styles.error}>{historyError}<button type="button" onClick={retry} disabled={loading || saving}>Tentar novamente</button></div>}
        {loading ? <div className={styles.empty}>Carregando…</div> : history.length ? <div className={saleStyles.tableWrap}><table className={saleStyles.table}><thead><tr>{["Data", "Lote", "Quantidade", "Peso total (kg)", "Valor por kg (R$)", "Valor total (R$)", "Comprador", "Responsável"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{(showAll ? history : history.slice(0, 4)).map(x => <tr key={x.id}><td>{new Date(`${x.date}T00:00:00`).toLocaleDateString("pt-BR")}</td><td><strong>{x.batch_code}</strong></td><td>{x.quantity}</td><td>{x.weight_kg ? number.format(Number(x.weight_kg)) : "—"}</td><td>{x.price_per_kg ? money.format(Number(x.price_per_kg)) : "—"}</td><td>{money.format(Number(x.amount))}</td><td>{x.buyer}</td><td>{x.responsible || "—"}</td></tr>)}</tbody></table></div> : !historyError ? <div className={styles.empty}>Nenhuma venda registrada.</div> : null}
      </section>
    </div>
  </div>;
}
