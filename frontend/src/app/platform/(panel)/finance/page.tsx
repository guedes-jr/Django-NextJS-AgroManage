"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownUp, ArrowLeft, ArrowRight, Check, CircleDollarSign, ClockAlert, Download, Eye, FileSpreadsheet, FileText, Filter, Plus, RefreshCw, Search, ShieldCheck, TrendingUp, Wallet, AlertCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { platformService } from "@/services/platformApi";
import type { PlatformFinanceDashboard, PlatformInvoice, PlatformInvoiceDetails, PlatformInvoicePage, PlatformOrganization, PlatformPlan, PlatformStaff } from "@/types/platform";
import { exportFinanceReport } from "@/services/platformFinanceExport";
import "./finance.css";
const money = (value: string | number) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string | null) => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString("pt-BR") : "—";
const localDate = (value = new Date()) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const localTime = () => { const d = new Date(); return `${localDate(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const statuses: Record<string, string> = { draft: "Rascunho", open: "Em aberto", paid: "Paga", overdue: "Vencida", void: "Cancelada", uncollectible: "Incobrável" };
const colors: Record<string, string> = { paid: "#2b8d67", open: "#719bd7", overdue: "#e6a05b", draft: "#a5b7b0", void: "#c5ccd3", uncollectible: "#b9818e" };
type Filters = {
    date_from: string;
    date_to: string;
    date_field: string;
    organization: string;
    plan: string;
    status: string;
    search: string;
};
const initialFilters = (): Filters => ({ date_from: localDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), date_to: localDate(), date_field: "due_date", organization: "", plan: "", status: "", search: "" });
const paramsFor = (filters: Filters) => Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ""));
const errorMessage = (error: unknown, fallback: string) => { if (error && typeof error === "object" && "response" in error) {
    const response = error.response as {
        data?: Record<string, unknown>;
    };
    if (response.data) {
        return Object.values(response.data).flat().join(" ") || fallback;
    }
} return fallback; };
const invoiceStatus = (invoice: PlatformInvoice) => invoice.effective_status || invoice.status;
export default function PlatformFinancePage() {
    const [filters, setFilters] = useState<Filters>(initialFilters);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [ordering, setOrdering] = useState("-due_date");
    const [dashboard, setDashboard] = useState<PlatformFinanceDashboard | null>(null);
    const [invoices, setInvoices] = useState<PlatformInvoicePage | null>(null);
    const [organizations, setOrganizations] = useState<PlatformOrganization[]>([]);
    const [plans, setPlans] = useState<PlatformPlan[]>([]);
    const [staff, setStaff] = useState<PlatformStaff | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [revision, setRevision] = useState(0);
    const [exporting, setExporting] = useState("");
    const [exportError, setExportError] = useState("");
    const [showCreate, setShowCreate] = useState(false);
    const [paying, setPaying] = useState<PlatformInvoice | null>(null);
    const [detailId, setDetailId] = useState<string | null>(null);
    const [details, setDetails] = useState<PlatformInvoiceDetails | null>(null);
    const [detailError, setDetailError] = useState("");
    const [form, setForm] = useState({ organization_id: "", due_date: localDate(), description: "Mensalidade Fazenda Mais", amount: "" });
    const [payment, setPayment] = useState({ amount: "", payment_method: "pix", paid_at: localTime(), notes: "" });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState("");
    const requestVersion = useRef(0);
    const canManage = staff?.role === "platform_owner" || staff?.role === "platform_admin";
    useEffect(() => { let active = true; Promise.all([platformService.financeOrganizations(), platformService.plans(), platformService.me()]).then(([o, p, s]) => { if (active) {
        setOrganizations(o);
        setPlans(p.results);
        setStaff(s);
    } }).catch(() => { if (active)
        setError("Não foi possível carregar as opções de organizações e planos. Atualize a página."); }); return () => { active = false; }; }, []);
    useEffect(() => { const timeout = setTimeout(() => { setFilters(current => current.search === search.trim() ? current : { ...current, search: search.trim() }); setPage(1); }, 350); return () => clearTimeout(timeout); }, [search]);
    const load = useCallback(async () => { const version = ++requestVersion.current; setLoading(true); setError(""); try {
        const params = paramsFor(filters);
        const [d, i] = await Promise.all([platformService.financeDashboard(params), platformService.invoices({ ...params, page, page_size: pageSize, ordering })]);
        if (version === requestVersion.current) {
            setDashboard(d);
            setInvoices(i);
        }
    }
    catch (e) {
        if (version === requestVersion.current)
            setError(errorMessage(e, "Não foi possível carregar o financeiro. Tente novamente."));
    }
    finally {
        if (version === requestVersion.current)
            setLoading(false);
    } }, [filters, page, pageSize, ordering]);
    useEffect(() => { const version = requestVersion; const timer = setTimeout(() => void load(), 0); return () => { clearTimeout(timer); version.current++; }; }, [load, revision]);
    useEffect(() => { if (!detailId)
        return; let active = true; platformService.invoiceDetails(detailId).then(data => { if (active)
        setDetails(data); }).catch(() => { if (active)
        setDetailError("Não foi possível carregar os detalhes desta fatura."); }); return () => { active = false; }; }, [detailId]);
    const changeFilter = (key: keyof Filters, value: string) => { setFilters(current => ({ ...current, [key]: value })); setPage(1); };
    const shortcut = (type: string) => { const today = new Date(); if (type === "overdue") {
        setFilters(current => ({ ...current, date_from: "", date_to: "", status: "overdue" }));
    }
    else {
        const start = type === "30" ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29) : new Date(today.getFullYear(), today.getMonth(), 1);
        setFilters(current => ({ ...current, date_from: localDate(start), date_to: localDate(today), status: "" }));
    } setPage(1); };
    const reset = () => { setFilters({ ...initialFilters(), date_from: "", date_to: "" }); setSearch(""); setPage(1); };
    const sort = (field: string) => { setOrdering(current => current === field ? `-${field}` : field); setPage(1); };
    const exportReport = async (format: "pdf" | "xlsx") => { setExporting(format); setExportError(""); try {
        const report = await platformService.financeReport({ ...paramsFor(filters), ordering, format_type: format });
        await exportFinanceReport(report, format, filters, organizations, plans);
    }
    catch (e) {
        setExportError(errorMessage(e, "Não foi possível exportar o relatório. Tente novamente."));
    }
    finally {
        setExporting("");
    } };
    const submitInvoice = async (e: FormEvent) => { e.preventDefault(); setSaving(true); setFormError(""); try {
        await platformService.createInvoice(form);
        setShowCreate(false);
        setForm({ ...form, amount: "" });
        setRevision(v => v + 1);
    }
    catch (e) {
        setFormError(errorMessage(e, "Não foi possível criar a fatura."));
    }
    finally {
        setSaving(false);
    } };
    const submitPayment = async (e: FormEvent) => { e.preventDefault(); if (!paying)
        return; setSaving(true); setFormError(""); try {
        await platformService.recordInvoicePayment(paying.id, payment.amount, payment.payment_method, { paid_at: new Date(payment.paid_at).toISOString(), notes: payment.notes });
        setPaying(null);
        setRevision(v => v + 1);
    }
    catch (e) {
        setFormError(errorMessage(e, "Não foi possível registrar o pagamento."));
    }
    finally {
        setSaving(false);
    } };
    const openPayment = (invoice: PlatformInvoice) => { setFormError(""); setPaying(invoice); setPayment({ amount: invoice.amount_due, payment_method: "pix", paid_at: localTime(), notes: "" }); };
    const metricItems = dashboard ? [{ label: "Receita recorrente mensal", value: money(dashboard.mrr), note: `MRR atual · ${dashboard.active_subscriptions} assinaturas ativas`, Icon: TrendingUp }, { label: "Projeção anual recorrente", value: money(dashboard.arr), note: "ARR atual · receita recorrente mensal × 12", Icon: CircleDollarSign }, { label: "Recebido no período", value: money(dashboard.received_period), note: "Pagamentos confirmados no período e nas faturas filtradas", Icon: Wallet }, { label: "Saldo a receber", value: money(dashboard.outstanding), note: `${dashboard.open_invoices} faturas em aberto no recorte`, Icon: FileText }, { label: "Saldo vencido", value: money(dashboard.overdue_amount), note: `${dashboard.overdue_invoices} faturas com vencimento anterior a hoje`, Icon: ClockAlert, warning: true }, { label: "Faturas em atraso", value: `${dashboard.overdue_rate.toFixed(1).replace(".", ",")}%`, note: "Faturas vencidas ÷ faturas com saldo em aberto", Icon: AlertCircle, warning: true }] : [];
    const totalPages = Math.max(1, Math.ceil((invoices?.count || 0) / pageSize));
    const invalidPeriod = !!(filters.date_from && filters.date_to && filters.date_from > filters.date_to);
    return <div className="saas-finance">
  <header className="sf-hero"><div><div className="sf-eyebrow"><ShieldCheck size={14}/> Gestão da receita · Fazenda Mais</div><h1>Financeiro SaaS</h1><p>Acompanhe a recorrência, organize as cobranças e transforme seus números em decisões.</p></div><div className="sf-actions"><button className="sf-button" onClick={() => setRevision(v => v + 1)} disabled={loading} aria-label="Atualizar financeiro"><RefreshCw size={16}/></button>{canManage && <button className="sf-button primary" onClick={() => { setFormError(""); setShowCreate(true); }}><Plus size={16}/>Nova fatura</button>}</div></header>
  {exportError && <div className="sf-error" role="alert"><AlertCircle size={17}/>{exportError}</div>}<section className="sf-panel sf-filters" aria-label="Filtros financeiros"><div className="sf-eyebrow"><Filter size={14}/> Defina seu recorte</div><div className="sf-filter-grid">
   <div className="sf-field"><label htmlFor="date-field">Analisar por</label><select id="date-field" value={filters.date_field} onChange={e => changeFilter("date_field", e.target.value)}><option value="due_date">Data de vencimento</option><option value="issued_at">Data de emissão</option><option value="paid_at">Data de pagamento</option></select></div>
   <div className="sf-field"><label htmlFor="date-from">De</label><input id="date-from" type="date" value={filters.date_from} onChange={e => changeFilter("date_from", e.target.value)}/></div><div className="sf-field"><label htmlFor="date-to">Até</label><input id="date-to" type="date" value={filters.date_to} min={filters.date_from || undefined} onChange={e => changeFilter("date_to", e.target.value)}/></div>
   <div className="sf-field"><label htmlFor="organization">Organização</label><select id="organization" value={filters.organization} onChange={e => changeFilter("organization", e.target.value)}><option value="">Todas as organizações</option>{organizations.map(o => <option value={o.id} key={o.id}>{o.name}</option>)}</select></div><div className="sf-field"><label htmlFor="plan">Plano</label><select id="plan" value={filters.plan} onChange={e => changeFilter("plan", e.target.value)}><option value="">Todos os planos</option>{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
  </div><div className="sf-filter-bottom"><button className="sf-chip" onClick={() => shortcut("month")}>Este mês</button><button className="sf-chip" onClick={() => shortcut("30")}>Últimos 30 dias</button><button className="sf-chip" onClick={() => shortcut("overdue")}>Somente vencidas</button><button className="sf-chip" onClick={reset}>Limpar filtros</button><span className="sf-caption">MRR e ARR representam as assinaturas atuais da organização e do plano selecionados.</span></div></section>
  {invalidPeriod && <div className="sf-error" role="alert"><AlertCircle size={17}/>O início do período deve ser anterior ao fim.</div>}{error && <div className="sf-error" role="alert"><AlertCircle size={17}/>{error}<button className="sf-button" onClick={() => setRevision(v => v + 1)}>Tentar novamente</button></div>}
  {loading ? <div className="sf-panel sf-loader" role="status"><div className="spinner-border text-success"/><span className="visually-hidden">Carregando financeiro</span></div> : !error && dashboard && <><section className="sf-metrics" aria-label="Indicadores financeiros">{metricItems.map(m => <article className={`sf-metric ${m.warning ? "warning" : ""}`} key={m.label}><div className="sf-metric-label">{m.label}<span className="sf-icon"><m.Icon size={17}/></span></div><strong>{m.value}</strong><small>{m.note}</small></article>)}</section>
  <div className="sf-charts"><section className="sf-panel sf-chart"><h2 className="sf-section-title">Evolução dos recebimentos</h2><p className="sf-caption">Pagamentos confirmados das faturas filtradas, agrupados por mês.</p>{dashboard.receipts.length ? <div className="sf-chart-frame"><ResponsiveContainer width="100%" height="100%"><AreaChart data={dashboard.receipts.map(r => ({ month: new Date(r.month).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), amount: Number(r.amount) }))} margin={{ left: 5, right: 15 }}><defs><linearGradient id="receiptFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2b8d67" stopOpacity={.26}/><stop offset="100%" stopColor="#2b8d67" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false}/><XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11}/><YAxis tickFormatter={v => new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(v)} tickLine={false} axisLine={false} fontSize={11}/><Tooltip formatter={v => [money(Number(v)), "Recebido"]}/><Area dataKey="amount" type="monotone" stroke="#2b8d67" strokeWidth={3} fill="url(#receiptFill)" dot={{ r: 4 }}/></AreaChart></ResponsiveContainer></div> : <div className="sf-empty"><TrendingUp size={28}/><strong>Sem recebimentos neste recorte</strong><span className="sf-caption">Amplie o período ou revise os filtros.</span></div>}</section>
  <section className="sf-panel sf-chart"><h2 className="sf-section-title">Distribuição das faturas</h2><p className="sf-caption">Quantidade por situação atual · {dashboard.invoice_count} faturas</p>{dashboard.distribution.length ? <><div className="sf-chart-frame"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dashboard.distribution.map(s => ({ ...s, label: statuses[s.status] }))} dataKey="count" nameKey="label" innerRadius={62} outerRadius={88} paddingAngle={3}>{dashboard.distribution.map(s => <Cell key={s.status} fill={colors[s.status]}/>)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div><div className="sf-chart-legend">{dashboard.distribution.map(s => <span key={s.status}><i style={{ background: colors[s.status] }}/>{statuses[s.status]} · {s.count}</span>)}</div></> : <div className="sf-empty"><FileText size={28}/><strong>Nenhuma fatura no período</strong></div>}</section></div></>}
  <section className="sf-panel"><div className="sf-table-header"><div><h2 className="sf-section-title">Faturas e cobranças</h2><span className="sf-caption">Consulte detalhes, acompanhe saldos e registre recebimentos.</span></div><div className="sf-actions"><button className="sf-button" disabled={!!exporting || loading || !!error || !invoices?.count} onClick={() => void exportReport("pdf")}><Download size={15}/>{exporting === "pdf" ? "Gerando…" : "PDF"}</button><button className="sf-button" disabled={!!exporting || loading || !!error || !invoices?.count} onClick={() => void exportReport("xlsx")}><FileSpreadsheet size={15}/>{exporting === "xlsx" ? "Gerando…" : "Excel"}</button></div></div>
  <div className="sf-table-toolbar"><div className="sf-search"><Search size={17}/><input aria-label="Buscar faturas" placeholder="Busque por fatura, organização ou descrição…" maxLength={200} value={search} onChange={e => setSearch(e.target.value)}/></div><div className="sf-field"><select aria-label="Status da fatura" value={filters.status} onChange={e => changeFilter("status", e.target.value)}><option value="">Todos os status</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="sf-field"><select aria-label="Faturas por página" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>{[20, 50, 100].map(size => <option key={size} value={size}>{size} por página</option>)}</select></div></div>
  {!loading && !error && invoices?.results.length ? <div className="table-responsive"><table className="sf-table"><thead><tr>{[["Número", "number"], ["Organização", "organization__name"], ["Vencimento", "due_date"], ["Total", "total"], ["Recebido", "amount_paid"], ["Saldo", ""], ["Status", "status"]].map(([label, field]) => <th key={label}>{field ? <button className="sf-sort" onClick={() => sort(field)}>{label}<ArrowDownUp size={12}/>{ordering.replace("-", "") === field && <span>{ordering.startsWith("-") ? "↓" : "↑"}</span>}</button> : label}</th>)}<th>Ações</th></tr></thead><tbody>{invoices.results.map(i => <tr key={i.id}><td><strong>{i.number}</strong></td><td><strong>{i.organization_name}</strong><small>{i.plan_name}</small></td><td>{date(i.due_date)}</td><td className="sf-numeric">{money(i.total)}</td><td className="sf-numeric">{money(i.amount_paid)}</td><td className="sf-numeric"><strong>{money(i.amount_due)}</strong></td><td><span className={`sf-badge ${invoiceStatus(i)}`}>{invoiceStatus(i) === "paid" ? <Check size={12}/> : invoiceStatus(i) === "overdue" ? <ClockAlert size={12}/> : null}{statuses[invoiceStatus(i)]}</span></td><td><div className="sf-actions"><button className="sf-button" aria-label={`Detalhes da fatura ${i.number}`} onClick={() => { setDetails(null); setDetailError(""); setDetailId(i.id); }}><Eye size={14}/></button>{canManage && !['paid', 'void'].includes(i.status) && Number(i.amount_due) > 0 && <button className="sf-button" onClick={() => openPayment(i)}>Receber</button>}</div></td></tr>)}</tbody></table></div> : !loading && !error ? <div className="sf-empty"><Search size={30}/><strong>Nenhuma fatura encontrada</strong><span className="sf-caption">Altere o período, a busca ou os filtros para consultar outras cobranças.</span><button className="sf-button" onClick={reset}>Limpar filtros</button></div> : <div className="sf-empty">{loading ? "Atualizando faturas…" : "A listagem está indisponível. Tente novamente."}</div>}
  <footer className="sf-pagination"><span className="sf-caption">{!loading && !error ? `${invoices?.count || 0} resultados · página ${page} de ${totalPages}` : "—"} · Exportação inclui todas as páginas filtradas.</span><div className="sf-actions"><button className="sf-button" disabled={loading || page <= 1} onClick={() => setPage(p => p - 1)}><ArrowLeft size={14}/>Anterior</button><button className="sf-button" disabled={loading || !!error || page >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima<ArrowRight size={14}/></button></div></footer></section>
  <Modal isOpen={showCreate} onClose={() => { if (!saving)
        setShowCreate(false); }} title="Nova fatura" description="Emita uma cobrança manual para uma organização com assinatura."><form className="sf-modal-form" onSubmit={submitInvoice}>{formError && <div className="sf-error" role="alert">{formError}</div>}<div className="sf-field"><label htmlFor="new-org">Organização</label><select id="new-org" required value={form.organization_id} onChange={e => setForm({ ...form, organization_id: e.target.value })}><option value="">Selecione uma organização</option>{organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div><div className="sf-form-row"><div className="sf-field"><label htmlFor="new-date">Vencimento</label><input id="new-date" type="date" required value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })}/></div><div className="sf-field"><label htmlFor="new-amount">Valor da fatura (R$)</label><input id="new-amount" type="number" step="0.01" min="0.01" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}/></div></div><div className="sf-field"><label htmlFor="new-description">Descrição</label><input id="new-description" required maxLength={255} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></div><div className="sf-actions"><button type="button" className="sf-button" disabled={saving} onClick={() => setShowCreate(false)}>Cancelar</button><button className="sf-button primary" disabled={saving}>{saving ? "Emitindo…" : "Emitir fatura"}</button></div></form></Modal>
  <Modal isOpen={!!paying} onClose={() => { if (!saving)
        setPaying(null); }} title="Registrar recebimento" description={paying ? `${paying.number} · ${paying.organization_name}` : ""}><form className="sf-modal-form" onSubmit={submitPayment}>{formError && <div className="sf-error" role="alert">{formError}</div>}<div className="sf-balance"><span>Saldo da fatura</span><strong>{money(paying?.amount_due || 0)}</strong></div><div className="sf-form-row"><div className="sf-field"><label htmlFor="pay-amount">Valor recebido (R$)</label><input id="pay-amount" required type="number" min="0.01" step="0.01" max={paying?.amount_due} value={payment.amount} onChange={e => setPayment({ ...payment, amount: e.target.value })}/></div><div className="sf-field"><label htmlFor="pay-date">Data e hora do recebimento</label><input id="pay-date" required type="datetime-local" max={localTime()} value={payment.paid_at} onChange={e => setPayment({ ...payment, paid_at: e.target.value })}/></div></div><div className="sf-field"><label htmlFor="pay-method">Forma de pagamento</label><select id="pay-method" value={payment.payment_method} onChange={e => setPayment({ ...payment, payment_method: e.target.value })}>{[['pix', 'Pix'], ['bank_transfer', 'Transferência bancária'], ['bank_slip', 'Boleto'], ['credit_card', 'Cartão de crédito'], ['cash', 'Dinheiro'], ['manual', 'Outro / manual']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="sf-field"><label htmlFor="pay-notes">Observação (opcional)</label><textarea id="pay-notes" maxLength={2000} value={payment.notes} onChange={e => setPayment({ ...payment, notes: e.target.value })}/></div><p className="sf-caption">Saldo após este recebimento: <strong>{money(Math.max(0, Number(paying?.amount_due || 0) - Number(payment.amount || 0)))}</strong>. Pagamentos parciais mantêm a fatura em aberto.</p><div className="sf-actions"><button type="button" className="sf-button" disabled={saving} onClick={() => setPaying(null)}>Cancelar</button><button className="sf-button primary" disabled={saving}>{saving ? "Registrando…" : "Confirmar recebimento"}</button></div></form></Modal>
  <Modal isOpen={!!detailId} onClose={() => setDetailId(null)} title={details ? `Fatura ${details.invoice.number}` : "Detalhes da fatura"} description={details?.invoice.organization_name}>{detailError ? <div className="sf-error" role="alert">{detailError}</div> : !details ? <div className="sf-empty" role="status">Carregando detalhes…</div> : <><div className="sf-detail-list">{[['Plano', details.invoice.plan_name], ['Vencimento', date(details.invoice.due_date)], ['Valor total', money(details.invoice.total)], ['Saldo', money(details.invoice.amount_due)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><h3 className="sf-section-title">Itens da cobrança</h3>{details.items.map((item, index) => <div className="sf-history" key={index}><span>{item.description}<small className="d-block sf-caption">{item.quantity} × {money(item.unit_amount)}</small></span><strong>{money(item.total)}</strong></div>)}<h3 className="sf-section-title mt-4">Histórico de pagamentos</h3>{!details.payments.length ? <p className="sf-caption">Nenhum pagamento registrado.</p> : details.payments.map(p => <div className="sf-history" key={p.id}><div><strong>{p.status_display}</strong><small className="d-block sf-caption">{date(p.paid_at)} · {p.payment_method}</small>{p.notes && <p>{p.notes}</p>}</div><strong>{money(p.amount)}</strong></div>)}</>}</Modal>
 </div>;
}
