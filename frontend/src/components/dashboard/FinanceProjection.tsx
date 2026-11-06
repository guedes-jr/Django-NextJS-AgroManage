"use client";
import { useOrganizationLocale } from "@/lib/locale";
import { useEffect, useState } from "react";
import { financeService, financeError, type CashProjection, type FinanceAccount } from "@/services/financeService";
const money = (value: string | number, language = "pt-BR") => Number(value).toLocaleString(language, { style: "currency", currency: "BRL" });
const date = (value: string, language = "pt-BR") => new Date(`${value}T12:00:00`).toLocaleDateString(language);
export function FinanceProjection() {
  const { language, t } = useOrganizationLocale();
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [account, setAccount] = useState("");
  const [days, setDays] = useState("30");
  const [overdue, setOverdue] = useState(true);
  const [data, setData] = useState<CashProjection | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    financeService.accounts(controller.signal).then(rows => { if (!controller.signal.aborted) setAccounts(rows); }).catch(error => { if (!controller.signal.aborted) setError(financeError(error, language)); });
    return () => controller.abort();
  }, [language]);
  useEffect(() => {
    const controller = new AbortController();
    financeService.projection({ days, include_overdue: String(overdue), ...(account ? { bank_account: account } : {}) }, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setData(data); setError(""); } })
      .catch(error => { if (!controller.signal.aborted) setError(financeError(error, language)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [account, days, overdue, language]);
  return <section className="dashboard-card p-3 p-md-4 mb-4">
    <div className="d-flex flex-wrap justify-content-between gap-3"><div><h2 className="h5 fw-bold">Projeção de caixa</h2><p className="small text-muted mb-2">Saldo realizado mais títulos em aberto nas datas previstas. Esta projeção não registra pagamentos.</p></div>
      <div className="d-flex flex-wrap gap-2">
        <label className="small">Contas<select className="form-select form-select-sm" value={account} onChange={event => { setAccount(event.target.value); setLoading(true); }}><option value="">Todas as contas</option>{accounts.map(row => <option key={row.id} value={row.id}>{row.name}{!row.is_active ? " (inativa)" : ""}</option>)}</select></label>
        <label className="small">Horizonte<select className="form-select form-select-sm" value={days} onChange={event => { setDays(event.target.value); setLoading(true); }}>{[30,60,90].map(value => <option key={value} value={value}>{value} dias, incluindo hoje</option>)}</select></label>
      </div>
    </div>
    <label className="small d-flex gap-2 align-items-center my-2"><input type="checkbox" checked={overdue} onChange={event => { setOverdue(event.target.checked); setLoading(true); }} />Incluir títulos vencidos no primeiro dia da projeção</label>
    {error && <p className="alert alert-danger" role="alert">{error}</p>}
    {loading ? <p role="status">Calculando projeção…</p> : data && <>
      <div className="d-flex flex-wrap gap-4 my-3"><span>Saldo realizado: <strong>{money(data.opening_balance, language)}</strong></span><span>Saldo previsto ao final: <strong>{money(data.closing_balance, language)}</strong></span></div>
      {data.first_negative_date && <p className="text-warning">Primeira data com saldo previsto negativo: <strong>{date(data.first_negative_date, language)}</strong>.</p>}
      <p className="small text-muted">{data.included_titles} títulos considerados. {account ? "Esta conta considera somente os títulos vinculados a ela." : `${data.unassigned_titles} títulos ainda sem conta também entram na previsão geral.`}</p>
      <div className="table-responsive" style={{ maxHeight: 300 }}><table className="table table-sm align-middle"><thead><tr><th>{t("lotReport.date")}</th><th>Receitas previstas</th><th>Despesas previstas</th><th>Saldo previsto</th></tr></thead><tbody>{data.days.map(row => <tr key={row.date}><td>{date(row.date, language)}</td><td>{money(row.revenue, language)}</td><td>{money(row.expense, language)}</td><td className={Number(row.balance) < 0 ? "text-danger fw-bold" : "fw-bold"}>{money(row.balance, language)}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
