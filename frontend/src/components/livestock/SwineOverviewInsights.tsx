"use client";

import Link from "next/link";
import { newestAlerts, ALERTS_PAGE, ALERT_PREVIEW_LIMIT } from "@/services/operationalAlertPresentation";
import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BellRing, CalendarDays, CheckCircle2, ChevronRight, Loader2, Sparkles, Syringe } from "lucide-react";
import { acknowledgeOperationalAlert, getReproductionDashboard } from "@/services/livestockService";
import useNotifications from "@/hooks/useNotifications";
import { type TranslationKey, useOrganizationLocale } from "@/lib/locale";
import styles from "./swine-overview-insights.module.css";

type AlertItem = { alert_key?: string; text?: string; time?: string; type?: string };
type SuggestionItem = { alert_key?: string; text?: string };
type ReproductionOverview = {
  kpis?: { aguardando_cobertura?: number; gestantes?: number };
  alerts?: AlertItem[];
  aiSuggestions?: SuggestionItem[];
};

export function SwineOverviewInsights() {
  const { t } = useOrganizationLocale();
  const { operationalAlerts, confirmOperationalAlert } = useNotifications();
  const [error, setError] = useState("");
  const [data, setData] = useState<ReproductionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getReproductionDashboard("suinos")
      .then((response) => { if (active) setData(response as ReproductionOverview); })
      .catch(() => { if (active) setData({}); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const upcomingEvents = useMemo<Array<{ icon: string; title: TranslationKey; detail: string; tone: string }>>(() => [
    { icon: "🔄", title: "swine.insights.coverages", detail: t("swine.insights.waitingFemales", { count: data?.kpis?.aguardando_cobertura ?? 0 }), tone: "blue" },
    { icon: "🤰", title: "swine.insights.pregnancy", detail: t("swine.insights.pregnantFemales", { count: data?.kpis?.gestantes ?? 0 }), tone: "amber" },
    { icon: "🍼", title: "swine.insights.birthsWeaning", detail: t("swine.insights.upcomingDeadlines"), tone: "green" },
  ], [data, t]);
  const dailyActivities: Array<{ text: TranslationKey; sector: TranslationKey }> = [
    { text: "swine.insights.checkHeat", sector: "swine.insights.gilts" },
    { text: "swine.insights.nearBirth", sector: "swine.insights.gestation" },
    { text: "swine.insights.pigletsWeaning", sector: "swine.insights.maternity" },
    { text: "swine.insights.nursery", sector: "swine.insights.nurserySector" },
  ];
  const alerts = newestAlerts(operationalAlerts);
  const suggestions = data?.aiSuggestions || [];

  const confirmAlert = async (item: AlertItem | SuggestionItem) => {
    if (!item.alert_key || confirming) return;
    setConfirming(item.alert_key);
    try {
      setError("");
      if (alerts.some(alert => alert.alert_key === item.alert_key)) {
        await confirmOperationalAlert({ alert_key: item.alert_key, text: item.text || "" });
      } else {
        await acknowledgeOperationalAlert(item.alert_key, item.text || "");
      }
      setData((current) => current ? {
        ...current,
        alerts: (current.alerts || []).filter((alert) => alert.alert_key !== item.alert_key),
        aiSuggestions: (current.aiSuggestions || []).filter((suggestion) => suggestion.alert_key !== item.alert_key),
      } : current);
    } catch {
      setError(t("swine.insights.alertFailed"));
    } finally {
      setConfirming(null);
    }
  };

  return (
    <section className={styles.section} aria-labelledby="swine-attention-title">
      <div className={styles.heading}><div><span>{t("swine.insights.heading")}</span><h2 id="swine-attention-title">{t("swine.insights.title")}</h2></div><p>{t("swine.insights.description")}</p></div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {loading ? <div className={styles.loading}><Loader2 size={20} /> {t("swine.insights.loading")}</div> : (
        <div className={styles.grid}>
          <article className={styles.card}>
            <header><span><CalendarDays size={19}/> {t("swine.insights.upcoming")}</span></header>
            <div className={styles.list}>{upcomingEvents.map((event) => <div className={styles.event} data-tone={event.tone} key={event.title}><b>{event.icon}</b><div><strong>{t(event.title)}</strong><small>{event.detail}</small></div><ChevronRight size={16}/></div>)}</div>
          </article>
          <article className={styles.card}>
            <header><span><Activity size={19}/> {t("swine.insights.todayActivities")}</span></header>
            <div className={styles.list}>{dailyActivities.map((task) => <div className={styles.task} key={task.text}><CheckCircle2 size={18}/><div><strong>{t(task.text)}</strong><small>{t("swine.insights.sector", { sector: t(task.sector) })}</small></div><em>{t("swine.insights.pending")}</em></div>)}</div>
          </article>
          <article className={styles.card}>
            <header><span><BellRing size={19}/> {t("swine.insights.alerts")} <i>{alerts.length + suggestions.length}</i></span></header>
            <div className={styles.list}>
              {alerts.slice(0, ALERT_PREVIEW_LIMIT).map((alert, index) => <div className={styles.alert} data-danger={alert.type === "danger"} key={alert.alert_key || `${alert.text}-${index}`}><AlertTriangle size={20}/><div><strong>{alert.text}</strong><small>{alert.time || t("swine.insights.attentionRequired")}</small></div><button className="btn btn-sm border-0 p-1" style={{ color: "inherit", fontSize: "1.05rem" }} disabled={!alert.alert_key || confirming === alert.alert_key} onClick={() => void confirmAlert(alert)} title={t("swine.insights.confirmAlertTitle")} aria-label={t("swine.insights.confirmAlertAria")}><span aria-hidden="true">🆗</span></button></div>)}
              {!alerts.length && !suggestions.length && <div className={styles.clear}><Sparkles size={23}/><div><strong>{t("swine.insights.allClear")}</strong><small>{t("swine.insights.noCriticalAlerts")}</small></div></div>}
              {suggestions.slice(0, Math.max(0, ALERT_PREVIEW_LIMIT - alerts.length)).map((item, index) => <div className={styles.suggestion} key={item.alert_key || index}><Syringe size={20}/><div><strong>{item.text}</strong><small>{t("swine.insights.suggestion")}</small></div><button className="btn btn-sm border-0 p-1" style={{ color: "inherit", fontSize: "1.05rem" }} disabled={!item.alert_key || confirming === item.alert_key} onClick={() => void confirmAlert(item)} title={t("swine.insights.confirmSuggestionTitle")} aria-label={t("swine.insights.confirmSuggestionAria")}><span aria-hidden="true">🆗</span></button></div>)}
            </div>
            <Link href={ALERTS_PAGE} className="d-inline-block p-3 small fw-semibold">{t("swine.insights.viewAllAlerts")}</Link>
          </article>
        </div>
      )}
    </section>
  );
}
