"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CircleUserRound, Layers3, Mars, Search, ShieldCheck, UsersRound } from "lucide-react";
import { apiClient } from "@/services/api";
import styles from "./swine-feeding.module.css";

type Target = "lotes" | "matrizes" | "marras" | "reprodutores";
type Batch = { id: string; batch_code: string; name?: string; category?: string; phase?: string; quantity?: number; status?: string; species_code?: string };
type Animal = { id: string; identifier: string; category?: string; reproductive_status?: string; status?: string; species_code?: string };
type Feed = { id: string; nome: string; estoque_atual?: string; unidade_display?: string; custo_medio?: string; custo_unitario?: string; valor_unitario?: string };
type Entry = { id: string; data_inicio: string; data_fim: string; categoria_destino?: string; fase_destino?: string; lote_codigo?: string; animais_identificadores?: string[]; item_nome: string; quantidade: number; custo_unitario: number; custo_total: number; usuario_nome?: string };

const targetOptions = [
  { id: "lotes" as const, title: "Lotes", description: "Alimente os lotes por fase de produção", icon: Layers3, tone: "green" },
  { id: "matrizes" as const, title: "Matrizes", description: "Alimente matrizes por fase reprodutiva", icon: CircleUserRound, tone: "purple" },
  { id: "marras" as const, title: "Marrãs", description: "Alimente marrãs por categoria", icon: UsersRound, tone: "orange" },
  { id: "reprodutores" as const, title: "Reprodutores", description: "Alimente reprodutores individualmente", icon: Mars, tone: "blue" },
];
const phaseOptions: Record<Target, Array<{ id: string; label: string }>> = {
  lotes: [{ id: "creche", label: "Creche" }, { id: "crescimento", label: "Crescimento" }, { id: "engorda", label: "Engorda" }],
  matrizes: [{ id: "vazia", label: "Vazia" }, { id: "gestante", label: "Gestante" }, { id: "lactante", label: "Lactante" }],
  marras: [{ id: "marras", label: "Marrãs" }],
  reprodutores: [{ id: "reprodutor", label: "Reprodutor" }],
};
const today = () => new Date().toISOString().slice(0, 10);
const formatMoney = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function SwineFeedingDashboard() {
  const [target, setTarget] = useState<Target>("lotes");
  const [phase, setPhase] = useState("creche");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedAnimals, setSelectedAnimals] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [feed, setFeed] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    const [batchRes, animalRes, feedRes, historyRes] = await Promise.all([
      apiClient.get("/livestock/batches/?especie=suino&page_size=500"),
      apiClient.get("/livestock/animals/?page_size=500"),
      apiClient.get("/inventory/items/all_items/?categoria=racao"),
      apiClient.get("/inventory/consumos/?especie=suinos&page_size=100"),
    ]);
    setBatches(batchRes.data.results || batchRes.data || []);
    setAnimals((animalRes.data.results || animalRes.data || []).filter((item: Animal) => item.species_code === "suinos"));
    setFeeds(feedRes.data || []);
    setEntries(historyRes.data.results || historyRes.data || []);
  };

  useEffect(() => {
    Promise.all([
      apiClient.get("/livestock/batches/?especie=suino&page_size=500"),
      apiClient.get("/livestock/animals/?page_size=500"),
      apiClient.get("/inventory/items/all_items/?categoria=racao"),
      apiClient.get("/inventory/consumos/?especie=suinos&page_size=100"),
    ]).then(([batchRes, animalRes, feedRes, historyRes]) => {
      setBatches(batchRes.data.results || batchRes.data || []);
      setAnimals((animalRes.data.results || animalRes.data || []).filter((item: Animal) => item.species_code === "suinos"));
      setFeeds(feedRes.data || []);
      setEntries(historyRes.data.results || historyRes.data || []);
    }).catch(() => setMessage("Não foi possível carregar todos os dados de alimentação."));
  }, []);

  const availableBatches = useMemo(() => batches.filter((batch) => {
    if (batch.status && batch.status !== "active") return false;
    const normalized = `${batch.phase || ""} ${batch.category || ""}`.toLowerCase();
    return normalized.includes(phase === "creche" ? "creche" : phase === "crescimento" ? "crescimento" : "engorda") || (!batch.phase && target === "lotes");
  }), [batches, phase, target]);
  const availableAnimals = useMemo(() => animals.filter((animal) => {
    const category = (animal.category || "").toLowerCase();
    const status = (animal.reproductive_status || "").toLowerCase();
    const categoryMatch = target === "matrizes" ? category.includes("matriz") : target === "marras" ? category.includes("marr") : category.includes("reprodutor") || category.includes("cachaço");
    const phaseMatch = target !== "matrizes" || status === phase;
    return animal.status !== "dead" && animal.status !== "sold" && categoryMatch && phaseMatch && animal.identifier.toLowerCase().includes(search.toLowerCase());
  }), [animals, phase, search, target]);
  const selectedFeed = feeds.find((item) => item.id === feed);
  const unitCost = Number(selectedFeed?.custo_medio || selectedFeed?.custo_unitario || selectedFeed?.valor_unitario || 0);
  const totalCost = Number(quantity || 0) * unitCost;
  const selectedBatchData = availableBatches.find((item) => item.id === selectedBatch);

  const toggleAnimal = (id: string) => setSelectedAnimals((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const changeTarget = (nextTarget: Target) => {
    setTarget(nextTarget); setPhase(phaseOptions[nextTarget][0].id);
    setSelectedBatch(""); setSelectedAnimals([]); setSearch("");
  };
  const save = async () => {
    if (!feed || !quantity || (target === "lotes" ? !selectedBatch : !selectedAnimals.length)) { setMessage("Preencha o destino, a ração e a quantidade consumida."); return; }
    try {
      setSaving(true); setMessage("");
      await apiClient.post("/inventory/consumos/", {
        lote_animal: target === "lotes" ? selectedBatch : null,
        animais: target === "lotes" ? [] : selectedAnimals,
        categoria_destino: target,
        fase_destino: phase,
        item_estoque: feed,
        data_inicio: startDate,
        data_fim: endDate,
        quantidade: Number(quantity),
        tipo_registro: "total_periodo",
      });
      setQuantity(""); setSelectedAnimals([]); setMessage("Consumo registrado com sucesso."); await load();
    } catch { setMessage("Não foi possível salvar. Verifique o estoque disponível e tente novamente."); }
    finally { setSaving(false); }
  };

  return <div className={styles.page}>
    <header className={styles.title}><div><h1>Alimentação dos Animais</h1><p>Registre e acompanhe o consumo de ração dos seus animais de forma rápida e prática.</p></div></header>
    <section className={styles.panel}><h2>1. O que você deseja alimentar?</h2><div className={styles.targets}>{targetOptions.map(({ icon: Icon, ...option }) => <button key={option.id} data-active={target === option.id} data-tone={option.tone} onClick={() => changeTarget(option.id)}><span><Icon /></span><div><strong>{option.title}</strong><small>{option.description}</small></div></button>)}</div></section>

    <section className={styles.panel}>
      <h2>2. {target === "lotes" ? "Selecione a fase e o lote" : target === "matrizes" ? "Fase produtiva das matrizes" : `Selecionar ${target}`}</h2>
      <div className={styles.selectionLayout}>
        <div className={styles.phases}>{phaseOptions[target].map((item) => <button key={item.id} data-active={phase === item.id} onClick={() => { setPhase(item.id); setSelectedAnimals([]); }}><ShieldCheck />{item.label}</button>)}</div>
        {target === "lotes" ? <div className={styles.batchSelection}><label>Selecione o lote<select value={selectedBatch} onChange={(event) => setSelectedBatch(event.target.value)}><option value="">Selecione...</option>{availableBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.batch_code} — {batch.name || batch.category}</option>)}</select></label>{selectedBatchData && <aside><UsersRound /><span><b>{selectedBatchData.quantity || 0} animais</b> no lote</span></aside>}</div> : <div className={styles.animalsArea}>
          <div className={styles.animalToolbar}><label><input type="checkbox" checked={availableAnimals.length > 0 && selectedAnimals.length === availableAnimals.length} onChange={(event) => setSelectedAnimals(event.target.checked ? availableAnimals.map((item) => item.id) : [])} /> Selecionar todos</label><div><Search /><input placeholder={`Buscar ${target.slice(0, -1)}...`} value={search} onChange={(event) => setSearch(event.target.value)} /></div></div>
          <div className={styles.selectedBadge}>{selectedAnimals.length} {target} selecionado{selectedAnimals.length === 1 ? "" : "s"}</div>
          <div className={styles.animalTable}><div className={styles.animalHead}><span></span><b>Código</b><b>Categoria</b><b>Fase</b><b>Status</b></div>{availableAnimals.map((animal) => <label key={animal.id}><input type="checkbox" checked={selectedAnimals.includes(animal.id)} onChange={() => toggleAnimal(animal.id)} /><b>{animal.identifier}</b><span>{animal.category}</span><span>{phaseOptions[target].find((item) => item.id === phase)?.label}</span><em>Ativo</em></label>)}{!availableAnimals.length && <p>Nenhum animal encontrado nesta fase.</p>}</div>
        </div>}
      </div>
    </section>

    <section className={styles.panel}><h2>3. Novo lançamento de consumo</h2><div className={styles.consumptionForm}>
      <label>Ração utilizada<select value={feed} onChange={(event) => setFeed(event.target.value)}><option value="">Selecione a ração...</option>{feeds.map((item) => <option key={item.id} value={item.id}>{item.nome} — saldo {item.estoque_atual || 0} {item.unidade_display || ""}</option>)}</select></label>
      <label>Data inicial<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>Data final<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
      <label>Quantidade consumida<div className={styles.quantity}><input type="number" min="0" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} /><span>kg</span></div></label>
      <label>Custo total<input value={formatMoney(totalCost)} readOnly /></label><button onClick={save} disabled={saving}><Check />{saving ? "Salvando..." : "Salvar consumo"}</button>
    </div>{message && <p className={message.includes("sucesso") ? styles.success : styles.message}>{message}</p>}<small className={styles.stockHint}>{selectedFeed ? "Ração cadastrada no estoque" : "Selecione uma ração disponível no estoque"}</small></section>

    <section className={styles.panel}><h2>4. Últimos lançamentos</h2><div className={styles.history}><table><thead><tr><th>Data</th><th>Destino</th><th>Fase/Categoria</th><th>Lote/Animais</th><th>Ração</th><th>Quantidade</th><th>Custo/kg</th><th>Custo total</th><th>Usuário</th></tr></thead><tbody>{entries.slice(0, 12).map((entry) => <tr key={entry.id}><td>{new Date(`${entry.data_inicio}T12:00:00`).toLocaleDateString("pt-BR")}</td><td>{entry.categoria_destino || "Lote"}</td><td>{entry.fase_destino || "-"}</td><td>{entry.lote_codigo || entry.animais_identificadores?.slice(0, 3).join(", ") || "-"}</td><td>{entry.item_nome}</td><td>{Number(entry.quantidade).toLocaleString("pt-BR")} kg</td><td>{formatMoney(Number(entry.custo_unitario))}</td><td><b>{formatMoney(Number(entry.custo_total))}</b></td><td>{entry.usuario_nome || "-"}</td></tr>)}</tbody></table>{!entries.length && <p>Nenhum lançamento registrado.</p>}</div></section>
  </div>;
}
