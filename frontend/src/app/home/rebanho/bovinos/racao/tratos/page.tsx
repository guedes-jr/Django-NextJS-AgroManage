"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";
import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";
import { Modal } from "@/components/ui/Modal";
import { cattleError, cattleNutritionStatuses } from "@/services/cattleService";
import { cattleDailyFeedingService, type DailyFeeding, type DailyFeedRow } from "@/services/cattleDailyFeedingService";
import styles from "@/components/cattle/cattle.module.css";

const number = (value: unknown) => value === null ? "—" : Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export default function DailyFeedingPage() {
  const access = useOrganizationAccess();
  const [data, setData] = useState<DailyFeeding | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<DailyFeedRow | null>(null);
  const [values, setValues] = useState({ quantity_kg: "", remaining_before_kg: "", notes: "", request_key: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    cattleDailyFeedingService.get(controller.signal).then(result => {
      if (!controller.signal.aborted) { setData(result); setError(""); }
    }).catch(error => { if (!controller.signal.aborted) setError(cattleError(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  function reload() { setLoading(true); setRefresh(value => value + 1); }
  function open(row: DailyFeedRow) {
    setSelected(row); setFormError(""); setSuccess("");
    setValues({ quantity_kg: "", remaining_before_kg: "", notes: "", request_key: crypto.randomUUID() });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !data || saving || access?.read_only) return;
    setSaving(true); setFormError("");
    try {
      await cattleDailyFeedingService.supply({ ...values, plan: selected.id, date: data.date });
      setSelected(null); setSuccess("Fornecimento registrado e estoque movimentado."); reload();
    } catch (error) { setFormError(cattleError(error)); }
    finally { setSaving(false); }
  }
  const rows = data?.results.filter(row =>
    `${row.farm_name} ${row.batch_code} ${row.pasture || ""} ${row.item_name}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))
    && (status === "all" || (status === "recorded" ? row.deliveries.length > 0 : row.deliveries.length === 0))) || [];
  return <div className={styles.page}>
    <header className={styles.header}><div>
      {access?.role !== "feeder" && <Link href="/home/rebanho/bovinos/racao" className="small">Bovinos / Alimentação</Link>}
      <h1>Tratos de hoje</h1><p className={styles.muted}>{data ? new Date(`${data.date}T12:00:00`).toLocaleDateString("pt-BR") : "Rotina alimentar"} · Planejamento e execução por lote e pasto.</p>
    </div><button type="button" className="btn btn-outline-secondary btn-sm" onClick={reload} disabled={loading}><RefreshCw size={16} className="me-2"/>Atualizar</button></header>
    {success && <p className="alert alert-success" role="status">{success}</p>}
    {error && <p className="alert alert-danger" role="alert">{error}</p>}
    <section className={styles.panel}>
      <div className="row g-2 mb-3"><div className="col-12 col-md-8"><label className="small" htmlFor="feed-search">Buscar fazenda, lote, pasto ou produto</label><input id="feed-search" className="form-control" value={search} onChange={event => setSearch(event.target.value)}/></div><div className="col-12 col-md-4"><label className="small" htmlFor="feed-status">Fornecimentos de hoje</label><select id="feed-status" className="form-select" value={status} onChange={event => setStatus(event.target.value)}><option value="all">Todos</option><option value="pending">Sem registro hoje</option><option value="recorded">Com registro hoje</option></select></div></div>
      <p className="small text-muted-foreground">A meta diária usa o efetivo atual. Fornecimento e sobra no cocho não representam consumo medido. Um lote pode estar abastecido por fornecimentos anteriores.</p>
      {loading ? <p role="status">Carregando tratos…</p> : !error && <>
        <p className="small">{rows.length} planos · {rows.filter(row => row.deliveries.length > 0).length} com fornecimento hoje</p>
        <div className="table-responsive"><table className={styles.table}><thead><tr><th>Lote / local</th><th>Produto / meta</th><th>Realizado hoje</th><th>Cocho estimado</th><th>Ação</th></tr></thead><tbody>
          {rows.map(row => <tr key={row.id}><td><strong>{row.batch_code}</strong><small>{row.farm_name} · {row.pasture || "Sem pasto vinculado"}</small><small>{row.head_count} cabeças</small></td><td><strong title={row.item_name}>{row.item_name.length > 30 ? `${row.item_name.slice(0, 30)}...` : row.item_name}</strong><small>{number(row.daily_requirement_kg)} kg/dia · {number(row.kg_per_head_day)} kg/cabeça</small></td><td><strong>{number(row.supplied_kg)} kg</strong><small>{row.deliveries.length} lançamentos</small>{row.deliveries.map(delivery => <small key={delivery.id} title={delivery.notes}>{new Date(delivery.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {number(delivery.quantity_kg)} kg · {delivery.recorded_by}</small>)}</td><td><span className={styles.status}>{cattleNutritionStatuses[row.forecast.status] || row.forecast.status}</span><small>{number(row.forecast.estimated_remaining_kg)} kg</small></td><td><button type="button" className="btn btn-outline-success btn-sm" disabled={access?.read_only || !["admin", "manager", "feeder"].includes(access?.role || "") || row.head_count < 1} onClick={() => open(row)}>Registrar trato</button></td></tr>)}
          {!rows.length && <tr><td colSpan={5}>Nenhum plano vigente encontrado. O gerente ou administrador pode cadastrar planos na alimentação bovina.</td></tr>}
        </tbody></table></div>
      </>}
    </section>
    <Modal isOpen={!!selected} onClose={() => { if (!saving) setSelected(null); }} title={`Registrar trato · ${selected?.batch_code || ""}`} description={selected?.item_name}>
      <form onSubmit={submit} className="d-grid gap-3">
        {formError && <p className="alert alert-danger" role="alert">{formError}</p>}
        <p className="small mb-0">Confira a sobra física antes do fornecimento. A quantidade fornecida será baixada do estoque por lançamento.</p>
        <label>Sobra conferida no cocho (kg)<input className="form-control" type="number" min="0" step="0.01" required disabled={saving} value={values.remaining_before_kg} onChange={event => setValues({ ...values, remaining_before_kg: event.target.value })}/></label>
        <label>Quantidade fornecida (kg)<input className="form-control" type="number" min="0.01" step="0.01" required disabled={saving} value={values.quantity_kg} onChange={event => setValues({ ...values, quantity_kg: event.target.value })}/></label>
        <label>Observação<textarea className="form-control" maxLength={1000} disabled={saving} value={values.notes} onChange={event => setValues({ ...values, notes: event.target.value })}/></label>
        <button type="submit" className="btn btn-success" disabled={saving || access?.read_only}>{saving ? "Registrando…" : "Confirmar fornecimento"}</button>
      </form>
    </Modal>
  </div>;
}
