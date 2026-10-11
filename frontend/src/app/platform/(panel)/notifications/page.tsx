"use client";

import { useEffect, useState } from "react";
import { Bell, Save, RefreshCw } from "lucide-react";
import { platformNotificationService, type CategoryPolicy, type NotificationHistory } from "@/services/platformNotificationService";
import NotificationMetricsPanel from "@/components/platform/NotificationMetricsPanel";
import { memberError } from "@/services/memberService";

const channelLabels: Record<string, string> = { email: "E-mail", web_push: "Push", whatsapp_web: "WhatsApp" };
const deliveryLabels: Record<string, string> = { pending: "Pendente", sent: "Enviada", failed: "Falhou", skipped: "Suspensa", unknown: "Resultado incerto" };

export default function PlatformNotificationsPage() {
  const [policies, setPolicies] = useState<CategoryPolicy[]>([]);
  const [history, setHistory] = useState<NotificationHistory | null>(null);
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    platformNotificationService.categories().then(rows => { if (active) setPolicies(rows); }).catch(failure => { if (active) setError(memberError(failure, "Não foi possível carregar as categorias.")); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);
  useEffect(() => {
    let active = true;
    platformNotificationService.history(category, page).then(rows => { if (active) setHistory(rows); }).catch(failure => { if (active) { setHistory(null); setError(memberError(failure, "Não foi possível carregar o histórico.")); } }).finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [category, page, refresh]);
  const edit = (key: string, field: "enabled" | "in_app_enabled" | "email_enabled" | "push_enabled" | "whatsapp_enabled", value: boolean) => {
    setPolicies(rows => rows.map(row => row.category === key ? { ...row, [field]: value } : row));
  };
  const save = async (row: CategoryPolicy) => {
    setSaving(row.category); setError(""); setNotice("");
    try {
      const updated = await platformNotificationService.update(row.category, { enabled: row.enabled, in_app_enabled: row.in_app_enabled, email_enabled: row.email_enabled, push_enabled: row.push_enabled, whatsapp_enabled: row.whatsapp_enabled, repeat_cooldown_minutes: row.repeat_cooldown_minutes, group_similar_minutes: row.group_similar_minutes, max_per_day: row.max_per_day });
      setPolicies(rows => rows.map(item => item.category === row.category ? { ...item, ...updated } : item));
      setNotice(`Configuração de “${row.label}” salva para todas as organizações.`);
    } catch (failure) { setError(memberError(failure, "Não foi possível salvar a categoria.")); }
    finally { setSaving(null); }
  };
  return <div>
    <header className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
      <div><span className="platform-kicker">Comunicação</span><h1 className="platform-title"><Bell size={26} className="me-2" />Notificações</h1><p className="text-muted mb-0">Categorias, canais de envio e histórico da plataforma.</p></div>
      <button className="btn btn-outline-secondary" disabled={loading || historyLoading || saving !== null} onClick={() => { setLoading(true); setHistoryLoading(true); setError(""); setRefresh(value => value + 1); }}><RefreshCw size={16} className="me-2" />Atualizar</button>
    </header>
    {error && <div role="alert" className="alert alert-danger">{error}</div>}
    {notice && <div role="status" className="alert alert-success">{notice}</div>}
    <NotificationMetricsPanel policies={policies} refresh={refresh}/>
    <div className="platform-card p-4 mb-4"><h2 className="h5 fw-bold">Regras por categoria</h2><p className="text-muted small">Estas regras valem para todas as organizações e respeitam a adesão, as preferências e as permissões de cada usuário. Desativar uma categoria suspende novos avisos e entregas pendentes; o histórico é preservado.</p>
      {loading ? <p role="status">Carregando categorias…</p> : <div className="row g-3">{policies.map(row => <section className="col-12 col-md-6" key={row.category}><fieldset disabled={saving !== null} className="border rounded-3 p-3 h-100">
        <legend className="float-none w-auto px-1 h6 fw-bold">{row.label}</legend><p className="text-muted small">{row.count} registro(s) no histórico</p>
        <label className="form-check mb-3"><input type="checkbox" className="form-check-input" checked={row.enabled} onChange={event => edit(row.category, "enabled", event.target.checked)} /><strong>Categoria ativa</strong></label>
        <div className="d-flex flex-wrap gap-3 mb-3">{([['in_app_enabled', 'No sistema'], ['email_enabled', 'E-mail'], ['push_enabled', 'Push'], ['whatsapp_enabled', 'WhatsApp']] as const).map(([field, label]) => <label className="form-check" key={field}><input type="checkbox" className="form-check-input" checked={row[field]} disabled={!row.enabled || (field === "whatsapp_enabled" && !["animal_cycle", "marketing"].includes(row.category))} onChange={event => edit(row.category, field, event.target.checked)} />{label}</label>)}</div>
        {row.category === "animal_cycle" && <p className="small text-muted">WhatsApp: vacinas reprodutivas e próxima cobertura, para destinatários autorizados.</p>}
        {row.category === "marketing" && <p className="small text-muted">Propagandas exigem adesão específica do usuário.</p>}
        <div className="row g-2 mb-3">{([['repeat_cooldown_minutes','Intervalo para repetir (min)',10080],['group_similar_minutes','Agrupar por (min)',60],['max_per_day','Limite diário por usuário',5000]] as const).map(([field,label,max]) => <label className="col-12 col-lg-4 small" key={field}>{label}<input type="number" min={0} max={max} className="form-control form-control-sm mt-1" value={row[field]} onChange={event => setPolicies(rows => rows.map(item => item.category === row.category ? {...item,[field]: Math.max(0,Math.min(max,Number(event.target.value)))} : item))}/></label>)}</div><p className="small text-muted">Agrupamento 0: imediato. Limite 0: sem limite. Um mesmo evento identificado mantém um único registro, inclusive quando arquivado.</p>
        <button type="button" className="btn btn-success btn-sm" onClick={() => void save(row)}><Save size={15} className="me-2" />{saving === row.category ? "Salvando…" : "Salvar categoria"}</button>
      </fieldset></section>)}</div>}
    </div>
    <section className="platform-card p-4"><div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3"><h2 className="h5 fw-bold mb-0">Histórico de notificações</h2><label className="small">Categoria<select className="form-select form-select-sm mt-1" value={category} onChange={event => { setCategory(event.target.value); setPage(1); setHistoryLoading(true); setHistory(null); }}><option value="">Todas as categorias</option>{policies.map(row => <option key={row.category} value={row.category}>{row.label}</option>)}</select></label></div>
      {historyLoading ? <p role="status">Carregando histórico…</p> : !history?.results.length ? <p className="text-muted">Nenhuma notificação encontrada.</p> : <div className="table-responsive"><table className="table align-middle"><thead><tr><th>Notificação</th><th>Categoria</th><th>Destinatário</th><th>Organização</th><th>Data</th><th>Envios</th><th>Estado</th></tr></thead><tbody>{history.results.map(row => <tr key={row.id}><td>{row.title}</td><td><span className="badge bg-success-subtle text-success">{row.category_display}</span></td><td>{row.recipient}</td><td>{row.organization}</td><td>{new Date(row.created_at).toLocaleString("pt-BR")}</td><td>{row.deliveries.length ? row.deliveries.map(delivery => <small className="d-block" key={delivery.channel}>{channelLabels[delivery.channel] || delivery.channel} · {deliveryLabels[delivery.status] || delivery.status}</small>) : "—"}</td><td>{!row.show_in_app ? "Canais externos" : row.is_archived ? "Arquivada" : row.is_read ? "Lida" : "Não lida"}</td></tr>)}</tbody></table></div>}
      <div className="d-flex justify-content-between align-items-center gap-2"><small className="text-muted">{history?.count ?? 0} registro(s) · Página {page}</small><div className="d-flex gap-2"><button className="btn btn-outline-secondary btn-sm" disabled={historyLoading || !history?.previous} onClick={() => { setPage(value => value - 1); setHistoryLoading(true); }}>Anterior</button><button className="btn btn-outline-secondary btn-sm" disabled={historyLoading || !history?.next} onClick={() => { setPage(value => value + 1); setHistoryLoading(true); }}>Próxima</button></div></div>
    </section>
  </div>;
}
