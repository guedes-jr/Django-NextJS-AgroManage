"use client";

import { useEffect, useState, type FormEvent } from "react";
import { cattleService, cattleError, type CattleAnimal, type CattleManagement } from "@/services/cattleService";
import { cattleOperations, type StockLotOption } from "@/services/cattleOperationsService";
import styles from "./cattle.module.css";

const kinds = { weighing: "Pesagem", sanitary: "Sanitário", castration: "Castração" };
const statuses = { draft: "Rascunho", confirmed: "Confirmado", cancelled: "Cancelado" };
const today = () => new Date().toLocaleDateString("en-CA");
const displayDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
type Draft = { inventory_lot: string; inventory_quantity_per_animal: string; id?: string; farm: string; kind: CattleManagement["kind"]; date: string; description: string; responsible: string; treatment_type: string; cost_per_animal: string; next_procedure_date: string; milk_withdrawal_until: string; meat_withdrawal_until: string; notes: string; entries: Record<string, string> };
const blank = (farm: string): Draft => ({ inventory_lot: "", inventory_quantity_per_animal: "", farm, kind: "weighing", date: today(), description: "", responsible: "", treatment_type: "other", cost_per_animal: "0", next_procedure_date: "", milk_withdrawal_until: "", meat_withdrawal_until: "", notes: "", entries: {} });

