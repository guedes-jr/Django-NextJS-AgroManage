"use client";
import Link from "next/link";
import { useCattleSegment } from "./CattleSegmentContext";
import { cattleHref } from "@/services/cattleNavigation";
import { useEffect, useState } from "react";
import { cattleService, cattleError, type CattleTroughReading, type Page } from "@/services/cattleService";
import { cattleDailyFeedingService, type DailyFeeding } from "@/services/cattleDailyFeedingService";
import { CattleForm, type CattleFormSpec } from "./CattleForm";
import styles from "./cattle.module.css";

const scores = ["Vazio", "Vestígios", "Camada fina", "Sobra moderada", "Sobra elevada"];
const sessions: Record<string, string> = { morning: "Manhã", afternoon: "Tarde", evening: "Noite" };
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; };

export function CattleNutrition({ farm, canWrite, onChanged }: { farm: string; canWrite: boolean; onChanged?: () => void }) {
  const segment = useCattleSegment() || "beef";
  const [data, setData] = useState<Page<CattleTroughReading> | null>(null);
  const [choices, setChoices] = useState<DailyFeeding | null>(null);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<CattleFormSpec | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([cattleService.troughReadings({ ...(farm ? { farm } : {}), production: segment, page }, controller.signal), canWrite ? cattleDailyFeedingService.get(controller.signal) : Promise.resolve(null)])
      .then(([rows, choices]) => { if (!controller.signal.aborted) { setData(rows); setChoices(choices); setError(""); } })
      .catch(error => { if (!controller.signal.aborted) setError(cattleError(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [farm, page, refresh, segment, canWrite]);
  function readTrough() {
    const requestKey = crypto.randomUUID();
    setForm({ title: "Registrar leitura do cocho", description: "Observe o cocho do lote. O escore visual e a sobra pesada são informações distintas. A leitura não altera o estoque.", initial: { session: "morning" }, fields: [
      { name: "batch", label: "Lote", type: "select", required: true, options: choices?.results.filter(row => !farm || row.farm === farm).map(row => ({ value: row.id, label: `${row.batch_code} · ${row.farm_name}` })) || [] },
      { name: "formula", label: "Fórmula de ração (opcional)", type: "select", options: choices?.formulas.map(row => ({ value: row.id, label: row.nome.length > 30 ? `${row.nome.slice(0,30)}...` : row.nome })) || [] },
      { name: "session", label: "Turno", type: "select", required: true, options: Object.entries(sessions).map(([value, label]) => ({ value, label })) },
      { name: "score", label: "Escore visual", type: "select", required: true, options: scores.map((label, value) => ({ value: String(value), label: `${value} · ${label}` })) },
      { name: "remaining_kg", label: "Sobra pesada (kg, opcional)", type: "number", min: "0", step: "0.01" },
      { name: "notes", label: "Observações", type: "textarea", maxLength: 1000 },
    ], submitLabel: "Registrar leitura", save: values => cattleService.recordTroughReading({ ...values, formula: values.formula || null, score: Number(values.score), remaining_kg: values.remaining_kg || null, date: today(), request_key: requestKey }) });
  }
  return <section className={styles.panel}>
    <div className="d-flex flex-wrap justify-content-between gap-3 mb-3"><div><h2>Leituras do cocho</h2><p className={styles.muted}>Acompanhe as observações por lote, turno e fórmula utilizada.</p></div><div className={styles.actions}><Link href={cattleHref("/home/seguimento/gado-de-corte/racao/tratos", segment)} className="btn btn-outline-success btn-sm">Tratos de hoje</Link>{canWrite && <button disabled={loading || !choices} className="btn btn-success btn-sm" onClick={readTrough}>Registrar leitura</button>}</div></div>
    {error && <p className="alert alert-danger" role="alert">{error}<button className="btn btn-outline-danger btn-sm ms-2" onClick={() => { setLoading(true); setRefresh(value => value+1); }}>Tentar novamente</button></p>}
    {loading ? <p role="status">Carregando leituras…</p> : !error && <div className="table-responsive"><table className={styles.table}><thead><tr><th>Data / turno</th><th>Lote / fazenda</th><th>Fórmula</th><th>Leitura</th><th>Responsável</th></tr></thead><tbody>
      {data?.results.map(row => <tr key={row.id}><td>{new Date(`${row.date}T12:00:00`).toLocaleDateString("pt-BR")}<small>{sessions[row.session]}</small></td><td><strong>{row.batch_code}</strong><small>{row.farm_name} · {row.head_count} cabeças na leitura</small></td><td>{row.formula_name || "Não informada"}</td><td>{row.score} · {scores[row.score]}<small>Sobra pesada: {row.remaining_kg === null ? "não informada" : `${Number(row.remaining_kg).toLocaleString("pt-BR")} kg`}</small><small>{row.notes}</small></td><td>{row.recorded_by || "Usuário removido"}</td></tr>)}
      {!data?.count && <tr><td colSpan={5}>Nenhuma leitura registrada.</td></tr>}
    </tbody></table></div>}
    <div className={styles.pagination}><span>{data?.count || 0} leituras · página {page}</span><button className="btn btn-outline-secondary btn-sm" disabled={page === 1 || loading} onClick={() => { setPage(page - 1); setLoading(true); }}>Anterior</button><button className="btn btn-outline-secondary btn-sm" disabled={!data?.next || loading} onClick={() => { setPage(page + 1); setLoading(true); }}>Próxima</button></div>
    {form && <CattleForm spec={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); setRefresh(value => value + 1); setLoading(true); onChanged?.(); }} />}
  </section>;
}
