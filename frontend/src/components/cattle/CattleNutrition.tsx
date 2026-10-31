"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { cattleService, cattleError, cattleNutritionStatuses, type CattleFeedPlan, type CattleBatch, type CattleDelivery, type Page } from "@/services/cattleService";
import { CattleForm, type CattleFormSpec } from "./CattleForm";
import styles from "./cattle.module.css";

const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; };
const number = (value: unknown) => value === null || value === undefined ? "—" : Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const date = (value: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "—";
function DeliveryHistory({ plan, onClose }: { plan: CattleFeedPlan; onClose: () => void }) {
  const [data, setData] = useState<Page<CattleDelivery> | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    cattleService.deliveries(plan.id, page, controller.signal).then(data => { if (!controller.signal.aborted) setData(data); }).catch(error => { if (!controller.signal.aborted) setError(cattleError(error)); });
    return () => controller.abort();
  }, [plan.id, page]);
  return <Modal isOpen onClose={onClose} title={`Fornecimentos · ${plan.batch_code}`} description={plan.item_name}><div className={styles.form}>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {!data && !error && <p role="status">Carregando histórico…</p>}
    {data?.results.map(row => <article className={styles.event} key={row.id}><time>{date(row.date)}</time><strong>{number(row.quantity_kg)} kg fornecidos · {row.head_count} cabeças</strong><p className="small mb-1">Saldo conferido antes: {number(row.remaining_before_kg)} kg · disponível após: {number(row.available_after_kg)} kg · necessidade diária registrada: {number(row.daily_requirement_kg)} kg</p><p className="small mb-1">Custo do fornecimento: {Number(row.cost).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p><p className="small mb-0">{row.notes}</p></article>)}
    {data && !data.count && <p>Sem fornecimentos registrados.</p>}
    <div className={styles.pagination}><span>Página {page}</span><button className="btn btn-outline-secondary btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button><button className="btn btn-outline-secondary btn-sm" disabled={!data?.next} onClick={() => setPage(page + 1)}>Próxima</button></div>
  </div></Modal>;
}

