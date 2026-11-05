"use client";

import { useEffect, useState } from "react";
import apiClient from "@/services/api";
import { Modal } from "@/components/ui/Modal";
import { useOrganizationLocale } from "@/lib/locale";
import styles from "./page.module.css";

type Details = {
  batch_code: string;
  entries: { id: string; category: string; description: string; date: string; amount: string | null; quantity: string | null; unit: string | null }[];
  totals: Record<string, string>;
  total: string;
  cost_per_animal: string | null;
  cost_per_kg: string | null;
  missing_cost_count: number;
  reproduction_allocation_pending?: boolean;

};
export function BatchFinancialDetails({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const { language, t } = useOrganizationLocale();
  const money = new Intl.NumberFormat(language, { style: "currency", currency: "BRL" });
  const formatMoney = (value: string | null) => value === null ? t("lotReport.notInformed") : money.format(Number(value));
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    apiClient.get<Details>(`/livestock/batches/${batchId}/financial-details/`, { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setDetails(response.data); })
      .catch(() => { if (!controller.signal.aborted) setError(t("lotReport.loadFailed")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [batchId, t]);
  const retry = async () => {
    setLoading(true); setError("");
    try { const response = await apiClient.get<Details>(`/livestock/batches/${batchId}/financial-details/`); setDetails(response.data); }
    catch { setError(t("lotReport.loadFailed")); }
    finally { setLoading(false); }
  };
  return <Modal isOpen onClose={onClose} title={`${t("lotReport.expenses")}${details ? ` — ${details.batch_code}` : ""}`} maxWidth="max-w-5xl">
    {loading ? <p role="status">{t("lotReport.loading")}</p> : error ? <div role="alert"><p>{error}</p><button type="button" className={styles.clear} onClick={retry}>{t("lotReport.retry")}</button></div> : details && <>
      <p>{t("lotReport.expensesDescription")}</p>
      <div className={styles.tableScroll}><table><thead><tr><th>{t("lotReport.category")}</th><th>{t("lotReport.registeredTotal")}</th></tr></thead><tbody>{Object.entries(details.totals).map(([category, amount]) => <tr key={category}><td>{category}</td><td>{formatMoney(amount)}</td></tr>)}<tr><th>{t("lotReport.batchTotal")}</th><td><strong>{formatMoney(details.total)}</strong></td></tr><tr><th>{t("lotReport.costPerAnimal")}</th><td>{formatMoney(details.cost_per_animal)}</td></tr><tr><th>{t("lotReport.costPerKg")}</th><td>{formatMoney(details.cost_per_kg)}</td></tr></tbody></table></div>
      {details.missing_cost_count > 0 && <p>{details.missing_cost_count} registro(s) sem custo informado. O total considera os valores disponíveis.</p>}
      {details.reproduction_allocation_pending && <p>O rateio do reprodutor está incompleto: há custos ou quantidades de transferência sem informação suficiente.</p>}
      <h3>{t("lotReport.details")}</h3><div className={styles.tableScroll}><table><thead><tr><th>{t("lotReport.date")}</th><th>{t("lotReport.category")}</th><th>{t("lotReport.description")}</th><th>{t("lotReport.quantity")}</th><th>{t("lotReport.value")}</th></tr></thead><tbody>{details.entries.length ? details.entries.map(entry => <tr key={entry.id}><td>{new Date(`${entry.date}T00:00:00`).toLocaleDateString(language)}</td><td>{entry.category}</td><td>{entry.description}</td><td>{entry.quantity !== null ? `${new Intl.NumberFormat(language).format(Number(entry.quantity))} ${entry.unit || ""}` : "—"}</td><td>{formatMoney(entry.amount)}</td></tr>) : <tr><td colSpan={5}>{t("lotReport.noExpenses")}</td></tr>}</tbody></table></div>
    </>}
  </Modal>;
}
