"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Milk, Droplets, AlertTriangle, Plus, RefreshCw, Save, ChevronLeft, ChevronRight, Sun, Sunrise, Moon, History } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { DataTable } from "@/components/ui/DataTable";
import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";
import { cattleService, cattleError, type CattleMilk } from "@/services/cattleService";
import { milkProductionService as service, milkToday, milkNumber as number, milkSessions, type MilkCow, type MilkSummary, type MilkTotal, type MilkValues } from "@/services/milkProductionService";
import { CowIcon } from "./CattleIcons";
import styles from "./milk-production.module.css";

const empty: MilkValues = { liters: "", discarded_liters: "0", discard_reason: "", notes: "" };
const statusMap = { pending: { label: "Pendente", variant: "amber" }, recorded: { label: "Lançado", variant: "green" }, total: { label: "Total da fazenda", variant: "blue" } };

export function MilkProduction() {
  const access = useOrganizationAccess();
  const canWrite = !!access && !access.read_only && ["admin", "manager", "operator"].includes(access.role);
  const manager = !!access && ["admin", "manager"].includes(access.role);
  const advanceToNextPage = useRef(false);
  const [totalOpen, setTotalOpen] = useState(false);
  const [farms, setFarms] = useState<{id: string; name: string}[]>([]);
  const [farm, setFarm] = useState("");
  const [day, setDay] = useState(milkToday);
  const [summary, setSummary] = useState<MilkSummary | null>(null);
  const [cows, setCows] = useState<MilkCow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [mode, setMode] = useState<"individual" | "total">("individual");
  const [selected, setSelected] = useState<MilkCow | null>(null);
  const [session, setSession] = useState("morning");
  const [records, setRecords] = useState<CattleMilk[]>([]);
  const [total, setTotal] = useState<MilkTotal | null>(null);
  const [values, setValues] = useState<MilkValues>(empty);
  const [loading, setLoading] = useState(true);
  const [entryLoading, setEntryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [entryError, setEntryError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [recordsTab, setRecordsTab] = useState<"cows" | "history">("cows");
  const [historyMode, setHistoryMode] = useState<"individual" | "total">("individual");
  const [history, setHistory] = useState<(CattleMilk | MilkTotal)[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    cattleService.farms(controller.signal).then(setFarms).catch(() => { if (!controller.signal.aborted) setError("Não foi possível carregar as fazendas."); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const [snapshot, result] = await Promise.all([service.summary(day, farm, controller.signal), service.cows({ date: day, ...(farm ? { farm } : {}), page: page + 1, page_size: pageSize, search, entry_status: status }, controller.signal)]);
        if (!controller.signal.aborted) { setSummary(snapshot); setCows(result.results); setCount(result.count); if (advanceToNextPage.current) { advanceToNextPage.current = false; setSelected(result.results[0] || null); setEntryLoading(true); } }
      } catch (err) { if (!controller.signal.aborted) { setError(cattleError(err)); setCows([]); setSummary(null); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 150);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [day, farm, page, pageSize, search, status, revision]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setEntryError(""); setEntryLoading(true); setRecords([]); setTotal(null); setValues(empty);
      try {
        if (mode === "individual" && selected) {
          const data = await service.records({ animal: selected.id, date: day, page_size: 10 }, controller.signal);
          if (!controller.signal.aborted) {
            setRecords(data.results);
            const record = data.results.find(item => item.session === session);
            setValues(record ? { liters: record.liters, discarded_liters: record.discarded_liters, discard_reason: record.discard_reason, notes: record.notes } : empty);
          }
        } else if (mode === "total" && farm) {
          const data = await service.totals({ farm, date: day, page_size: 1 }, controller.signal);
          if (!controller.signal.aborted) { const item = data.results[0]; setTotal(item || null); setValues(item ? { liters: item.liters, discarded_liters: item.discarded_liters, discard_reason: item.discard_reason, notes: item.notes } : empty); }
        }
      } catch (err) { if (!controller.signal.aborted) setEntryError(cattleError(err)); }
      finally { if (!controller.signal.aborted) setEntryLoading(false); }
    }, 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [selected, session, day, farm, mode, revision]);

  useEffect(() => {
    if (recordsTab !== "history") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setHistoryLoading(true); setHistory([]);
      try {
        const params = { ...(farm ? { farm } : {}), page: historyPage + 1, page_size: 10 };
        const data = historyMode === "total" ? await service.totals(params, controller.signal) : await service.records(params, controller.signal);
        if (!controller.signal.aborted) { setHistory(data.results); setHistoryCount(data.count); }
      } catch (err) { if (!controller.signal.aborted) setError(cattleError(err)); }
      finally { if (!controller.signal.aborted) setHistoryLoading(false); }
    }, 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [recordsTab, historyPage, farm, historyMode, revision]);

  const currentRecord = records.find(item => item.session === session);
  const index = cows.findIndex(cow => cow.id === selected?.id);
  const cowTotal = records.reduce((sum, item) => sum + Number(item.liters), 0) - Number(currentRecord?.liters || 0) + Number(values.liters || 0);
  const selectCow = (cow: MilkCow) => { setMode("individual"); if (cow.id === selected?.id) return; setEntryLoading(true); setSelected(cow); setMessage(""); };
  const changeMode = (value: "individual" | "total") => { if (value === mode) return; setMode(value); setSelected(null); setValues(empty); setEntryLoading(true); setHistoryPage(0); setMessage(""); };
  async function save(next: boolean) {
    if (saving || entryLoading || !canWrite) return;
    setSaving(true); setEntryError(""); setMessage("");
    try {
      if (mode === "total") {
        if (!farm) throw new Error("farm");
        await service.saveTotal(farm, day, values, total?.id);
      } else if (selected) {
        await service.saveIndividual(selected.id, day, session, values, currentRecord?.id);
      } else return;
      setMessage("Produção salva com sucesso.");
      if (!next) { setSelected(null); setTotalOpen(false); }
      setRevision(value => value + 1);
      if (next && index >= 0 && index < cows.length - 1) selectCow(cows[index+1]);
      else if (next) { setSelected(null); if (status === "pending") { advanceToNextPage.current = true; setPage(0); } else if ((page + 1) * pageSize < count) { advanceToNextPage.current = true; setPage(value => value + 1); } }
    } catch (err) { setEntryError(cattleError(err)); }
    finally { setSaving(false); }
  }
  const cards = [
    { label: "Produção total", value: `${number(summary?.produced_liters)} L`, icon: Milk },
    { label: "Vacas ordenhadas", value: `${summary?.milked_cows ?? "—"} / ${summary?.expected_cows ?? "—"}`, icon: CowIcon },
    { label: "Média por vaca", value: `${number(summary?.average_per_milked_cow)} L`, icon: Droplets },
    { label: "Pendentes", value: summary?.pending_cows ?? "—", icon: AlertTriangle },
  ];
  return <div className={styles.workspace}>
    <header className={styles.header}><div className={styles.title}><span><Milk size={26}/></span><div><h1>Leite</h1><p>Controle da produção por vaca e turno ou pelo total diário da fazenda.</p></div></div>
      <div className={styles.filters}><label>Fazenda<select disabled={saving} className="form-select form-select-sm" value={farm} onChange={event => { setFarm(event.target.value); setPage(0); setSelected(null); setHistoryPage(0); setMessage(""); }}><option value="">Todas as fazendas</option>{farms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="btn btn-outline-secondary btn-sm" disabled={loading || saving} onClick={() => setRevision(value => value+1)}><RefreshCw size={16}/> Atualizar</button></div>
    </header>
    {error && <p role="alert" className="alert alert-danger">{error}</p>}
    {message && <p role="status" className="alert alert-success">{message}</p>}
    <section className={styles.panel} aria-busy={loading}><div className={styles.sectionHeading}><div><small>Produção leiteira</small><h2>Resumo do dia</h2></div><label className={styles.date}>Data<input aria-label="Data da produção" className="form-control form-control-sm" type="date" max={milkToday()} value={day} disabled={saving} onChange={event => { if (event.target.value) { setDay(event.target.value); setSelected(null); setMessage(""); } }}/></label></div>
      {loading && <p role="status" className="small text-muted-foreground">Atualizando produção…</p>}
      <div className={styles.metrics}>{cards.map(({ label, value, icon: Icon }) => <article key={label} data-warning={label === "Pendentes"}><Icon size={28}/><div><span>{label}</span><strong>{loading ? "—" : value}</strong></div></article>)}</div>
      {summary?.aggregate_mode && <p className={styles.hint}>Há lançamento total nesta data. Quantidade de vacas ordenhadas, média e pendências individuais não são informadas nesse modo.</p>}
      <p className={styles.hint}>O plantel considera as vacas atualmente em lactação e os animais com ordenha na data selecionada. Produção descartada: {number(summary?.discarded_liters)} L.</p>
      <div className={styles.modeChoices} role="group" aria-label="Tipo de lançamento"><button disabled={saving} aria-pressed={mode === "individual"} onClick={() => changeMode("individual")}><CowIcon size={30}/><span><strong>Por vaca</strong><small>Produção individual por turno</small></span></button><button disabled={saving} aria-pressed={mode === "total"} onClick={() => changeMode("total")}><Milk size={30}/><span><strong>Produção total</strong><small>Volume diário da fazenda</small></span></button></div>
      {mode === "total" && canWrite && <button className="btn btn-success w-100 mt-3" disabled={loading} onClick={() => setTotalOpen(true)}><Plus size={18}/> Lançar produção de leite</button>}
      {mode === "individual" && canWrite && <button className="btn btn-success w-100 mt-3" disabled={loading || !cows.length} onClick={() => selectCow(cows.find(cow => cow.entry_status === "pending") || cows[0])}><Plus size={18}/> Lançar produção de leite</button>}
    </section>
    {mode === "individual" && selected && <MilkEntryModal title="Lançar produção de leite" description={`Produção individual · ${new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR")}`} saving={saving} onClose={() => setSelected(null)}><div aria-busy={entryLoading}>
      <div className={styles.sectionHeading}><div><small>{selected.farm_name}</small><h2>{selected.identifier} {selected.name && `· ${selected.name}`}</h2><p className={styles.hint}>{selected.breed_name || "Raça não informada"} · {selected.is_lactating ? "Em lactação" : "Registro da data selecionada"}</p></div><div className={styles.navigation}><button className="btn btn-outline-secondary btn-sm" disabled={saving || index <= 0} onClick={() => selectCow(cows[index-1])}><ChevronLeft size={16}/> Anterior</button><span>{index+1} de {cows.length} nesta página</span><button className="btn btn-outline-secondary btn-sm" disabled={saving || index < 0 || index >= cows.length-1} onClick={() => selectCow(cows[index+1])}>Próxima <ChevronRight size={16}/></button></div></div>
      {selected.entry_status === "total" && <p className="alert alert-warning">Já existe produção total para esta fazenda e data. Consulte o lançamento total antes de registrar ordenhas individuais.</p>}
      <div className={styles.sessions} role="group" aria-label="Turno da ordenha">{milkSessions.map((item, i) => { const Icon = [Sunrise, Sun, Moon][i]; return <button key={item.id} disabled={saving} aria-pressed={session === item.id} onClick={() => { if (item.id !== session) { setEntryLoading(true); setSession(item.id); } }}><Icon size={24}/>{item.label}{records.some(record => record.session === item.id) && <small>Lançado</small>}</button>; })}</div>
      <ProductionForm values={values} setValues={setValues} disabled={!canWrite || saving || entryLoading || selected.entry_status === "total" || (!!currentRecord && !manager)} error={entryError} loading={entryLoading} onSave={() => void save(false)} onNext={() => void save(true)} total={cowTotal} editing={!!currentRecord} saving={saving}/>
      {!!currentRecord && !manager && <p className={styles.hint}>A correção de uma ordenha existente é reservada ao gerente ou administrador.</p>}
    </div></MilkEntryModal>}
    {mode === "total" && totalOpen && <MilkEntryModal title="Lançar produção total de leite" description={`Produção diária · ${new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR")}`} saving={saving} onClose={() => setTotalOpen(false)}><div><div className={styles.sectionHeading}><div><small>Lançamento diário</small><h2>Produção total do dia</h2></div><Milk size={28}/></div><p className={styles.hint}>Informe o volume total produzido. Nesta fazenda e data, use apenas um tipo de lançamento.</p>
      {!farm ? <label className={styles.modalFarm}>Fazenda<select className="form-select form-select-sm" value={farm} onChange={event => { setEntryLoading(true); setFarm(event.target.value); }}><option value="">Selecione uma fazenda</option>{farms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <ProductionForm values={values} setValues={setValues} disabled={!canWrite || saving || entryLoading || (!!total && !manager)} error={entryError} loading={entryLoading} onSave={() => void save(false)} editing={!!total} saving={saving}/>}
    </div></MilkEntryModal>}
    <MilkRecordTabs selected={recordsTab} onSelect={setRecordsTab}/>
    {recordsTab === "cows" && <section id="milk-cows-panel" role="tabpanel" aria-labelledby="milk-cows-tab" className={styles.panel}><DataTable<MilkCow> title={`Vacas (${count})`} rows={cows} rowKey="id" searchValue={search} onSearchChange={value => { setSearch(value); setPage(0); setSelected(null); }} searchPlaceholder="Buscar por brinco ou nome..." statusKey="entry_status" statusMap={statusMap}
      columns={[{ key: "identifier", label: "Nº / Brinco" }, { key: "name", label: "Nome", render: value => String(value || "—") }, ...(!farm ? [{ key: "farm_name", label: "Fazenda" }] : []), { key: "liters", label: "Produção (L)", render: value => number(value as string | null) }]}
      filters={[{ key: "entry_status", label: "Todos os status", value: status, onChange: value => { setStatus(value); setPage(0); setSelected(null); }, options: Object.entries(statusMap).map(([value, entry]) => ({ value, label: entry.label })) }]}
      pagination={{ page, pageSize, total: count, onPageChange: value => { setPage(value); setSelected(null); }, onPageSizeChange: value => { setPageSize(value); setPage(0); setSelected(null); } }}
      onRowClick={cow => selectCow(cow)} emptyText={loading ? "Carregando vacas..." : "Nenhuma vaca em lactação ou com ordenha nesta data."}/></section>}
    {recordsTab === "history" && <section id="milk-history-panel" role="tabpanel" aria-labelledby="milk-history-tab" className={styles.panel}><div className={styles.sectionHeading}><h2><History size={20}/> Histórico de produção</h2><label className={styles.historyFilter}>Tipo de registro<select className="form-select form-select-sm" value={historyMode} onChange={event => { setHistoryMode(event.target.value as "individual" | "total"); setHistoryPage(0); }}><option value="individual">Ordenhas por vaca</option><option value="total">Totais da fazenda</option></select></label></div>
      <><p className={styles.hint}>Histórico de {historyMode === "total" ? "totais diários" : "ordenhas individuais"} · {farm ? farms.find(item => item.id === farm)?.name : "Todas as fazendas"}</p>{historyLoading && <p role="status">Carregando histórico…</p>}<DataTable<CattleMilk | MilkTotal> rows={history} rowKey="id" columns={[{ key: "date", label: "Data", render: value => new Date(`${String(value)}T12:00:00`).toLocaleDateString("pt-BR") }, { key: "farm_name", label: "Fazenda" }, ...(historyMode === "individual" ? [{ key: "identifier", label: "Brinco" }, { key: "session", label: "Turno", render: (value: unknown) => milkSessions.find(item => item.id === value)?.label || "—" }] : []), { key: "liters", label: "Produção (L)", render: value => number(String(value)) }, { key: "discarded_liters", label: "Descarte (L)", render: value => number(String(value)) }]} pagination={{ page: historyPage, pageSize: 10, total: historyCount, onPageChange: setHistoryPage, onPageSizeChange: () => {} }} pageSizeOptions={[10]} emptyText="Nenhum lançamento encontrado."/></>
    </section>}
    <div className="d-flex flex-wrap gap-2"><Link href="/home/seguimento/pecuaria-leiteira/operacoes?tab=milk-trends" className="btn btn-outline-success btn-sm">Evolução e alertas de produção</Link><Link href="/home/seguimento/pecuaria-leiteira/operacoes?tab=classification" className="btn btn-outline-secondary btn-sm">Classificar vacas do segmento</Link><Link href="/home/seguimento/pecuaria-leiteira" className="contextual-back-button"><ArrowLeft size={18}/><span>Voltar para Pecuária leiteira</span></Link></div>
  </div>;
}

export function ProductionForm({ values, setValues, disabled, error, loading, onSave, onNext, total, editing, saving }: { values: MilkValues; setValues: (value: MilkValues) => void; disabled: boolean; error: string; loading: boolean; onSave: () => void; onNext?: () => void; total?: number; editing: boolean; saving: boolean }) {
  return <form onSubmit={event => { event.preventDefault(); onSave(); }} className={styles.entryForm}>
    {loading && <p role="status">Carregando lançamento…</p>}
    {error && <p role="alert" className="alert alert-danger">{error}</p>}
    <fieldset disabled={disabled}><label className={styles.volume}>Produção de leite (litros)<input aria-label="Produção de leite em litros" type="number" inputMode="decimal" min="0.01" max="9999999.99" step="0.01" required value={values.liters} onChange={event => setValues({ ...values, liters: event.target.value })}/></label>
      {onNext && <div className={styles.volumeSlider}><button aria-label="Diminuir meio litro" type="button" onClick={() => setValues({ ...values, liters: Math.max(0, Number(values.liters || 0) - .5).toFixed(2) })}>−</button><input aria-label="Ajustar volume de leite" type="range" min="0" max={Math.max(30, Math.ceil(Number(values.liters || 0)))} step="0.5" value={values.liters || "0"} onChange={event => setValues({ ...values, liters: event.target.value })}/><button aria-label="Adicionar meio litro" type="button" onClick={() => setValues({ ...values, liters: (Number(values.liters || 0) + .5).toFixed(2) })}>+</button></div>}
      {onNext && <div className={styles.quickValues} aria-label="Atalhos de volume">{[5,10,12,15,20,25].map(liters => <button key={liters} type="button" onClick={() => setValues({ ...values, liters: liters.toFixed(2) })}>{liters} L</button>)}</div>}
      <div className={styles.fields}><label>Leite descartado (L)<input className="form-control" type="number" inputMode="decimal" min="0" max={values.liters || undefined} step="0.01" required value={values.discarded_liters} onChange={event => setValues({ ...values, discarded_liters: event.target.value })}/></label><label>Motivo do descarte<input className="form-control" maxLength={200} required={Number(values.discarded_liters) > 0} value={values.discard_reason} onChange={event => setValues({ ...values, discard_reason: event.target.value })}/></label></div>
      <label>Observação (opcional)<textarea className="form-control" rows={2} maxLength={2000} value={values.notes} onChange={event => setValues({ ...values, notes: event.target.value })}/></label>
      {total !== undefined && <div className={styles.dailyCowTotal}>Produção total da vaca no dia <strong>{number(total)} L</strong></div>}
      <div className={styles.saveActions}><button className="btn btn-success" type="submit"><Save size={18}/> {saving ? "Salvando…" : editing ? "Salvar correção" : "Salvar produção"}</button>{onNext && <button className="btn btn-outline-success" type="submit" onClick={event => { if (event.currentTarget.form?.reportValidity()) { event.preventDefault(); onNext(); } }}>Salvar e ir para a próxima vaca <ChevronRight size={16}/></button>}</div>
    </fieldset>
  </form>;
}


export function MilkEntryModal({ title, description, saving, onClose, children }: { title: string; description: string; saving: boolean; onClose: () => void; children: ReactNode }) {
  return <Modal isOpen title={title} description={description} onClose={() => { if (!saving) onClose(); }}>
    <div className={styles.modalBody}>{children}</div>
  </Modal>;
}


export function MilkRecordTabs({ selected, onSelect }: { selected: "cows" | "history"; onSelect: (value: "cows" | "history") => void }) {
  const tabs = [{ id: "cows", label: "Vacas", icon: CowIcon }, { id: "history", label: "Histórico de produção", icon: History }] as const;
  return <div className={styles.recordTabs} role="tablist" aria-label="Registros de leite">{tabs.map(({ id, label, icon: Icon }) => <button key={id} id={`milk-${id}-tab`} type="button" role="tab" aria-selected={selected === id} aria-controls={`milk-${id}-panel`} tabIndex={selected === id ? 0 : -1} onClick={() => onSelect(id)} onKeyDown={event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "cows" : event.key === "End" ? "history" : id === "cows" ? "history" : "cows";
    onSelect(next);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#milk-${next}-tab`)?.focus();
  }}><Icon size={18}/>{label}</button>)}</div>;
}
