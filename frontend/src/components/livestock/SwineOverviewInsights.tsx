"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BellRing, CalendarDays, CheckCircle2, ChevronRight, Loader2, Sparkles, Syringe } from "lucide-react";
import { acknowledgeOperationalAlert, getReproductionDashboard } from "@/services/livestockService";
import styles from "./swine-overview-insights.module.css";

type AlertItem = { alert_key?: string; text?: string; time?: string; type?: string };
type SuggestionItem = { alert_key?: string; text?: string };
type ReproductionOverview = {
  kpis?: { aguardando_cobertura?: number; gestantes?: number };
  alerts?: AlertItem[];
  aiSuggestions?: SuggestionItem[];
};

export function SwineOverviewInsights() {
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

  const upcomingEvents = useMemo(() => [
    { icon: "🔄", title: "Coberturas previstas", detail: `${data?.kpis?.aguardando_cobertura ?? 0} matrizes aguardando`, tone: "blue" },
    { icon: "🤰", title: "Gestação em acompanhamento", detail: `${data?.kpis?.gestantes ?? 0} matrizes gestantes`, tone: "amber" },
    { icon: "🍼", title: "Partos e desmames", detail: "Confira os próximos prazos", tone: "green" },
  ], [data]);
  const dailyActivities = [
    { text: "Verificar matrizes em cio", sector: "Marrãs" },
    { text: "Acompanhar matrizes próximas ao parto", sector: "Gestação" },
    { text: "Revisar leitões e desmames programados", sector: "Maternidade" },
    { text: "Conferir lotes na creche", sector: "Creche" },
  ];
  const alerts = data?.alerts || [];
  const suggestions = data?.aiSuggestions || [];

  const confirmAlert = async (item: AlertItem | SuggestionItem) => {
    if (!item.alert_key || confirming) return;
    setConfirming(item.alert_key);
    try {
      await acknowledgeOperationalAlert(item.alert_key, item.text || "");
      setData((current) => current ? {
        ...current,
        alerts: (current.alerts || []).filter((alert) => alert.alert_key !== item.alert_key),
        aiSuggestions: (current.aiSuggestions || []).filter((suggestion) => suggestion.alert_key !== item.alert_key),
      } : current);
    } finally {
      setConfirming(null);
    }
  };

  return (
    <section className={styles.section} aria-labelledby="swine-attention-title">
      <div className={styles.heading}><div><span>Acompanhamento</span><h2 id="swine-attention-title">Agenda, atividades e alertas</h2></div><p>Informações prioritárias do manejo reprodutivo.</p></div>
      {loading ? <div className={styles.loading}><Loader2 size={20} /> Atualizando acompanhamento...</div> : (
        <div className={styles.grid}>
          <article className={styles.card}>
            <header><span><CalendarDays size={19}/> Próximos eventos</span></header>
            <div className={styles.list}>{upcomingEvents.map((event) => <div className={styles.event} data-tone={event.tone} key={event.title}><b>{event.icon}</b><div><strong>{event.title}</strong><small>{event.detail}</small></div><ChevronRight size={16}/></div>)}</div>
          </article>
          <article className={styles.card}>
            <header><span><Activity size={19}/> Atividades de hoje</span></header>
            <div className={styles.list}>{dailyActivities.map((task) => <div className={styles.task} key={task.text}><CheckCircle2 size={18}/><div><strong>{task.text}</strong><small>Setor de {task.sector}</small></div><em>Pendente</em></div>)}</div>
          </article>
          <article className={styles.card}>
            <header><span><BellRing size={19}/> Alertas do sistema <i>{alerts.length + suggestions.length}</i></span></header>
            <div className={styles.list}>
              {alerts.map((alert, index) => <div className={styles.alert} data-danger={alert.type === "danger"} key={alert.alert_key || `${alert.text}-${index}`}><AlertTriangle size={20}/><div><strong>{alert.text}</strong><small>{alert.time || "Requer atenção"}</small></div><button className="btn btn-sm border-0 p-1" style={{ color: "inherit", fontSize: "1.05rem" }} disabled={!alert.alert_key || confirming === alert.alert_key} onClick={() => void confirmAlert(alert)} title="Confirmar que este alerta foi tratado" aria-label="Confirmar alerta tratado"><span aria-hidden="true">🆗</span></button></div>)}
              {!alerts.length && !suggestions.length && <div className={styles.clear}><Sparkles size={23}/><div><strong>Tudo sob controle</strong><small>Nenhum alerta crítico neste momento.</small></div></div>}
              {suggestions.slice(0, 1).map((item, index) => <div className={styles.suggestion} key={item.alert_key || index}><Syringe size={20}/><div><strong>{item.text}</strong><small>Sugestão do sistema</small></div><button className="btn btn-sm border-0 p-1" style={{ color: "inherit", fontSize: "1.05rem" }} disabled={!item.alert_key || confirming === item.alert_key} onClick={() => void confirmAlert(item)} title="Confirmar que esta orientação foi atendida" aria-label="Confirmar orientação atendida"><span aria-hidden="true">🆗</span></button></div>)}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
