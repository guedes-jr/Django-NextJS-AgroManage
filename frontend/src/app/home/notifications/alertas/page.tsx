"use client";
import { useOrganizationLocale } from "@/lib/locale";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Check, RefreshCw } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { getSystemAlerts, alertSegments, type SystemAlert } from "@/services/operationalAlertService";
import { acknowledgeOperationalAlert } from "@/services/livestockService";
import { filterAlerts } from "@/services/operationalAlertPresentation";
import useNotifications from "@/hooks/useNotifications";



export default function AlertsPage() {
  const { language, t } = useOrganizationLocale();
  const levels = { danger: { label: t("notifications.priority.urgent"), variant: "red" }, warning: { label: t("dashboard.attention"), variant: "amber" }, info: { label: t("workspace.information"), variant: "blue" }, success: { label: t("workspace.completed"), variant: "green" } };
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("all");
  const [level, setLevel] = useState("all");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [confirming, setConfirming] = useState(false);
  const { fetchOperationalAlerts } = useNotifications();
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { setAlerts(await getSystemAlerts()); }
    catch { setError(t("workspace.couldNotLoadAlertsTryRefreshingAgain")); }
    finally { setLoading(false); }
  }, [t]);
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, [refresh]);
  const invalidPeriod = !!start && !!end && start > end;
  const filtered = filterAlerts(alerts, { search, segment, level, start, end });
  return <div className="p-3 p-md-4">
    <header className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
      <div><h1 className="h3 fw-bold d-flex gap-2 align-items-center"><BellRing size={24}/>  {t("reproduction.alerts")}</h1><p className="text-muted-foreground mb-0">{t("workspace.monitorPendingAlertsAndAcknowledgeThoseAlreadyHandled")}</p></div>
      <button className="btn btn-outline-secondary d-flex gap-2 align-items-center" disabled={loading} onClick={() => void refresh()}><RefreshCw size={16}/>  {t("inventory.alerts.refresh")}</button>
    </header>
    <div className="dashboard-card p-3 mb-3 d-flex flex-wrap gap-3 align-items-end">
      <label className="small">{t("workspace.scheduledStartDate")}<input className="form-control mt-1" type="date" value={start} onChange={event => setStart(event.target.value)}/></label>
      <label className="small">{t("workspace.scheduledEndDate")}<input className="form-control mt-1" type="date" value={end} onChange={event => setEnd(event.target.value)}/></label>
      <button className="btn btn-outline-secondary" onClick={() => { setStart(""); setEnd(""); setSearch(""); setSegment("all"); setLevel("all"); }}>{t("workspace.clearFilters")}</button>
      <span className="small text-muted-foreground">{t("workspace.newestByScheduledDateUndatedAlertsAppearLast")}</span>
    </div>
    {invalidPeriod && <p role="alert" className="text-danger">{t("workspace.theEndDateMustBeOnOrAfterTheStart")}</p>}
    {error && <div role="alert" className="alert alert-danger">{error}</div>}
    {loading && <p role="status">{t("workspace.loadingAlerts")}</p>}
    <DataTable<SystemAlert> rows={filtered} rowKey="id" title={`${filtered.length} alertas`} searchValue={search} onSearchChange={setSearch} searchPlaceholder={t("inventory.alerts.search")}
      columns={[{ key: "text", label: t("workspace.alert") }, { key: "species", label: t("workspace.segment"), render: value => alertSegments[String(value)] || String(value) }, { key: "due_date", label: t("workspace.scheduledDate"), render: value => value ? new Date(`${String(value).slice(0,10)}T12:00:00`).toLocaleDateString(language) : "Sem data" }, { key: "time", label: t("workspace.deadline") }]}
      statusKey="type" statusMap={levels} filters={[
        { key: "species", label: t("workspace.allSegments"), value: segment, onChange: setSegment, options: Object.entries(alertSegments).map(([value, label]) => ({ value, label })) },
        { key: "type", label: t("workspace.allLevels"), value: level, onChange: setLevel, options: Object.entries(levels).map(([value, item]) => ({ value, label: item.label })) },
      ]} emptyText={loading ? t("inventory.adjustment.loading") : "Nenhum alerta encontrado para os filtros selecionados."}
      actions={[{ label: t("swine.insights.confirmAlertAria"), icon: <Check size={16}/>, shouldShow: row => !!row.alert_key && !confirming && !loading, onClick: async row => {
        if (!row.alert_key || confirming) return;
        setConfirming(true); setError("");
        try { await acknowledgeOperationalAlert(row.alert_key, row.text, row.species); setAlerts(current => current.filter(item => item.id !== row.id)); await fetchOperationalAlerts(); }
        catch { setError(t("notifications.confirmAlertFailed")); }
        finally { setConfirming(false); }
      } }]}/>
  </div>;
}
