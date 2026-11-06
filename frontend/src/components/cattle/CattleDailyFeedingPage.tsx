"use client";
import { useOrganizationLocale } from "@/lib/locale";

import Link from "next/link";
import { useCattleSegment } from "@/components/cattle/CattleSegmentContext";
import { cattleHref } from "@/services/cattleNavigation";
import { useEffect, useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";
import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";
import { Modal } from "@/components/ui/Modal";
import { cattleError } from "@/services/cattleService";
import { cattleDailyFeedingService, type DailyFeeding, type DailyFeedRow } from "@/services/cattleDailyFeedingService";
import styles from "@/components/cattle/cattle.module.css";

const number = (value: unknown, language = "pt-BR") => value === null ? "—" : Number(value).toLocaleString(language, { maximumFractionDigits: 2 });

export default function DailyFeedingPage() {
  const { language, t } = useOrganizationLocale();
  const segment = useCattleSegment() || "beef";
  const access = useOrganizationAccess();
  const [data, setData] = useState<DailyFeeding | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<DailyFeedRow | null>(null);
  const [values, setValues] = useState({ quantity_kg: "", formula: "", item: "", notes: "", request_key: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    cattleDailyFeedingService.get(controller.signal).then(result => {
      if (!controller.signal.aborted) { setData(result); setError(""); }
    }).catch(error => { if (!controller.signal.aborted) setError(cattleError(error, language)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh, language]);
  function reload() { setLoading(true); setRefresh(value => value + 1); }
  function open(row: DailyFeedRow) {
    setSelected(row); setFormError(""); setSuccess("");
    setValues({ quantity_kg: "", formula: "", item: "", notes: "", request_key: crypto.randomUUID() });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !data || saving || access?.read_only) return;
    setSaving(true); setFormError("");
    try {
      await cattleDailyFeedingService.supply({ ...values, formula: values.formula || null, item: values.item || null, batch: selected.id, date: data.date });
      setSelected(null); setSuccess("Fornecimento registrado e estoque movimentado."); reload();
    } catch (error) { setFormError(cattleError(error, language)); }
    finally { setSaving(false); }
  }
  const rows = data?.results.filter(row =>
    `${row.farm_name} ${row.batch_code} ${row.pasture || ""}`.toLocaleLowerCase(language).includes(search.toLocaleLowerCase(language))
    && (status === "all" || (status === "recorded" ? row.deliveries.length > 0 : row.deliveries.length === 0))) || [];
  return <div className={styles.page}>
    <header className={styles.header}><div>
      {access?.role !== "feeder" && <Link href={cattleHref("/home/seguimento/gado-de-corte/relatorios#alimentacao", segment)} className="small">{segment === "dairy" ? t("cattleReproduction.dairy") : t("cattleReproduction.beef")} / Relatórios</Link>}
      <h1>Tratos de hoje</h1><p className={styles.muted}>{data ? new Date(`${data.date}T12:00:00`).toLocaleDateString(language) : "Rotina alimentar"} · Fornecimento por lote e pasto, usando as rações do estoque.</p>
    </div><button type="button" className="btn btn-outline-secondary btn-sm" onClick={reload} disabled={loading}><RefreshCw size={16} className="me-2"/>{t("inventory.alerts.refresh")}</button></header>
    {success && <p className="alert alert-success" role="status">{success}</p>}
    {error && <p className="alert alert-danger" role="alert">{error}</p>}
    <section className={styles.panel}>
      <div className="row g-2 mb-3"><div className="col-12 col-md-8"><label className="small" htmlFor="feed-search">Buscar fazenda, lote, pasto ou produto</label><input id="feed-search" className="form-control" value={search} onChange={event => setSearch(event.target.value)}/></div><div className="col-12 col-md-4"><label className="small" htmlFor="feed-status">Fornecimentos de hoje</label><select id="feed-status" className="form-select" value={status} onChange={event => setStatus(event.target.value)}><option value="all">{t("crops.allFields")}</option><option value="pending">Sem registro hoje</option><option value="recorded">Com registro hoje</option></select></div></div>
      <p className="small text-muted-foreground">O trato registra a ração fornecida pelo fluxo de alimentação existente. A leitura física do cocho é registrada separadamente.</p>
      {loading ? <p role="status">Carregando tratos…</p> : !error && <>
        <p className="small">{rows.length} lotes · {rows.filter(row => row.deliveries.length > 0).length} com fornecimento hoje</p>
        <div className="table-responsive"><table className={styles.table}><thead><tr><th>Lote / local</th><th>Realizado hoje</th><th>{t("settings.subscription.action")}</th></tr></thead><tbody>
          {rows.map(row => <tr key={row.id}><td><strong>{row.batch_code}</strong><small>{row.farm_name} · {row.pasture || "Sem pasto vinculado"}</small><small>{row.head_count}  {t("workspace.head")}</small></td><td><strong>{number(row.supplied_kg, language)} kg</strong><small>{row.deliveries.length} lançamentos</small>{row.deliveries.map(delivery => <small key={delivery.id} title={delivery.notes}>{new Date(delivery.created_at).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })} · {number(delivery.quantity_kg, language)} kg · {delivery.item_name} · {delivery.recorded_by}</small>)}</td><td><button type="button" className="btn btn-outline-success btn-sm" disabled={access?.read_only || !["admin", "manager", "feeder"].includes(access?.role || "") || row.head_count < 1} onClick={() => open(row)}>Registrar trato</button></td></tr>)}
          {!rows.length && <tr><td colSpan={3}>Nenhum lote bovino ativo encontrado.</td></tr>}
        </tbody></table></div>
      </>}
    </section>
    <Modal isOpen={!!selected} onClose={() => { if (!saving) setSelected(null); }} title={`Registrar trato · ${selected?.batch_code || ""}`} description="Selecione a fórmula ou a ração do estoque.">
      <form onSubmit={submit} className={`d-grid gap-3 ${styles.form}`}>
        {formError && <p className="alert alert-danger" role="alert">{formError}</p>}
        <p className="small mb-0">Informe a ração e a quantidade fornecida. O estoque será baixado pelo lançamento de alimentação; não registre esse fornecimento novamente.</p>
        <label>Fórmula (opcional)<select className="form-select" disabled={saving} value={values.formula} onChange={event => { const formula = data?.formulas.find(row => row.id === event.target.value); setValues({ ...values, formula: event.target.value, item: formula?.item_final_id || "" }); }}><option value="">{t("cattle.form.select")}</option>{data?.formulas.map(row => <option value={row.id} key={row.id}>{row.nome}</option>)}</select></label>
        <label>Ração / suplemento do estoque<select className="form-select" required disabled={saving || !!values.formula} value={values.item} onChange={event => setValues({ ...values, item: event.target.value })}><option value="">{t("cattle.form.select")}</option>{data?.products.map(row => <option value={row.id} key={row.id}>{row.nome}</option>)}</select></label>
        {values.formula && !values.item && <p className="text-warning small">Esta fórmula não tem produto final no estoque. Cadastre e produza a ração antes do fornecimento.</p>}
        <label>Quantidade fornecida (kg)<input className="form-control" type="number" min="0.01" step="0.01" required disabled={saving} value={values.quantity_kg} onChange={event => setValues({ ...values, quantity_kg: event.target.value })}/></label>
        <label>{t("reproduction.observation")}<textarea className="form-control" maxLength={1000} disabled={saving} value={values.notes} onChange={event => setValues({ ...values, notes: event.target.value })}/></label>
        <button type="submit" className="btn btn-success" disabled={saving || access?.read_only || !values.item}>{saving ? t("inventory.adjustment.saving") : "Confirmar fornecimento"}</button>
      </form>
    </Modal>
  </div>;
}
