"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Download, Eye, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";
import { useToast } from "@/components/ui/Toast";
import { financeError, financeService, FinanceTransaction, FinanceCategory, FinanceAccount, FinanceFilters } from "@/services/financeService";

const today = () => new Date().toLocaleDateString("en-CA");
const money = (value: string | number) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const statuses: Record<string, string> = { paid: "Pago", pending: "Pendente", overdue: "Atrasado", cancelled: "Cancelado" };
const newDraft = () => ({ description: "", amount: "", category: "", bank_account: "", due_date: today(), farm: "", species: "", animal_batch: "", planting_cycle: "", reference: "", notes: "", series_kind: "single", series_count: "2" });
type Lookups = Awaited<ReturnType<typeof financeService.lookups>>;
const emptyLookups: Lookups = { farms: [], species: [], batches: [], plantations: [] };

export function TransactionManager() {
  const access = useOrganizationAccess();
  const canWrite = !!access && !access.read_only && ["admin", "manager"].includes(access.role);
  const { showToast } = useToast();
  const [rows, setRows] = useState<FinanceTransaction[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [lookups, setLookups] = useState<Lookups>(emptyLookups);
  const [loading, setLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<FinanceFilters>({});
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [modal, setModal] = useState<"new" | "pay" | "reverse" | "details" | null>(null);
  const [selected, setSelected] = useState<FinanceTransaction | null>(null);
  const [draft, setDraft] = useState(newDraft);
  const [payment, setPayment] = useState({ bank_account: "", payment_date: today(), payment_method: "pix", reason: "", idempotency_key: "" });
  const [seriesId, setSeriesId] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    financeService.list({ ...filters, page }, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setRows(data.results); setCount(data.count); setHasNext(!!data.next); setError("");
    }).catch(error => { if (!controller.signal.aborted) setError(financeError(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, page, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([financeService.categories(controller.signal), financeService.accounts(controller.signal), financeService.lookups(controller.signal)]).then(([categories, accounts, lookups]) => {
      if (!controller.signal.aborted) { setCategories(categories); setAccounts(accounts); setLookups(lookups); }
    }).catch(error => { if (!controller.signal.aborted) setError(financeError(error)); })
      .finally(() => { if (!controller.signal.aborted) setOptionsLoading(false); });
    return () => controller.abort();
  }, []);

  function filter(key: string, value: string) { setLoading(true); setPage(1); setFilters(current => ({ ...current, [key]: value })); }
  function reload() { setLoading(true); setRefresh(value => value + 1); }
  function open(action: typeof modal, row?: FinanceTransaction) {
    setSelected(row || null); setFormError(""); setModal(action);
    if (action === "new") { setDraft(newDraft()); setSeriesId(crypto.randomUUID()); }
    if (action === "pay" || action === "reverse") setPayment({ bank_account: row?.bank_account || "", payment_date: today(), payment_method: "pix", reason: "", idempotency_key: crypto.randomUUID() });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setFormError("");
    try {
      if (modal === "new") {
        const { series_kind, series_count, ...values } = draft;
        const payload = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, ["bank_account", "farm", "species", "animal_batch", "planting_cycle"].includes(key) && !value ? null : value]));
        if (series_kind === "single") await financeService.create({ ...payload, status: "pending" });
        else await financeService.series({ transaction: { ...payload, status: "pending" }, series_id: seriesId, kind: series_kind, count: Number(series_count) });
      } else if (modal === "pay" && selected) {
        await financeService.settle(selected.id, payment);
      } else if (modal === "reverse" && selected) {
        const reversed = new Set(selected.payment_events.filter(value => value.reverses).map(value => value.reverses));
        const active = selected.payment_events.find(value => value.kind === "payment" && !reversed.has(value.id));
        await financeService.reverse(selected.id, { reason: payment.reason.trim(), idempotency_key: payment.idempotency_key, ...(active ? { payment: active.id } : {}) });
      }
      setModal(null); reload(); showToast("Operação registrada com sucesso.", "success");
    } catch (error) { setFormError(financeError(error)); } finally { setBusy(false); }
  }
  async function remove(row: FinanceTransaction) {
    if (!window.confirm(`Excluir o título em aberto “${row.description}”?`)) return;
    try { await financeService.remove(row.id); reload(); } catch (error) { showToast(financeError(error), "error"); }
  }
  async function cancel(row: FinanceTransaction) {
    if (!window.confirm(`Cancelar o título “${row.description}”? O documento de origem será preservado.`)) return;
    try { await financeService.update(row.id, { status: "cancelled" }); reload(); } catch (error) { showToast(financeError(error), "error"); }
  }
  function source(row: FinanceTransaction) {
    if (row.reference.startsWith("STOCK-MOV-") || row.reference.startsWith("LOTE-")) return "/home/estoque/movimentacoes";
    if (row.animal_batch) return `/home/rebanho/${row.species_name?.toLowerCase().includes("bovin") ? "bovinos/vendas" : "suinos/lotes"}`;
    if (row.planting_cycle) return `/home/plantacoes/${row.planting_cycle}`;
    return null;
  }

  return <div className="dashboard-card p-3 p-md-4 border border-border">
    <div className="d-flex flex-wrap justify-content-between gap-3 mb-3">
      <h2 className="h4 fw-bold mb-0">Transações</h2>
      <div className="d-flex flex-wrap gap-2">
        <button className="btn btn-outline-secondary" onClick={() => financeService.export(filters).catch(error => showToast(financeError(error), "error"))}><Download size={16} /> Exportar filtradas</button>
        {canWrite && <button className="btn btn-primary" disabled={optionsLoading} onClick={() => open("new")}><Plus size={16} /> Novo lançamento</button>}
      </div>
    </div>
    <div className="row g-2 mb-3">
      <label className="col-12 col-md-4 small">Busca<div className="input-group"><span className="input-group-text"><Search size={16} /></span><input className="form-control" placeholder="Descrição, referência ou categoria" value={filters.search || ""} onChange={e => filter("search", e.target.value)} /></div></label>
      <label className="col-6 col-md-2 small">Tipo<select className="form-select" value={filters.type || ""} onChange={e => filter("type", e.target.value)}><option value="">Todos</option><option value="revenue">Receitas</option><option value="expense">Despesas</option></select></label>
      <label className="col-6 col-md-2 small">Situação<select className="form-select" value={filters.status || ""} onChange={e => filter("status", e.target.value)}><option value="">Todas</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="col-6 col-md-2 small">Vencimento de<input className="form-control" type="date" value={filters.due_date__gte || ""} onChange={e => filter("due_date__gte", e.target.value)} /></label>
      <label className="col-6 col-md-2 small">Até<input className="form-control" type="date" value={filters.due_date__lte || ""} onChange={e => filter("due_date__lte", e.target.value)} /></label>
      <label className="col-6 col-md-3 small">Propriedade<select className="form-select" value={filters.farm || ""} onChange={e => filter("farm", e.target.value)}><option value="">Todas</option>{lookups.farms.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
      <label className="col-6 col-md-3 small">Atividade pecuária<select className="form-select" value={filters.species || ""} onChange={e => filter("species", e.target.value)}><option value="">Todas</option>{lookups.species.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
      <label className="col-6 col-md-3 small">Conta<select className="form-select" value={filters.bank_account || ""} onChange={e => filter("bank_account", e.target.value)}><option value="">Todas</option>{accounts.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
      <label className="col-6 col-md-3 small">Plantação<select className="form-select" value={filters.planting_cycle || ""} onChange={e => filter("planting_cycle", e.target.value)}><option value="">Todas</option>{lookups.plantations.map(value => <option key={value.id} value={value.id}>{value.name || "Sem nome"}</option>)}</select></label>
    </div>
    {error && <div className="alert alert-danger" role="alert">{error}<button className="btn btn-sm btn-outline-danger ms-2" onClick={reload}>Tentar novamente</button></div>}
    {loading ? <p role="status">Carregando títulos…</p> : <div className="table-responsive"><table className="table align-middle table-hover">
      <thead><tr><th>Descrição / origem</th><th>Vencimento</th><th>Valor</th><th>Conta</th><th>Situação</th><th>Ações</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <td><strong>{row.description}</strong><small className="d-block text-muted">{row.category_name} · {row.farm_name || "Sem propriedade"} · {row.species_name || row.planting_cycle_name || "Geral"}</small>{row.series_number && <small className="d-block">{row.series_kind === "installment" ? "Parcela" : "Recorrência"} {row.series_number}/{row.series_count}</small>}{source(row) && <Link className="small" href={source(row)!}>Abrir origem</Link>}</td>
        <td>{date(row.due_date)}</td><td className={row.category_type === "revenue" ? "text-success fw-bold" : "fw-bold"}>{row.category_type === "revenue" ? "+ " : "− "}{money(row.amount)}</td><td>{row.bank_account_name || "Sem conta"}</td>
        <td><span className={`badge ${row.status === "paid" ? "bg-success" : row.status === "cancelled" ? "bg-secondary" : "bg-warning text-dark"}`}>{statuses[row.status] || row.status}</span></td>
        <td><div className="d-flex flex-wrap gap-1">
          <button className="btn btn-sm btn-outline-secondary" aria-label={`Ver ${row.description}`} onClick={() => open("details", row)}><Eye size={16} /></button>
          {canWrite && ["pending", "overdue"].includes(row.status) && <button className="btn btn-sm btn-outline-success" onClick={() => open("pay", row)}>Dar baixa</button>}
          {canWrite && row.status === "paid" && <button className="btn btn-sm btn-outline-warning" onClick={() => open("reverse", row)}>Estornar</button>}
          {canWrite && ["pending", "overdue"].includes(row.status) && row.payment_events.length === 0 && <button className="btn btn-sm btn-outline-secondary" onClick={() => cancel(row)}>Cancelar</button>}
          {canWrite && row.status !== "paid" && !row.payment_events.length && !row.reference.startsWith("STOCK-MOV-") && !row.reference.startsWith("LOTE-") && !row.reference.includes("BATCH-") && <button className="btn btn-sm btn-outline-danger" aria-label={`Excluir ${row.description}`} onClick={() => remove(row)}><Trash2 size={16} /></button>}
        </div></td>
      </tr>)}{rows.length === 0 && <tr><td colSpan={6} className="text-center text-muted py-4">Nenhum título encontrado.</td></tr>}</tbody>
    </table></div>}
    <div className="d-flex justify-content-between align-items-center gap-2 mt-3"><small>{count} títulos · página {page}</small><div className="d-flex gap-2"><button className="btn btn-sm btn-outline-secondary" disabled={loading || page === 1} onClick={() => { setLoading(true); setPage(page - 1); }}>Anterior</button><button className="btn btn-sm btn-outline-secondary" disabled={loading || !hasNext} onClick={() => { setLoading(true); setPage(page + 1); }}>Próxima</button></div></div>

    {modal && <Modal isOpen onClose={() => { if (!busy) setModal(null); }} title={{ new: "Novo lançamento", pay: "Registrar baixa", reverse: "Estornar pagamento", details: "Detalhes do título" }[modal]}>
      {modal === "details" && selected ? <div className="p-3 p-md-4">
        <h3 className="h5">{selected.description}</h3><p>{money(selected.amount)} · {statuses[selected.status]} · vencimento {date(selected.due_date)}</p><p>Referência: {selected.reference || "—"}</p><p style={{ whiteSpace: "pre-wrap" }}>{selected.notes}</p>
        <h4 className="h6">Histórico de baixas e estornos</h4>{selected.payment_events.length === 0 && <p className="text-muted">Sem eventos de liquidação registrados. Títulos anteriores a esta versão preservam sua situação original.</p>}
        {selected.payment_events.map(event => <div key={event.id} className="border rounded p-3 mb-2"><strong>{event.kind === "payment" ? "Baixa" : "Estorno"}: {money(event.amount)}</strong><small className="d-block">{date(event.payment_date)} · {event.bank_account_name || "Sem conta informada"} · {event.created_by_name || "Sistema"}</small>{event.reason && <p className="mb-0 small">{event.reason}</p>}</div>)}
      </div> : <form onSubmit={submit} className="p-3 p-md-4">
        {formError && <div className="alert alert-danger" role="alert">{formError}</div>}
        {modal === "new" ? <div className="row g-3">
          <label className="col-12 form-label">Descrição<input className="form-control" required maxLength={500} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
          <label className="col-6 form-label">{draft.series_kind === "recurrence" ? "Valor de cada ocorrência" : "Valor total"}<input className="form-control" required type="number" min="0.01" step="0.01" value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value })} /></label>
          <label className="col-6 form-label">Primeiro vencimento<input className="form-control" type="date" required value={draft.due_date} onChange={e => setDraft({ ...draft, due_date: e.target.value })} /></label>
          <label className="col-12 col-md-6 form-label">Categoria<select className="form-select" required value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}><option value="">Selecione</option>{categories.filter(value => value.is_active).map(value => <option key={value.id} value={value.id}>{value.name} ({value.category_type === "expense" ? "Despesa" : "Receita"})</option>)}</select></label>
          <label className="col-12 col-md-6 form-label">Propriedade<select className="form-select" value={draft.farm} onChange={e => setDraft({ ...draft, farm: e.target.value, animal_batch: "", planting_cycle: "" })}><option value="">Geral</option>{lookups.farms.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
          <label className="col-12 col-md-6 form-label">Atividade pecuária<select className="form-select" value={draft.species} onChange={e => setDraft({ ...draft, species: e.target.value, animal_batch: "" })}><option value="">Nenhuma</option>{lookups.species.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
          <label className="col-12 col-md-6 form-label">Lote animal<select className="form-select" value={draft.animal_batch} onChange={e => { const batch = lookups.batches.find(value => value.id === e.target.value); setDraft({ ...draft, animal_batch: e.target.value, planting_cycle: "", ...(batch ? { farm: batch.farm_id, species: batch.species_id } : {}) }); }}><option value="">Nenhum</option>{lookups.batches.filter(value => (!draft.farm || value.farm_id === draft.farm) && (!draft.species || value.species_id === draft.species)).map(value => <option key={value.id} value={value.id}>{value.batch_code}</option>)}</select></label>
          <label className="col-12 form-label">Plantação<select className="form-select" value={draft.planting_cycle} onChange={e => { const plantation = lookups.plantations.find(value => value.id === e.target.value); setDraft({ ...draft, planting_cycle: e.target.value, animal_batch: "", species: "", ...(plantation ? { farm: plantation.farm_id || plantation.field__farm_id } : {}) }); }}><option value="">Nenhuma</option>{lookups.plantations.filter(value => !draft.farm || (value.farm_id || value.field__farm_id) === draft.farm).map(value => <option key={value.id} value={value.id}>{value.name || "Sem nome"}</option>)}</select></label>
          <label className="col-12 col-md-6 form-label">Agendamento<select className="form-select" value={draft.series_kind} onChange={e => setDraft({ ...draft, series_kind: e.target.value })}><option value="single">Título único</option><option value="installment">Parcelar o valor total</option><option value="recurrence">Repetir o valor mensalmente</option></select></label>
          {draft.series_kind !== "single" && <label className="col-12 col-md-6 form-label">Quantidade de {draft.series_kind === "installment" ? "parcelas" : "ocorrências"}<input className="form-control" type="number" required min={2} max={120} value={draft.series_count} onChange={e => setDraft({ ...draft, series_count: e.target.value })} /></label>}
          <label className="col-12 form-label">Referência<input className="form-control" maxLength={100} value={draft.reference} onChange={e => setDraft({ ...draft, reference: e.target.value })} /></label>
          <label className="col-12 form-label">Observações<textarea className="form-control" rows={2} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label>
          <p className="small text-muted mb-0">Os títulos serão criados em aberto. O saldo da conta muda apenas após registrar a baixa.</p>
        </div> : <div className="d-flex flex-column gap-3">
          <p className="mb-0">{selected?.description} · <strong>{money(selected?.amount || 0)}</strong></p>
          {modal === "pay" ? <>
            <label className="form-label">Conta de liquidação<select className="form-select" required value={payment.bank_account} onChange={e => setPayment({ ...payment, bank_account: e.target.value })}><option value="">Selecione</option>{accounts.filter(value => value.is_active).map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
            <label className="form-label">Data efetiva<input className="form-control" type="date" max={today()} required value={payment.payment_date} onChange={e => setPayment({ ...payment, payment_date: e.target.value })} /></label>
            <label className="form-label">Forma de pagamento<select className="form-select" value={payment.payment_method} onChange={e => setPayment({ ...payment, payment_method: e.target.value })}>{Object.entries({ pix: "PIX", boleto: "Boleto", credit_card: "Cartão", transfer: "Transferência", cash: "Dinheiro" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </> : <label className="form-label">Motivo do estorno<textarea className="form-control" required maxLength={1000} value={payment.reason} onChange={e => setPayment({ ...payment, reason: e.target.value })} /></label>}
        </div>}
        <div className="d-flex flex-wrap justify-content-end gap-2 mt-4"><button className="btn btn-outline-secondary" type="button" disabled={busy} onClick={() => setModal(null)}>Cancelar</button><button className="btn btn-primary" disabled={busy || (modal === "reverse" && !payment.reason.trim())}>{busy ? "Registrando…" : modal === "reverse" ? "Confirmar estorno" : "Registrar"}</button></div>
      </form>}
    </Modal>}
  </div>;
}
