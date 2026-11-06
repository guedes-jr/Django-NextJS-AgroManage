"use client";
import { useOrganizationLocale } from "@/lib/locale";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useCattleSegment } from "./CattleSegmentContext";
import { cattleHref } from "@/services/cattleNavigation";
import { cattleService, cattleError, type CattleAgendaEvent, type CattleManagement, type Page } from "@/services/cattleService";
import { CattleForm, type CattleFormSpec } from "./CattleForm";
import styles from "./cattle.module.css";

export function CattleAgenda({ farm, refresh, canWrite, manager, onAnimalAction, onChanged }: {
  farm: string; refresh: number; canWrite: boolean; manager: boolean;
  onAnimalAction: (event: CattleAgendaEvent) => void; onChanged: () => void;
}) {
  const { language, t } = useOrganizationLocale();
  const segment = useCattleSegment() || "beef";
  const [period, setPeriod] = useState("current");
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<CattleAgendaEvent> | null>(null);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<CattleFormSpec | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    cattleService.agenda({ ...(farm ? { farm } : {}), period, kind, page, page_size: 8 }, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setData(data); setError(""); } })
      .catch(error => { if (!controller.signal.aborted) setError(cattleError(error, language)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [farm, period, kind, page, refresh, language]);
  async function resolve(event: CattleAgendaEvent) {
    setPreparing(true); setError("");
    try {
      const rows = await cattleService.all<CattleManagement>("managements", { farm: event.farm, status: "confirmed", kind: "sanitary" });
      setForm({ title: t("workspace.resolveHealthFollowUp"), description: t("workspace.linkTheConfirmedExecutionThatTreatedTheAnimalsOrCancel"), initial: { status: "done" }, fields: [
        { name: "status", label: t("workspace.resolution"), type: "select", required: true, options: [{ value: "done", label: t("workspace.executed") }, { value: "cancelled", label: t("workspace.cancelForecast") }] },
        { name: "execution", label: t("workspace.completedHealthManagement"), type: "select", required: true, visibleWhen: { field: "status", value: "done" }, options: rows.filter(row => row.id !== event.source_id).map(row => ({ value: row.id, label: `${row.date} · ${row.description}` })) },
        { name: "note", label: t("workspace.reasonReview"), type: "textarea", required: true, maxLength: 500 },
      ], save: values => cattleService.action("managements", event.source_id, "resolve-follow-up", { status: values.status, note: values.note, execution: values.status === "done" ? values.execution : null }) });
    } catch (error) { setError(cattleError(error, language)); } finally { setPreparing(false); }
  }
  return <section className={styles.panel}>
    <div className={styles.sectionTitle}><div><span>{t("workspace.nextActions")}</span><h2>{t("workspace.herdAgenda")}</h2></div><Link href="/home/agenda" className="btn btn-sm btn-outline-success">{t("workspace.organizationAgendaLabel")}</Link></div>
    <div className="d-flex flex-wrap gap-2 my-3">
      <label className="small">{t("plantations.operation.period")}<select className="form-select form-select-sm" value={period} onChange={event => { setPeriod(event.target.value); setPage(1); setLoading(true); }}>
        {Object.entries({ current: "Hoje e próximos", overdue: "Atrasados", today: "Hoje", upcoming: "Futuros", all: "Todos" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="small">{t("plantations.labor.workerType")}<select className="form-select form-select-sm" value={kind} onChange={event => { setKind(event.target.value); setPage(1); setLoading(true); }}>
        {Object.entries({ all: "Todos", birth: "Partos", diagnosis: "Diagnósticos", sanitary: "Sanitários" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
    </div>
    {error && <p className="alert alert-danger" role="alert">{error}</p>}
    {loading ? <p role="status">{t("workspace.loadingAgenda")}</p> : <>
      {data?.results.map(event => <article className={styles.event} key={event.id}>
        <time>{new Date(`${event.date}T12:00:00`).toLocaleDateString(language)} · {event.period === "overdue" ? t("workspace.overdueReview") : event.period === "today" ? t("poultryReproduction.today") : t("workspace.expected")}</time>
        <strong>{event.title}</strong><p className="small mb-2">{event.farm_name}</p>
        {canWrite && event.animal && <button className="btn btn-sm btn-outline-success" onClick={() => onAnimalAction(event)}>{event.kind === "birth" ? t("cattleReproduction.registerBirth") : t("workspace.recordDiagnosis")}</button>}
        {event.kind === "sanitary" && manager && <div className={styles.actions}><Link href={cattleHref("/home/seguimento/gado-de-corte/manejos", segment)} className="btn btn-sm btn-outline-secondary">{t("workspace.openManagementOperations")}</Link>{canWrite && <button className="btn btn-sm btn-outline-success" disabled={preparing} onClick={() => resolve(event)}>{t("workspace.resolveForecast")}</button>}</div>}
      </article>)}
      {!data?.results.length && <p className={styles.empty}>{t("workspace.noActivitiesMatchThisFilterCheckOverdueActivitiesToo")}</p>}
      <div className={styles.pagination}><span>{data?.count || 0}  {t("workspace.activitiesPage")} {page}</span><button className="btn btn-sm btn-outline-secondary" disabled={page === 1} onClick={() => { setPage(page - 1); setLoading(true); }}>{t("notifications.previous")}</button><button className="btn btn-sm btn-outline-secondary" disabled={!data?.next} onClick={() => { setPage(page + 1); setLoading(true); }}>{t("notifications.next")}</button></div>
    </>}
    {form && <CattleForm spec={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); setLoading(true); onChanged(); }} />}
  </section>;
}
