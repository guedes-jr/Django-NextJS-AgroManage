"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cylinder, Plus, RefreshCw } from "lucide-react";
import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";
import { cattleService, cattleError, type Page } from "@/services/cattleService";
import { milkTankService as service, type MilkTank, type TankMovement, type TankQuality, type AvailableMilk } from "@/services/milkTankService";
import { milkToday, milkNumber } from "@/services/milkProductionService";
import { CattleForm, type CattleFormSpec, type CattleField } from "./CattleForm";
import styles from "./cattle.module.css";

const kinds = { production: "Entrada da produção", collection: "Coleta", discard: "Descarte" };
const antibioticLabels = { not_tested: "Não testado", negative: "Negativo", positive: "Positivo" };
const day = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
const numeric = (name: string, label: string, required = true): CattleField => ({ name, label, type: "number", min: "0.01", step: "0.01", required });
const notes: CattleField = { name: "notes", label: "Observações", type: "textarea", maxLength: 1000 };
const clean = (values: Record<string, string>) => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ""));

export function MilkTankWorkspace() {
  const access = useOrganizationAccess();
  const manager = !!access && ["admin", "manager"].includes(access.role);
  const canWrite = !!access && !access.read_only;
  const [tanks, setTanks] = useState<MilkTank[]>([]);
  const [farms, setFarms] = useState<{ id: string; name: string }[]>([]);
  const [farm, setFarm] = useState("");
  const [tankId, setTankId] = useState("");
  const [tab, setTab] = useState<"movements" | "quality">("movements");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<Page<TankMovement> | null>(null);
  const [quality, setQuality] = useState<Page<TankQuality> | null>(null);
  const [sourceDate, setSourceDate] = useState(milkToday);
  const [available, setAvailable] = useState<AvailableMilk | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [form, setForm] = useState<CattleFormSpec | null>(null);
  const selected = tanks.find(tank => tank.id === tankId);
  const scoped = tanks.filter(tank => (!farm || tank.farm === farm) && (!tankId || tank.id === tankId));
  const active = scoped.filter(tank => tank.is_active);
  const balance = scoped.reduce((value, tank) => value + Number(tank.balance_liters), 0);
  const capacity = active.reduce((value, tank) => value + Number(tank.capacity_liters), 0);
  const ready = canWrite && !!selected?.is_active;
  const sourceReady = ready && !sourceLoading && !sourceError && available?.date === sourceDate && Number(available.available) > 0;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      Promise.all([service.tanks(controller.signal), cattleService.farms(controller.signal),
        tab === "movements" ? service.movements({ ...(farm ? { farm } : {}), ...(tankId ? { tank: tankId } : {}), ...(kind ? { kind } : {}), page }, controller.signal) : Promise.resolve(null),
        tab === "quality" ? service.quality({ ...(farm ? { farm } : {}), ...(tankId ? { tank: tankId } : {}), page }, controller.signal) : Promise.resolve(null)])
        .then(([tanks, farms, records, quality]) => { if (!controller.signal.aborted) { setTanks(tanks); setFarms(farms); setRecords(records); setQuality(quality); } })
        .catch(error => { if (!controller.signal.aborted) setError(cattleError(error)); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 100);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [farm, tankId, tab, kind, page, revision]);
  useEffect(() => {
    if (!tankId || !sourceDate) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSourceLoading(true); setSourceError("");
      service.available(tankId, sourceDate, controller.signal)
        .then(data => { if (!controller.signal.aborted) setAvailable(data); })
        .catch(error => { if (!controller.signal.aborted) { setAvailable(null); setSourceError(cattleError(error)); } })
        .finally(() => { if (!controller.signal.aborted) setSourceLoading(false); });
    }, 100);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [tankId, sourceDate, revision]);
  function editTank(tank?: MilkTank) {
    setForm({ title: tank ? "Editar tanque de leite" : "Cadastrar tanque de leite", description: "O saldo começa vazio e muda somente por entradas, coletas ou descartes. Não repita a produção já recebida em outro tanque.", initial: { farm: tank?.farm || farm || (farms.length === 1 ? farms[0].id : ""), name: tank?.name || "", capacity_liters: tank?.capacity_liters || "", is_active: String(tank?.is_active ?? true), notes: tank?.notes || "" }, fields: [
      { name: "farm", label: "Fazenda", type: "select", required: true, readOnly: !!tank, options: farms.map(farm => ({ value: farm.id, label: farm.name })) }, { name: "name", label: "Nome / identificação", required: true, maxLength: 100 }, { ...numeric("capacity_liters", "Capacidade (L)"), readOnly: !!tank }, { name: "is_active", label: "Tanque ativo", type: "checkbox" }, notes
    ], save: async values => { const result = await service.saveTank({ ...clean(values), is_active: values.is_active === "true" }, tank?.id); setTankId(result.id); setFarm(result.farm); setAvailable(null); } });
  }
  function receive() {
    if (!selected || !available) return;
    const key = crypto.randomUUID();
    setForm({ title: `Receber produção · ${selected.name}`, description: `Produção de ${day(sourceDate)}: ${milkNumber(available.produced_usable)} L aproveitáveis; ${milkNumber(available.allocated)} L já destinados aos tanques desta fazenda. Descartes na ordenha não entram no saldo.`, initial: { date: sourceDate, liters: Math.max(0, Math.min(Number(available.available), Number(selected.capacity_liters) - Number(selected.balance_liters))).toFixed(2) }, fields: [{ name: "date", label: "Data da produção", type: "date", required: true, readOnly: true }, numeric("liters", "Volume a receber (L)"), notes], save: values => service.move({ ...clean(values), tank: selected.id, kind: "production", request_key: key }) });
  }
  function withdraw(collection: boolean) {
    if (!selected) return;
    const key = crypto.randomUUID();
    setForm({ title: `${collection ? "Registrar coleta" : "Registrar descarte"} · ${selected.name}`, description: collection ? "Informe o volume efetivamente coletado. Um título a receber é opcional e não representa pagamento." : "O descarte reduz o saldo por um lançamento com motivo e autoria.", initial: { date: milkToday(), generate_receivable: "false" }, fields: [
      { name: "date", label: "Data", type: "date", required: true, max: milkToday() }, numeric("liters", "Volume (L)"), ...(collection ? [
        { name: "buyer", label: "Laticínio / destinatário", required: true, maxLength: 200 }, { name: "driver", label: "Motorista / transportador", maxLength: 200 }, { name: "vehicle", label: "Veículo / placa", maxLength: 30 }, { name: "document", label: "Comprovante / romaneio", maxLength: 100 },
        ...(manager ? [{ ...numeric("unit_price", "Preço por litro (R$)", false), step: "0.0001" }, { name: "generate_receivable", label: "Gerar título a receber no financeiro", type: "checkbox" } satisfies CattleField, { name: "due_date", label: "Vencimento do recebimento", type: "date", visibleWhen: { field: "generate_receivable", value: "true" } } satisfies CattleField] : [])
      ] satisfies CattleField[] : [{ name: "reason", label: "Motivo do descarte", type: "textarea", required: true, maxLength: 500 } satisfies CattleField]), notes
    ], save: values => service.move({ ...clean(values), generate_receivable: collection && manager && values.generate_receivable === "true", tank: selected.id, kind: collection ? "collection" : "discard", request_key: key }) });
  }
  function analyze() {
    if (!selected) return;
    const key = crypto.randomUUID();
    setForm({ title: `Registrar qualidade · ${selected.name}`, description: "Registre os resultados medidos e a referência da amostra. A observação não altera o saldo e não certifica a qualidade de outras entradas de leite.", initial: { date: milkToday(), antibiotics: "not_tested" }, fields: [
      { name: "date", label: "Data da amostra", type: "date", required: true, max: milkToday() }, { name: "sample", label: "Amostra / laboratório", maxLength: 100 }, { ...numeric("temperature_c", "Temperatura (°C)", false), min: "-273.15" },
      ...[numeric("fat_percent", "Gordura (%)", false), numeric("protein_percent", "Proteína (%)", false)].map(field => ({ ...field, min: "0", max: "100" })),
      ...[numeric("scc", "CCS (células/mL)", false), numeric("tbc", "CBT (UFC/mL)", false)].map(field => ({ ...field, min: "0", step: "1", max: "2147483647" })),
      { name: "antibiotics", label: "Teste de antibióticos", type: "select", required: true, options: Object.entries(antibioticLabels).map(([value, label]) => ({ value, label })) }, notes
    ], save: values => service.recordQuality({ ...clean(values), tank: selected.id, request_key: key }) });
  }
  function cancel(row: TankMovement) {
    setForm({ title: "Cancelar lançamento do tanque", description: "O histórico será preservado. O cancelamento só será aceito se não deixar saldo negativo no histórico; títulos recebidos exigem estorno prévio no financeiro.", fields: [{ name: "reason", label: "Motivo do cancelamento", type: "textarea", required: true, maxLength: 500 }], save: values => service.cancel(row.id, values.reason) });
  }
  const count = tab === "movements" ? records?.count : quality?.count;
  const next = tab === "movements" ? records?.next : quality?.next;
  return <div className={styles.page}>
    <header className={styles.header}><div className="d-flex align-items-center gap-3"><Cylinder size={28} /><div><h1>Tanque de leite</h1><p className={styles.muted}>Entradas da produção, coletas, descartes e qualidade por tanque.</p></div></div><div className={styles.actions}><button className="btn btn-outline-secondary btn-sm" disabled={loading} onClick={() => setRevision(value => value+1)}><RefreshCw size={15}/> Atualizar</button>{manager && canWrite && <button className="btn btn-success btn-sm" disabled={loading || !farms.length} onClick={() => editTank()}><Plus size={15}/> Cadastrar tanque</button>}</div></header>
    <section className={styles.panel}><div className={styles.toolbar}><label className={styles.field}>Fazenda<select className="form-select form-select-sm" value={farm} onChange={event => { setFarm(event.target.value); setTankId(""); setAvailable(null); setPage(1); }}><option value="">Todas as fazendas</option>{farms.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className={styles.field}>Tanque<select className="form-select form-select-sm" value={tankId} onChange={event => { setTankId(event.target.value); setAvailable(null); setSourceError(""); setPage(1); }}><option value="">Todos os tanques</option>{tanks.filter(row => !farm || row.farm === farm).map(row => <option key={row.id} value={row.id}>{row.name} · {row.farm_name}{!row.is_active ? " (inativo)" : ""}</option>)}</select></label></div>
      <div className={styles.metrics}>{[["Leite armazenado", `${milkNumber(balance)} L`], ["Capacidade ativa", `${milkNumber(capacity)} L`], ["Espaço disponível", `${milkNumber(Math.max(0, capacity-balance))} L`]].map(([label,value]) => <article key={label} className={styles.metric}><span>{label}</span><strong>{loading ? "…" : value}</strong></article>)}</div>
      {selected ? <><p className="small mt-3">{selected.name} · {selected.farm_name} · {milkNumber(selected.balance_liters)} de {milkNumber(selected.capacity_liters)} L {selected.notes && `· ${selected.notes}`}</p><div className={styles.actions}><button className="btn btn-success btn-sm" disabled={!ready} onClick={() => withdraw(true)}>Registrar coleta</button><button className="btn btn-outline-success btn-sm" disabled={!ready} onClick={analyze}>Registrar qualidade</button><button className="btn btn-outline-danger btn-sm" disabled={!ready} onClick={() => withdraw(false)}>Registrar descarte</button>{manager && canWrite && <button className="btn btn-outline-secondary btn-sm" onClick={() => editTank(selected)}>Editar tanque</button>}</div></> : <p className={styles.muted}>Selecione um tanque para registrar movimentações e resultados de qualidade.</p>}
      {!loading && !tanks.length && !error && <p>Nenhum tanque cadastrado. Cadastre um tanque para começar; o saldo será formado pelas entradas da produção.</p>}
    </section>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    {selected && <section className={styles.panel}><h2>Receber produção no tanque</h2><p className={styles.muted}>A produção é lançada em Leite e recebida aqui, sem duplicar o volume já destinado a outros tanques.</p><div className={styles.toolbar}><label className={styles.field}>Data da produção<input type="date" className="form-control form-control-sm" max={milkToday()} value={sourceDate} onChange={event => { setSourceDate(event.target.value); setAvailable(null); }}/></label><div>{sourceLoading ? "Consultando produção..." : available && <>Aproveitável: <strong>{milkNumber(available.produced_usable)} L</strong> · Já destinada: <strong>{milkNumber(available.allocated)} L</strong> · Disponível: <strong>{milkNumber(available.available)} L</strong></>}</div><button className="btn btn-success btn-sm" disabled={!sourceReady} onClick={receive}>Receber produção</button></div>{sourceError && <p className="alert alert-danger" role="alert">{sourceError}</p>}<Link className="small" href="/home/seguimento/pecuaria-leiteira/leite">Abrir lançamento de produção de leite</Link></section>}
    <section className={styles.panel}><div className={styles.toolbar}><nav className={styles.actions} aria-label="Histórico do tanque">{(["movements", "quality"] as const).map(value => <button className={`btn btn-sm ${tab === value ? "btn-success" : "btn-outline-secondary"}`} key={value} onClick={() => { setTab(value); setPage(1); }} aria-pressed={tab === value}>{value === "movements" ? "Movimentações e coletas" : "Qualidade"}</button>)}</nav>{tab === "movements" && <label className={styles.field}>Tipo<select className="form-select form-select-sm" value={kind} onChange={event => { setKind(event.target.value); setPage(1); }}><option value="">Todos os tipos</option>{Object.entries(kinds).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>}</div>
      {loading ? <p role="status">Carregando tanque e histórico...</p> : !error && <div className="table-responsive"><table className={styles.table}><thead><tr>{(tab === "movements" ? ["Data / tanque", "Lançamento", "Volume", "Detalhes", "Responsável", ...(manager ? ["Ações"] : [])] : ["Data / tanque", "Amostra", "Temperatura", "Gordura / proteína", "CCS / CBT", "Antibióticos", "Responsável"]).map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>
        {tab === "movements" ? records?.results.map(row => <tr key={row.id}><td>{day(row.date)}<small>{row.tank_name} · {row.farm_name}</small></td><td>{kinds[row.kind]}{row.cancelled_at && <small className="text-danger">Cancelado: {row.cancellation_reason}</small>}</td><td>{milkNumber(row.liters)} L</td><td>{row.buyer || row.reason || "—"}<small>{[row.driver,row.vehicle,row.document,row.notes].filter(Boolean).join(" · ")}</small>{manager && row.amount && <small>Valor registrado: {Number(row.amount).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</small>}{manager && row.receivable && <Link className="small" href="/home/financeiro">Título no financeiro</Link>}</td><td>{row.recorded_by}</td>{manager && <td>{canWrite && !row.cancelled_at && <button className="btn btn-outline-danger btn-sm" onClick={() => cancel(row)}>Cancelar lançamento</button>}</td>}</tr>) : quality?.results.map(row => <tr key={row.id}><td>{day(row.date)}<small>{row.tank_name} · {row.farm_name}</small></td><td>{row.sample || "—"}<small>{row.notes}</small></td><td>{milkNumber(row.temperature_c)} °C</td><td>{milkNumber(row.fat_percent)}% / {milkNumber(row.protein_percent)}%</td><td>{row.scc == null ? "—" : row.scc.toLocaleString("pt-BR")} células/mL<small>{row.tbc == null ? "—" : row.tbc.toLocaleString("pt-BR")} UFC/mL</small></td><td><span className={row.antibiotics === "positive" ? "text-danger fw-bold" : ""}>{antibioticLabels[row.antibiotics]}</span></td><td>{row.recorded_by}</td></tr>)}
        {!count && <tr><td colSpan={7}>Nenhum registro neste filtro.</td></tr>}
      </tbody></table></div>}
      <div className={styles.pagination}><span>{count || 0} registros · página {page}</span><button className="btn btn-outline-secondary btn-sm" disabled={loading || page === 1 || !!error} onClick={() => setPage(value => value-1)}>Anterior</button><button className="btn btn-outline-secondary btn-sm" disabled={loading || !next || !!error} onClick={() => setPage(value => value+1)}>Próxima</button></div>
    </section>
    {form && <CattleForm spec={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); setPage(1); setRevision(value => value+1); }}/>}
  </div>;
}
