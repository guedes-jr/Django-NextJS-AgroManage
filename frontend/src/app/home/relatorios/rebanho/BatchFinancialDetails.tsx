"use client";

import { useEffect, useState } from "react";
import apiClient from "@/services/api";
import { Modal } from "@/components/ui/Modal";
import styles from "./page.module.css";

type Details = {
  batch_code: string;
  entries: { id: string; category: string; description: string; date: string; amount: string | null; quantity: string | null; unit: string | null }[];
  totals: Record<string, string>;
  total: string;
  cost_per_animal: string | null;
  cost_per_kg: string | null;
  missing_cost_count: number;
};
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatMoney = (value: string | null) => value === null ? "Não informado" : money.format(Number(value));

export function BatchFinancialDetails({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    apiClient.get<Details>(`/livestock/batches/${batchId}/financial-details/`, { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setDetails(response.data); })
      .catch(() => { if (!controller.signal.aborted) setError("Não foi possível carregar os gastos do lote."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [batchId]);
  const retry = async () => {
    setLoading(true); setError("");
    try { const response = await apiClient.get<Details>(`/livestock/batches/${batchId}/financial-details/`); setDetails(response.data); }
    catch { setError("Não foi possível carregar os gastos do lote."); }
    finally { setLoading(false); }
  };
  return <Modal isOpen onClose={onClose} title={`Gastos do lote${details ? ` — ${details.batch_code}` : ""}`} maxWidth="max-w-5xl">
    {loading ? <p role="status">Carregando gastos…</p> : error ? <div role="alert"><p>{error}</p><button type="button" className={styles.clear} onClick={retry}>Tentar novamente</button></div> : details && <>
      <p>Gastos registrados no lote e nos lotes de origem.</p>
      <div className={styles.tableScroll}><table><thead><tr><th>Categoria</th><th>Total registrado</th></tr></thead><tbody>{Object.entries(details.totals).map(([category, amount]) => <tr key={category}><td>{category}</td><td>{formatMoney(amount)}</td></tr>)}<tr><th>Total do lote</th><td><strong>{formatMoney(details.total)}</strong></td></tr><tr><th>Custo por animal</th><td>{formatMoney(details.cost_per_animal)}</td></tr><tr><th>Custo por kg de peso total</th><td>{formatMoney(details.cost_per_kg)}</td></tr></tbody></table></div>
      {details.missing_cost_count > 0 && <p>{details.missing_cost_count} registro(s) sem custo informado. O total considera os valores disponíveis.</p>}
      <h3>Lançamentos detalhados</h3><div className={styles.tableScroll}><table><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Quantidade</th><th>Valor</th></tr></thead><tbody>{details.entries.length ? details.entries.map(entry => <tr key={entry.id}><td>{new Date(`${entry.date}T00:00:00`).toLocaleDateString("pt-BR")}</td><td>{entry.category}</td><td>{entry.description}</td><td>{entry.quantity !== null ? `${Number(entry.quantity).toLocaleString("pt-BR")} ${entry.unit || ""}` : "—"}</td><td>{formatMoney(entry.amount)}</td></tr>) : <tr><td colSpan={5}>Nenhum gasto registrado para este lote.</td></tr>}</tbody></table></div>
    </>}
  </Modal>;
}