export function CattleNutrition({ farm, canWrite, onChanged }: { farm: string; canWrite: boolean; onChanged: () => void }) {
  const [data, setData] = useState<Page<CattleFeedPlan> | null>(null);
  const [page, setPage] = useState(1);
  const [active, setActive] = useState("true");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<CattleFormSpec | null>(null);
  const [history, setHistory] = useState<CattleFeedPlan | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    cattleService.list<CattleFeedPlan>("feed-plans", { ...(farm ? { farm } : {}), ...(active ? { is_active: active } : {}), page }, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setData(data); setError(""); } })
      .catch(error => { if (!controller.signal.aborted) setError(cattleError(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [farm, active, page, refresh]);
  async function plan(row?: CattleFeedPlan) {
    setError(""); setPreparing(true);
    try {
      const [batches, products] = row ? [[], []] : await Promise.all([cattleService.all<CattleBatch>("batches", { status: "active", ...(farm ? { farm } : {}) }), cattleService.stockItems()]);
      setForm({ title: row ? `Plano · ${row.batch_code}` : "Novo plano alimentar", description: "Informe a quantidade diária definida pelo responsável em kg por cabeça. Planejar não movimenta estoque.", initial: row ? { kg_per_head_day: row.kg_per_head_day, start_date: row.start_date, end_date: row.end_date || "", notes: row.notes || "", is_active: row.is_active ? "true" : "false" } : { start_date: today(), is_active: "true" }, fields: [
        ...(!row ? [{ name: "batch", label: "Lote coletivo", type: "select" as const, required: true, options: (batches as CattleBatch[]).map(value => ({ value: value.id, label: `${value.batch_code} · ${value.farm_name} · ${value.quantity} cabeças` })) }, { name: "item", label: "Ração ou suplemento em kg", type: "select" as const, required: true, options: products.filter(value => ["racao", "suplemento"].includes(value.categoria) && value.unidade_medida === "kg" && ["", "bovino", "multiplo"].includes(value.especie_animal)).map(value => ({ value: value.id, label: value.nome })) }] : []),
        { name: "kg_per_head_day", label: "Quantidade por cabeça/dia (kg)", type: "number", min: "0.001", step: "0.001", required: true },
        { name: "start_date", label: "Início", type: "date", required: true }, { name: "end_date", label: "Fim (opcional)", type: "date" },
        { name: "is_active", label: "Situação", type: "select", required: true, options: [{ value: "true", label: "Ativo" }, { value: "false", label: "Encerrado" }] },
        { name: "notes", label: "Orientações do responsável", type: "textarea" },
      ], save: values => { const payload = { ...values, end_date: values.end_date || null, is_active: values.is_active === "true" }; return row ? cattleService.update("feed-plans", row.id, payload) : cattleService.create("feed-plans", payload); } });
    } catch (error) { setError(cattleError(error)); } finally { setPreparing(false); }
  }
  function supply(row: CattleFeedPlan) {
    const requestKey = crypto.randomUUID();
    setForm({ title: `Fornecer · ${row.batch_code}`, description: `${row.item_name}. A quantidade fornecida sairá do almoxarifado para o cocho. Não registre novamente essa saída como consumo do estoque.`, fields: [
      { name: "quantity_kg", label: "Quantidade fornecida hoje (kg)", type: "number", required: true, min: "0.01", step: "0.01" },
      { name: "remaining_before_kg", label: "Saldo deste produto já no cocho, conferido antes (kg)", type: "number", required: true, min: "0", step: "0.01" },
      { name: "notes", label: "Conferência / observações", type: "textarea", maxLength: 1000 },
    ], submitLabel: "Confirmar fornecimento", save: values => cattleService.deliver(row.id, { ...values, date: today(), request_key: requestKey }) });
  }
  return <section className={styles.panel}>
    <div className="d-flex flex-wrap justify-content-between gap-3"><div><h2>Planejamento e fornecimento</h2><p className={styles.muted}>Estimativa diária por lote. O saldo do cocho é estimado a partir da conferência e do último fornecimento; não representa consumo medido.</p></div>{canWrite && <button disabled={preparing} className="btn btn-success btn-sm align-self-start" onClick={() => plan()}>Novo plano</button>}</div>
    <label className="small mb-3">Planos<select className="form-select form-select-sm" value={active} onChange={event => { setActive(event.target.value); setPage(1); setLoading(true); }}><option value="true">Ativos</option><option value="false">Encerrados</option><option value="">Todos</option></select></label>
    {error && <p className="alert alert-danger" role="alert">{error}</p>}
    {loading ? <p role="status">Carregando planos…</p> : <div className="table-responsive"><table className={styles.table}><thead><tr><th>Lote / produto</th><th>Planejamento</th><th>Previsão do cocho</th><th>Ações</th></tr></thead><tbody>
      {data?.results.map(row => <tr key={row.id}><td><strong>{row.batch_code}</strong><small>{row.farm_name}</small><small>{row.item_name}</small></td>
        <td>{number(row.kg_per_head_day)} kg/cab/dia<small>{number(row.forecast.daily_requirement_kg)} kg/dia no efetivo atual</small><small>{date(row.start_date)} a {date(row.end_date)}</small></td>
        <td><span className={styles.status}>{cattleNutritionStatuses[row.forecast.status] || row.forecast.status}</span><small>Último fornecimento: {date(row.forecast.last_supply_date)}</small><small>Saldo estimado: {number(row.forecast.estimated_remaining_kg)} kg</small><small>Cobertura estimada: {number(row.forecast.days_covered)} dias · reposição: {date(row.forecast.next_supply_date)}</small>{row.forecast.status === "review" && <small className="text-warning">O efetivo ou a quantidade diária mudou. Confira o cocho no próximo fornecimento.</small>}</td>
        <td><div className={styles.actions}>{canWrite && <button className="btn btn-outline-secondary btn-sm" disabled={preparing} onClick={() => plan(row)}>Editar plano</button>}{canWrite && row.is_active && !["inactive", "scheduled"].includes(row.forecast.status) && <button className="btn btn-outline-success btn-sm" onClick={() => supply(row)}>Fornecer hoje</button>}<button className="btn btn-outline-secondary btn-sm" onClick={() => setHistory(row)}>Histórico</button></div></td>
      </tr>)}{!data?.count && <tr><td colSpan={4}>Nenhum plano neste filtro.</td></tr>}
    </tbody></table></div>}
    <div className={styles.pagination}><span>{data?.count || 0} planos · página {page}</span><button className="btn btn-outline-secondary btn-sm" disabled={page === 1 || loading} onClick={() => { setPage(page - 1); setLoading(true); }}>Anterior</button><button className="btn btn-outline-secondary btn-sm" disabled={!data?.next || loading} onClick={() => { setPage(page + 1); setLoading(true); }}>Próxima</button></div>
    {form && <CattleForm spec={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); setRefresh(value => value + 1); setLoading(true); onChanged(); }} />}
    {history && <DeliveryHistory plan={history} onClose={() => setHistory(null)} />}
  </section>;
}
