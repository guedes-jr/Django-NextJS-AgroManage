"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { cattleService, cattleError, type CattleAgendaEvent, type CattleManagement, type Page } from "@/services/cattleService";
import { CattleForm, type CattleFormSpec } from "./CattleForm";
import styles from "./cattle.module.css";

export function CattleAgenda({ farm, refresh, canWrite, manager, onAnimalAction, onChanged }: {
  farm: string; refresh: number; canWrite: boolean; manager: boolean;
  onAnimalAction: (event: CattleAgendaEvent) => void; onChanged: () => void;
}) {
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
      .catch(error => { if (!controller.signal.aborted) setError(cattleError(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [farm, period, kind, page, refresh]);
  async function resolve(event: CattleAgendaEvent) {
    setPreparing(true); setError("");
    try {
      const rows = await cattleService.all<CattleManagement>("managements", { farm: event.farm, status: "confirmed", kind: "sanitary" });
      setForm({ title: "Resolver acompanhamento sanitário", description: "Vincule a execução confirmada que atendeu os animais ou cancele a previsão com uma justificativa. O histórico será preservado.", initial: { status: "done" }, fields: [
        { name: "status", label: "Resolução", type: "select", required: true, options: [{ value: "done", label: "Executado" }, { value: "cancelled", label: "Cancelar previsão" }] },
        { name: "execution", label: "Manejo sanitário executado", type: "select", required: true, visibleWhen: { field: "status", value: "done" }, options: rows.filter(row => row.id !== event.source_id).map(row => ({ value: row.id, label: `${row.date} · ${row.description}` })) },
        { name: "note", label: "Justificativa / conferência", type: "textarea", required: true, maxLength: 500 },
      ], save: values => cattleService.action("managements", event.source_id, "resolve-follow-up", { status: values.status, note: values.note, execution: values.status === "done" ? values.execution : null }) });
    } catch (error) { setError(cattleError(error)); } finally { setPreparing(false); }
  }
  return <section className={styles.panel}>
    <div className={styles.sectionTitle}><div><span>Próximas ações</span><h2>Agenda do rebanho</h2></div><Link href="/home/agenda" className="btn btn-sm btn-outline-success">Agenda geral da organização</Link></div>
    <div className="d-flex flex-wrap gap-2 my-3">
      <label className="small">Período<select className="form-select form-select-sm" value={period} onChange={event => { setPeriod(event.target.value); setPage(1); setLoading(true); }}>
        {Object.entries({ current: "Hoje e próximos", overdue: "Atrasados", today: "Hoje", upcoming: "Futuros", all: "Todos" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="small">Tipo<select className="form-select form-select-sm" value={kind} onChange={event => { setKind(event.target.value); setPage(1); setLoading(true); }}>
        {Object.entries({ all: "Todos", birth: "Partos", diagnosis: "Diagnósticos", sanitary: "Sanitários" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
    </div>
    {error && <p className="alert alert-danger" role="alert">{error}</p>}
    {loading ? <p role="status">Carregando agenda…</p> : <>
      {data?.results.map(event => <article className={styles.event} key={event.id}>
        <time>{new Date(`${event.date}T12:00:00`).toLocaleDateString("pt-BR")} · {event.period === "overdue" ? "Atrasado — conferir" : event.period === "today" ? "Hoje" : "Previsto"}</time>
        <strong>{event.title}</strong><p className="small mb-2">{event.farm_name}</p>
        {canWrite && event.animal && <button className="btn btn-sm btn-outline-success" onClick={() => onAnimalAction(event)}>{event.kind === "birth" ? "Registrar parto" : "Registrar diagnóstico"}</button>}
        {event.kind === "sanitary" && manager && <div className={styles.actions}><Link href="/home/rebanho/bovinos/manejos" className="btn btn-sm btn-outline-secondary">Abrir manejos</Link>{canWrite && <button className="btn btn-sm btn-outline-success" disabled={preparing} onClick={() => resolve(event)}>Resolver previsão</button>}</div>}
      </article>)}
      {!data?.results.length && <p className={styles.empty}>Nenhuma atividade neste filtro. Consulte também os atrasados.</p>}
      <div className={styles.pagination}><span>{data?.count || 0} atividades · página {page}</span><button className="btn btn-sm btn-outline-secondary" disabled={page === 1} onClick={() => { setPage(page - 1); setLoading(true); }}>Anterior</button><button className="btn btn-sm btn-outline-secondary" disabled={!data?.next} onClick={() => { setPage(page + 1); setLoading(true); }}>Próxima</button></div>
    </>}
    {form && <CattleForm spec={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); setLoading(true); onChanged(); }} />}
  </section>;
}