export function CattleManagementWorkspace({ farms, canWrite, onChanged, production, initialMedication = false }: { initialMedication?: boolean; production?: "dairy" | "beef"; farms: { id: string; name: string }[]; canWrite: boolean; onChanged: () => void }) {
  const [stockLots, setStockLots] = useState<StockLotOption[]>([]);
  const [rows, setRows] = useState<CattleManagement[]>([]);
  const [status, setStatus] = useState("draft");
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(() => initialMedication && canWrite ? { ...blank(farms.length === 1 ? farms[0].id : ""), kind: "sanitary", treatment_type: "medication" } : null);
  const [animals, setAnimals] = useState<CattleAnimal[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingAnimals, setLoadingAnimals] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [animalError, setAnimalError] = useState("");
  const [notice, setNotice] = useState("");
  const [review, setReview] = useState<CattleManagement | null>(null);
  const [reason, setReason] = useState("");
  const farm = draft?.farm || "";
  useEffect(() => {
    if (draft?.kind !== "sanitary") return;
    const controller = new AbortController();
    cattleOperations.page<StockLotOption>("stock-lots", { page_size: 100 }, controller.signal).then(data => setStockLots(data.results)).catch(error => { if (!controller.signal.aborted) setAnimalError(cattleError(error)); });
    return () => controller.abort();
  }, [draft?.kind]);
  useEffect(() => {
    const controller = new AbortController();
    cattleService.list<CattleManagement>("managements", { status, page, ...(production ? { production } : {}) }, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setRows(data.results); setCount(data.count); } })
      .catch(error => { if (!controller.signal.aborted) setError(cattleError(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [status, page, refresh, production]);
  useEffect(() => {
    if (!farm) return;
    const controller = new AbortController();
    cattleService.all<CattleAnimal>("animals", { farm, status: "active", ...(production ? { production } : {}) }, controller.signal)
      .then(data => { if (!controller.signal.aborted) setAnimals(data); })
      .catch(error => { if (!controller.signal.aborted) setAnimalError(cattleError(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoadingAnimals(false); });
    return () => controller.abort();
  }, [farm, refresh, production]);
  function edit(row: CattleManagement) {
    setError(""); setAnimalError(""); setSearch(""); setAnimals([]); setLoadingAnimals(true);
    setDraft({ ...row, inventory_lot: row.inventory_lot || "", inventory_quantity_per_animal: row.inventory_quantity_per_animal || "", next_procedure_date: row.next_procedure_date || "", milk_withdrawal_until: row.milk_withdrawal_until || "", meat_withdrawal_until: row.meat_withdrawal_until || "", entries: Object.fromEntries(row.entries.map(entry => [entry.animal, entry.weight_kg || ""])) });
  }
  const change = (name: keyof Draft, value: string) => setDraft(previous => previous ? { ...previous, [name]: value } : previous);
  function reload(message: string) { setNotice(message); setError(""); setRefresh(value => value + 1); setLoading(true); onChanged(); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft || saving) return;
    setSaving(true); setError("");
    try {
      const { entries, id, ...header } = draft;
      const data = { ...header, inventory_lot: draft.kind === "sanitary" ? draft.inventory_lot || null : null, inventory_quantity_per_animal: draft.kind === "sanitary" ? draft.inventory_quantity_per_animal || null : null, cost_per_animal: draft.kind === "sanitary" ? draft.cost_per_animal || "0" : "0", next_procedure_date: draft.kind === "sanitary" ? draft.next_procedure_date || null : null, milk_withdrawal_until: draft.kind === "sanitary" ? draft.milk_withdrawal_until || null : null, meat_withdrawal_until: draft.kind === "sanitary" ? draft.meat_withdrawal_until || null : null, entries: Object.entries(entries).map(([animal, weight]) => ({ animal, weight_kg: draft.kind === "weighing" ? weight || null : null })) };
      if (id) await cattleService.update("managements", id, data); else await cattleService.create("managements", data);
      setDraft(null); reload("Rascunho salvo. Confira os participantes antes de confirmar; os efeitos ainda não foram aplicados.");
    } catch (error) { setError(cattleError(error)); } finally { setSaving(false); }
  }
  async function finish(action: "confirm" | "cancel") {
    if (!review || saving) return;
    setSaving(true); setError("");
    try {
      await cattleService.action("managements", review.id, action, action === "cancel" ? { reason } : {});
      setReview(null); setReason(""); reload(action === "confirm" ? "Manejo confirmado. Históricos e indicadores atualizados." : "Rascunho cancelado com justificativa.");
    } catch (error) { setError(cattleError(error)); } finally { setSaving(false); }
  }
  const eligible = animals.filter(animal => (draft?.kind !== "castration" || (animal.gender === "M" && !animal.is_castrated)) && `${animal.identifier} ${animal.category} ${animal.management_group}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const unavailable = draft ? Object.keys(draft.entries).filter(id => !animals.some(animal => animal.id === id)) : [];
  return <section className={styles.panel}>
    <h2>Manejos coletivos de animais identificados</h2>
    <p className={styles.muted}>Prepare a relação dos animais e confira os dados. Os efeitos só são aplicados ao confirmar. Lotes sem identificação continuam na área de lotes coletivos.</p>
    {notice && <p className="alert alert-success" role="status">{notice}</p>}
    {error && <p className="alert alert-danger" role="alert">{error} <button className="btn btn-sm btn-outline-danger" onClick={() => { setError(""); setRefresh(value => value + 1); }}>Tentar novamente</button></p>}
    {draft ? <form onSubmit={save} className={styles.managementForm}>
      <h3>{draft.id ? "Editar rascunho" : "Novo manejo"}</h3>
      <fieldset disabled={saving}><div className={styles.fields}>
        <label className={styles.field}>Fazenda *<select required className="form-select" value={draft.farm} onChange={event => { setAnimals([]); setAnimalError(""); setLoadingAnimals(Boolean(event.target.value)); setDraft({ ...draft, farm: event.target.value, entries: {} }); }}><option value="">Selecione</option>{farms.map(farm => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select></label>
        <label className={styles.field}>Tipo *<select className="form-select" value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as Draft["kind"], entries: {} })}>{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className={styles.field}>Data do manejo *<input required className="form-control" type="date" max={today()} value={draft.date} onChange={event => change("date", event.target.value)} /></label>
        <label className={styles.field}>Descrição *<input required maxLength={200} className="form-control" value={draft.description} onChange={event => change("description", event.target.value)} /></label>
        <label className={styles.field}>Responsável / veterinário<input maxLength={100} className="form-control" value={draft.responsible} onChange={event => change("responsible", event.target.value)} /></label>
        {draft.kind === "sanitary" && <>
          <label className={styles.field}>Produto e lote de estoque<select className="form-select" value={draft.inventory_lot} onChange={event => setDraft({ ...draft, inventory_lot: event.target.value, inventory_quantity_per_animal: event.target.value ? draft.inventory_quantity_per_animal : "" })}><option value="">Sem consumo de produto</option>{stockLots.map(lot => <option key={lot.id} value={lot.id}>{lot.label}{lot.expiry ? ` · Validade ${displayDate(lot.expiry)}` : ""}</option>)}</select></label>
          {draft.inventory_lot && <label className={styles.field}>Quantidade por animal ({stockLots.find(lot => lot.id === draft.inventory_lot)?.unit || "unidade do estoque"}) *<input className="form-control" required type="number" min="0.01" step="0.01" value={draft.inventory_quantity_per_animal} onChange={event => change("inventory_quantity_per_animal", event.target.value)}/><small>A confirmação baixa a quantidade × participantes. Informe na unidade do estoque.</small></label>}
          <label className={styles.field}>Procedimento<select className="form-select" value={draft.treatment_type} onChange={event => change("treatment_type", event.target.value)}>{Object.entries({ medication: "Medicação", exam: "Exame", surgery: "Cirurgia", other: "Outro" }).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className={styles.field}>Serviço / custo adicional por animal (R$)<input className="form-control" type="number" min="0" step="0.01" value={draft.cost_per_animal} onChange={event => change("cost_per_animal", event.target.value)} /></label>
          {([['next_procedure_date', 'Próximo procedimento'], ['milk_withdrawal_until', 'Carência de leite até (inclusive)'], ['meat_withdrawal_until', 'Carência de abate até (inclusive)']] as const).map(([key, label]) => <label key={key} className={styles.field}>{label}<input className="form-control" type="date" min={draft.date} value={draft[key]} onChange={event => change(key, event.target.value)} /></label>)}
          <p className={styles.muted}>Este registro apropria o custo informado e registra carências; não realiza baixa de medicamentos no estoque. Vacinação com consumo continua na tela de sanidade.</p>
        </>}
        <label className={styles.field}>Observações<textarea className="form-control" maxLength={2000} value={draft.notes} onChange={event => change("notes", event.target.value)} /></label>
      </div>
      <h3 className="mt-4">Participantes · {Object.keys(draft.entries).length} selecionados</h3>
      <input aria-label="Buscar participantes" className="form-control mb-3" placeholder="Buscar brinco, categoria ou grupo" value={search} onChange={event => setSearch(event.target.value)} />
      {animalError && <p className="alert alert-danger" role="alert">{animalError}</p>}
      {!loadingAnimals && !animalError && unavailable.length > 0 && <p className="alert alert-warning" role="alert">{unavailable.length} participantes não estão mais ativos nesta fazenda. <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setDraft({ ...draft, entries: Object.fromEntries(Object.entries(draft.entries).filter(([id]) => !unavailable.includes(id))) })}>Remover participantes indisponíveis</button></p>}
      {loadingAnimals ? <p role="status">Carregando animais...</p> : <div className={styles.participants}>{eligible.map(animal => {
        const selected = Object.hasOwn(draft.entries, animal.id);
        return <div className={styles.participant} key={animal.id}><label><input type="checkbox" checked={selected} onChange={event => { const entries = { ...draft.entries }; if (event.target.checked) entries[animal.id] = ""; else delete entries[animal.id]; setDraft({ ...draft, entries }); }} /> <strong>{animal.identifier}</strong><small>{animal.category} · {animal.management_group || "Sem grupo de manejo"}</small></label>{draft.kind === "weighing" && selected && <label>Peso (kg)<input aria-label={`Peso de ${animal.identifier} em kg`} required className="form-control" type="number" min="0.01" max="999999.99" step="0.01" value={draft.entries[animal.id]} onChange={event => setDraft({ ...draft, entries: { ...draft.entries, [animal.id]: event.target.value } })} /></label>}</div>;
      })}{!eligible.length && <p className={styles.empty}>{draft.farm ? "Nenhum animal elegível para este filtro." : "Escolha a fazenda para selecionar os participantes."}</p>}</div>}
      <div className={styles.footer}><button type="button" className="btn btn-outline-secondary" onClick={() => setDraft(null)}>Cancelar edição</button><button className="btn btn-success" disabled={!Object.keys(draft.entries).length || loadingAnimals || Boolean(animalError)}>{saving ? "Salvando..." : "Salvar rascunho"}</button></div>
      </fieldset>
    </form> : <>
      <div className={`${styles.toolbar} mt-3`}><select aria-label="Situação dos manejos" className="form-select w-auto" value={status} onChange={event => { setStatus(event.target.value); setPage(1); setLoading(true); setReview(null); }}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>{canWrite && <button className="btn btn-success btn-sm" onClick={() => { setError(""); setAnimalError(""); setAnimals([]); setSearch(""); setLoadingAnimals(farms.length === 1); setDraft(blank(farms.length === 1 ? farms[0].id : "")); }}>Novo manejo</button>}</div>
      {loading ? <p role="status">Carregando manejos...</p> : <div className="table-responsive"><table className={styles.table}><thead><tr>{["Data / tipo", "Descrição / fazenda", "Participantes", "Situação", "Ações"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{displayDate(row.date)}<small>{kinds[row.kind]}</small></td><td>{row.description}<small>{row.farm_name}</small></td><td>{row.entries.length}</td><td>{statuses[row.status]}</td><td><div className={styles.actions}><button className="btn btn-outline-secondary btn-sm" onClick={() => { setReview(row); setReason(""); }}>Conferir</button>{canWrite && row.status === "draft" && <button className="btn btn-outline-success btn-sm" onClick={() => edit(row)}>Editar</button>}</div></td></tr>)}</tbody></table>{!rows.length && <p className={styles.empty}>Nenhum manejo nesta situação.</p>}</div>}
      <div className={styles.pagination}><span>{count} registros · página {page}</span><button disabled={page === 1 || loading} className="btn btn-outline-secondary btn-sm" onClick={() => { setPage(value => value - 1); setLoading(true); }}>Anterior</button><button disabled={page * 30 >= count || loading} className="btn btn-outline-secondary btn-sm" onClick={() => { setPage(value => value + 1); setLoading(true); }}>Próxima</button></div>
      {review && <section className={`${styles.panel} mt-3`}><h3>Conferência · {review.description}</h3>{review.next_procedure_date && <p className="small">Acompanhamento: {({ pending: "Pendente", done: "Executado", cancelled: "Cancelado" } as Record<string, string>)[review.follow_up_status]} · {review.follow_up_note || "Sem resolução registrada"}</p>}<p>{displayDate(review.date)} · {review.farm_name} · {kinds[review.kind]} · {statuses[review.status]}</p><div className={styles.participants}>{review.entries.map(entry => <p key={entry.animal}><strong>{entry.identifier}</strong>{entry.weight_kg ? ` · ${entry.weight_kg} kg` : ""}</p>)}</div>{review.kind === "sanitary" && <p className={styles.muted}>Custo por animal: R$ {review.cost_per_animal} · Próximo procedimento: {review.next_procedure_date ? displayDate(review.next_procedure_date) : "Não programado"}<br />Carência de leite: {review.milk_withdrawal_until ? displayDate(review.milk_withdrawal_until) : "Não informada"} · Abate: {review.meat_withdrawal_until ? displayDate(review.meat_withdrawal_until) : "Não informada"}</p>}{review.notes && <p>{review.notes}</p>}{review.cancellation_reason && <p>Justificativa: {review.cancellation_reason}</p>}{review.confirmed_at && <p>Confirmado em {new Date(review.confirmed_at).toLocaleString("pt-BR")}</p>}{canWrite && review.status === "draft" && <><p>Confirmar aplica os registros a todos os participantes acima. A operação confirmada fica disponível para consulta e não pode ser apagada nesta tela.</p><button disabled={saving} className="btn btn-success" onClick={() => finish("confirm")}>{saving ? "Processando..." : "Confirmar manejo"}</button><label className={`${styles.field} mt-3`}>Justificativa para cancelar o rascunho<input maxLength={300} className="form-control" value={reason} onChange={event => setReason(event.target.value)} /></label><button disabled={saving || !reason.trim()} className="btn btn-outline-danger mt-2" onClick={() => finish("cancel")}>Cancelar rascunho</button></>}<button disabled={saving} className="btn btn-outline-secondary ms-2" onClick={() => setReview(null)}>Fechar conferência</button></section>}
    </>}
  </section>;
}
