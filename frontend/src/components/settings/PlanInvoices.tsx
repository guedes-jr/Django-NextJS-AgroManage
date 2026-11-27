"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { useOrganizationLocale } from "@/lib/locale";
import { apiClient } from "@/services/api";

type PlanInvoice = {
  id: string; number: string; status: "open" | "paid" | "overdue" | "void" | "uncollectible"; due_date: string;
  total: string; balance: string; overdue: boolean; paid_at: string | null; notes: string; payment_url: string; pix_copy_paste: string;
};
const stateKeys = { open: "subscription.invoices.state.open", overdue: "subscription.invoices.state.overdue", paid: "subscription.invoices.state.paid", void: "subscription.invoices.state.void" } as const;
type Response = { subscription_status: string | null; results: PlanInvoice[] };

/** Plan invoices with the gateway payment link (admin and manager; hidden for other roles). */
export function PlanInvoices() {
  const { t, language } = useOrganizationLocale();
  const { showToast } = useToast();
  const [data, setData] = useState<Response | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const [attempt, setAttempt] = useState(0);
  const load = () => { setState("loading"); setAttempt(value => value + 1); };
  useEffect(() => {
    let active = true;
    apiClient.get<Response>("/organizations/me/invoices/")
      .then(({ data: body }) => { if (active) { setData(body); setState("ready"); } })
      .catch(error => { if (active) setState(error?.response?.status === 403 ? "forbidden" : "error"); });
    return () => { active = false; };
  }, [attempt]);
  if (state === "forbidden") return null;
  const money = (value: string) => Number(value).toLocaleString(language, { style: "currency", currency: "BRL" });
  const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(language);
  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(code); showToast(t("subscription.invoices.copied"), "success"); }
    catch { showToast(t("subscription.invoices.copyFailed"), "error"); }
  };
  const blocked = data?.subscription_status === "past_due" || data?.subscription_status === "suspended";
  return <section className="settings-section" aria-labelledby="plan-invoices-title">
    <header className="settings-section-header"><div><h2 id="plan-invoices-title">{t("subscription.invoices.title")}</h2></div></header>
    {blocked && <div className={`alert ${data?.subscription_status === "suspended" ? "alert-danger" : "alert-warning"} py-2 small`} role="status">
      {t(data?.subscription_status === "suspended" ? "subscription.invoices.suspended" : "subscription.invoices.pastDue")}
    </div>}
    {state === "loading" && <p className="settings-note mb-0" role="status">{t("subscription.invoices.loading")}</p>}
    {state === "error" && <div className="alert alert-danger py-2 small d-flex flex-wrap align-items-center gap-2" role="alert">
      {t("subscription.invoices.error")}<button type="button" className="btn btn-outline-secondary btn-sm" onClick={load}>{t("subscription.invoices.retry")}</button>
    </div>}
    {state === "ready" && !data?.results.length && <p className="settings-note mb-0">{t("subscription.invoices.empty")}</p>}
    {state === "ready" && !!data?.results.length && <div className="table-responsive">
      <table className="table settings-table mb-0">
        <caption className="visually-hidden">{t("subscription.invoices.title")}</caption>
        <thead><tr>
          <th scope="col">{t("subscription.invoices.due")}</th><th scope="col">{t("subscription.invoices.number")}</th>
          <th scope="col">{t("subscription.invoices.status")}</th><th scope="col" className="text-end">{t("subscription.invoices.amount")}</th><th scope="col"><span className="visually-hidden">{t("subscription.invoices.actions")}</span></th>
        </tr></thead>
        <tbody>{data.results.map(row => {
          const status = row.status === "paid" ? "paid" : row.overdue ? "overdue" : row.status === "void" || row.status === "uncollectible" ? "void" : "open";
          const payable = status === "open" || status === "overdue";
          return <tr key={row.id}>
            <td className="tabular-nums">{date(row.due_date)}</td>
            <td><span className="d-block">{row.number}</span>{row.notes && <small className="text-muted">{row.notes}</small>}</td>
            <td><span className={`badge ${status === "paid" ? "text-bg-success" : status === "overdue" ? "text-bg-danger" : status === "void" ? "text-bg-secondary" : "text-bg-warning"}`}>{t(stateKeys[status])}</span></td>
            <td className="text-end tabular-nums">{money(payable ? row.balance : row.total)}</td>
            <td className="text-end"><div className="d-inline-flex flex-wrap gap-2 justify-content-end">
              {payable && row.payment_url && <a className="btn btn-primary btn-sm d-inline-flex align-items-center gap-1" href={row.payment_url} target="_blank" rel="noopener noreferrer">{t("subscription.invoices.pay")}<ExternalLink size={14} aria-hidden="true"/></a>}
              {payable && row.pix_copy_paste && <button type="button" className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1" onClick={() => copy(row.pix_copy_paste)}><Copy size={14} aria-hidden="true"/>{t("subscription.invoices.copyPix")}</button>}
              {payable && !row.payment_url && !row.pix_copy_paste && <small className="text-muted">{t("subscription.invoices.contact")}</small>}
            </div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
  </section>;
}
