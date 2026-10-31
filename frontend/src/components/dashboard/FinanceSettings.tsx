"use client";
import { useEffect, useState } from "react";
import { financeError, financeService, FinanceAccount, FinanceCategory } from "@/services/financeService";
import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";

const money = (value: string) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function FinanceSettings() {
  const access = useOrganizationAccess();
  const canWrite = !!access && !access.read_only && ["admin", "manager"].includes(access.role);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [account, setAccount] = useState({ name: "", account_type: "checking", initial_balance: "0" });
  const [category, setCategory] = useState({ name: "", category_type: "expense", parent: "" });
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([financeService.accounts(controller.signal), financeService.categories(controller.signal)]).then(([accounts, categories]) => {
      if (!controller.signal.aborted) { setAccounts(accounts); setCategories(categories); setError(""); }
    }).catch(error => { if (!controller.signal.aborted) setError(financeError(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  async function save(task: () => Promise<unknown>) {
    if (busy) return; setBusy(true); setError("");
    try { await task(); setRefresh(value => value + 1); return true; } catch (error) { setError(financeError(error)); return false; } finally { setBusy(false); }
  }
  return <div className="row g-4">
    {error && <div className="col-12"><div className="alert alert-danger" role="alert">{error}</div></div>}
    {loading ? <p role="status">Carregando configurações…</p> : <>
      <section className="col-12 col-xl-6"><div className="dashboard-card p-3 p-md-4 h-100"><h2 className="h5 fw-bold">Contas e caixas</h2><p className="small text-muted">Saldo inicial + receitas pagas − despesas pagas. Títulos em aberto não alteram o saldo.</p>
        <div className="table-responsive"><table className="table align-middle"><thead><tr><th>Conta</th><th>Inicial</th><th>Realizado</th><th>Situação</th></tr></thead><tbody>{accounts.map(value => <tr key={value.id}><td>{value.name}</td><td>{money(value.initial_balance)}</td><td className="fw-bold">{money(value.current_balance)}</td><td>{canWrite ? <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => save(() => financeService.updateAccount(value.id, { is_active: !value.is_active }))}>{value.is_active ? "Desativar" : "Ativar"}</button> : value.is_active ? "Ativa" : "Inativa"}</td></tr>)}</tbody></table></div>
        {!accounts.length && <p className="text-muted">Nenhuma conta cadastrada.</p>}
        {canWrite && <form className="row g-2 mt-2" onSubmit={async e => { e.preventDefault(); if (await save(() => financeService.createAccount(account))) setAccount({ name: "", account_type: "checking", initial_balance: "0" }); }}>
          <label className="col-12 form-label">Nome da conta<input className="form-control" required maxLength={100} value={account.name} onChange={e => setAccount({ ...account, name: e.target.value })} /></label>
          <label className="col-6 form-label">Tipo<select className="form-select" value={account.account_type} onChange={e => setAccount({ ...account, account_type: e.target.value })}><option value="checking">Conta corrente</option><option value="savings">Poupança</option><option value="cash">Caixa</option></select></label>
          <label className="col-6 form-label">Saldo inicial<input className="form-control" type="number" step="0.01" required value={account.initial_balance} onChange={e => setAccount({ ...account, initial_balance: e.target.value })} /></label>
          <div className="col-12"><button className="btn btn-primary" disabled={busy}>Adicionar conta</button></div>
        </form>}
      </div></section>
      <section className="col-12 col-xl-6"><div className="dashboard-card p-3 p-md-4 h-100"><h2 className="h5 fw-bold">Categorias financeiras</h2><p className="small text-muted">Organize receitas e despesas com categorias e subcategorias.</p>
        <div className="table-responsive"><table className="table align-middle"><thead><tr><th>Categoria</th><th>Tipo</th><th>Situação</th></tr></thead><tbody>{categories.map(value => <tr key={value.id}><td>{value.parent && <small className="d-block text-muted">{categories.find(parent => parent.id === value.parent)?.name} ›</small>}{value.name}</td><td>{value.category_type === "expense" ? "Despesa" : "Receita"}</td><td>{canWrite ? <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => save(() => financeService.updateCategory(value.id, { is_active: !value.is_active }))}>{value.is_active ? "Desativar" : "Ativar"}</button> : value.is_active ? "Ativa" : "Inativa"}</td></tr>)}</tbody></table></div>
        {!categories.length && <p className="text-muted">Nenhuma categoria cadastrada.</p>}
        {canWrite && <form className="row g-2 mt-2" onSubmit={async e => { e.preventDefault(); if (await save(() => financeService.createCategory({ ...category, parent: category.parent || null }))) setCategory({ name: "", category_type: "expense", parent: "" }); }}>
          <label className="col-12 form-label">Nome<input className="form-control" required maxLength={100} value={category.name} onChange={e => setCategory({ ...category, name: e.target.value })} /></label>
          <label className="col-6 form-label">Tipo<select className="form-select" value={category.category_type} onChange={e => setCategory({ ...category, category_type: e.target.value, parent: "" })}><option value="expense">Despesa</option><option value="revenue">Receita</option></select></label>
          <label className="col-6 form-label">Categoria pai<select className="form-select" value={category.parent} onChange={e => setCategory({ ...category, parent: e.target.value })}><option value="">Nenhuma</option>{categories.filter(value => value.category_type === category.category_type && value.is_active).map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
          <div className="col-12"><button className="btn btn-primary" disabled={busy}>Adicionar categoria</button></div>
        </form>}
      </div></section>
    </>}
  </div>;
}
