"use client";

import type { ReactNode } from "react";
import { ChartNoAxesColumnIncreasing, HeartPulse, MilkOff, Plus, Syringe, VenusAndMars, Pencil, Eye } from "lucide-react";
import { ReproducaoKpiCards } from "@/components/reproducao/ReproducaoKpiCards";
import { ReproducaoHeader, ReproducaoPhaseCards, ReproducaoPhaseTabs } from "@/components/reproducao/ReproducaoLayout";
import { ReproducaoTabContent, type TableRow, type QuickAction } from "@/components/reproducao/ReproducaoTabContent";
import type { ServerPagination } from "@/components/ui/DataTable";
import type { CattleAnimal } from "@/services/cattleService";
import { CowIcon, LactationIcon } from "./CattleIcons";

const phaseIcon = (id: string, size = 20) => id === "lactating" ? <LactationIcon size={size}/> : id === "dry" ? <MilkOff size={size}/> : id === "pregnant" ? <HeartPulse size={size}/> : <CowIcon size={size}/>;

const phases = [
  { id: "heifers", label: "Novilhas", summary: "Preparação e primeira cobertura", icon: <CowIcon size={36} />, accent: "#e84b67", color: "#fff5f6" },
  { id: "cows", label: "Vacas", summary: "Matrizes e acompanhamento reprodutivo", icon: <CowIcon size={36} />, accent: "#3978d4", color: "#f2f7ff" },
  { id: "pregnant", label: "Gestantes", summary: "Prenhez e previsão de parto", icon: <HeartPulse size={36} />, accent: "#e98727", color: "#fff8ed" },
  { id: "lactating", label: "Lactantes", summary: "Lactação e acompanhamento da matriz", icon: <LactationIcon size={36} />, accent: "#9654d8", color: "#faf3ff" },
  { id: "dry", label: "Vacas secas", summary: "Secagem e período de descanso", icon: <MilkOff size={36} />, accent: "#249253", color: "#f1fbf5" },
];
const statuses: Record<string, { label: string; variant: "green" | "amber" | "purple" | "blue" | "gray" }> = {
  vazia: { label: "Vazia", variant: "gray" }, pronta: { label: "Pronta para cobertura", variant: "green" },
  em_preparo: { label: "Em preparo", variant: "amber" }, aguardando_cobertura: { label: "Aguardando cobertura", variant: "amber" },
  coberta: { label: "Aguardando diagnóstico", variant: "blue" }, gestante: { label: "Gestante", variant: "purple" },
  lactante: { label: "Lactante", variant: "green" }, descanso: { label: "Descanso / seca", variant: "amber" },
};
const date = (value: unknown) => value ? new Date(`${String(value).slice(0,10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const animalFrom = (row: TableRow) => row.animal as CattleAnimal;

type Props = {
  counts: Record<string, number>; selected: string; onSelect: (value: string) => void; loading: boolean;
  production?: "beef" | "dairy"; headerActions: ReactNode; onNew?: () => void;
  animals: CattleAnimal[]; pagination: ServerPagination; search: string; onSearch: (value: string) => void;
  status: string; onStatus: (value: string) => void; canWrite: boolean; manager: boolean;
  onMating: (animal: CattleAnimal) => void; onDiagnosis: (animal: CattleAnimal) => void;
  onBirth: (animal: CattleAnimal) => void; onEvent: (animal: CattleAnimal, kind: string) => void;
  onHistory: (animal: CattleAnimal) => void; onEdit: (animal: CattleAnimal) => void;
};

export function CattleReproduction(props: Props) {
  const { counts, selected, onSelect, loading, onNew, animals, pagination, search, onSearch, status, onStatus } = props;
  const phase = phases.find(item => item.id === selected);
  const cards = phases.map(item => ({ ...item, count: counts[item.id] }));
  const actions: QuickAction[] = [
    { label: "Ver ficha e histórico", icon: <Eye size={16}/>, onClick: row => props.onHistory(animalFrom(row)) },
    ...(props.canWrite ? [
    { label: "Registrar cobertura / IA", icon: <VenusAndMars size={16}/>, variant: "primary", shouldShow: row => !["coberta", "gestante"].includes(animalFrom(row).reproductive_status), onClick: row => props.onMating(animalFrom(row)) },
    { label: "Diagnóstico de gestação", icon: <Syringe size={16}/>, variant: "primary", shouldShow: row => animalFrom(row).reproductive_status === "coberta", onClick: row => props.onDiagnosis(animalFrom(row)) },
    { label: "Registrar parto", icon: <CowIcon size={16}/>, variant: "primary", shouldShow: row => animalFrom(row).reproductive_status === "gestante", onClick: row => props.onBirth(animalFrom(row)) },
    { label: "Registrar secagem", icon: <MilkOff size={16}/>, shouldShow: row => animalFrom(row).is_lactating, onClick: row => props.onEvent(animalFrom(row), "dry_off") },
    ...(props.manager ? [{ label: "Editar cadastro", icon: <Pencil size={16}/>, onClick: (row: TableRow) => props.onEdit(animalFrom(row)) }] : []),
  ] as QuickAction[] : []),
  ];
  return <div className="repro-dashboard" aria-busy={loading}>
    <div className="repro-breadcrumb mb-4"><nav className="d-flex align-items-center gap-2 small" style={{ color: "var(--muted-foreground)" }}><span>Rebanho</span><span>›</span><span className="fw-semibold text-foreground">{props.production === "dairy" ? "Pecuária leiteira" : "Gado de corte"}</span><span>›</span><span>Reprodução</span>{phase && <><span>›</span><span className="fw-semibold" style={{ color: "var(--primary)" }}>{phase.label}</span></>}</nav></div>
    <ReproducaoHeader subtitle="Gestão do ciclo reprodutivo bovino e acompanhamento das matrizes">
      <div className="d-flex align-items-end flex-wrap gap-2">{props.headerActions}{onNew && ["heifers", "cows"].includes(selected) && <button className="btn btn-primary d-inline-flex align-items-center gap-2 fw-semibold px-4 py-2 shadow-sm rounded-pill transition-all hover-scale" style={{ fontSize: ".9rem", backgroundColor: "var(--primary)", borderColor: "var(--primary)" }} disabled={loading} onClick={onNew}><Plus size={18}/>{selected === "heifers" ? "Cadastrar novilha" : "Cadastrar vaca"}</button>}</div>
    </ReproducaoHeader>
    <ReproducaoPhaseTabs selected={selected} onSelect={onSelect} phases={[{ id: "dashboard", label: "Dashboard", icon: <ChartNoAxesColumnIncreasing size={20}/> }, ...cards.map(card => ({ ...card, icon: <span aria-hidden="true">{card.id === "lactating" ? <LactationIcon size={20}/> : card.id === "dry" ? <MilkOff size={20}/> : card.id === "pregnant" ? <HeartPulse size={20}/> : <CowIcon size={20}/>}</span> }))]} />
    {selected === "dashboard" ? <div className="repro-overview">
      <ReproducaoKpiCards kpis={phases.map((item, index) => ({ icon: ["♀", "♀", "🤰", "💧", "⏳"][index], iconNode: <span style={{ color: item.accent }}>{phaseIcon(item.id)}</span>, label: item.label, value: counts[item.id] ?? "—", color: item.color }))}/>
      {loading && !Object.keys(counts).length ? <p role="status">Carregando reprodução…</p> : <ReproducaoPhaseCards phases={cards} onSelect={onSelect}/>}
      <p className="small text-muted-foreground">Categorias e situações podem se sobrepor: uma vaca pode estar gestante e lactante. Os indicadores abrangem o cadastro bovino ativo da fazenda selecionada.</p>
    </div> : <div className="position-relative">
      {loading && <p role="status" className="small text-muted-foreground">Atualizando registros…</p>}
      <ReproducaoTabContent key={selected} columns={[
        { key: "identifier", label: "Brinco" }, { key: "name", label: "Nome" }, { key: "breed_name", label: "Raça" },
        { key: "current_weight_kg", label: "Peso (kg)", render: value => value == null ? "—" : Number(value).toLocaleString("pt-BR") },
        { key: "last_mating_date", label: "Última cobertura / IA", render: date }, { key: "expected_birth_date", label: "Parto previsto", render: date },
        { key: "is_lactating", label: "Lactação", render: value => value ? "Em lactação" : "—" },
      ]} rows={animals.map(animal => ({ ...animal, animal }))} statusKey="reproductive_status" statusMap={statuses}
        searchPlaceholder="Buscar por brinco, nome ou lote..." searchValue={search} onSearchChange={onSearch}
        filterKey="reproductive_status" filterValue={status || "all"} onFilterChange={value => onStatus(value === "all" ? "" : value)} filterOptions={Object.entries(statuses).map(([value, entry]) => ({ value, label: entry.label }))}
        pagination={pagination} actions={actions} rowKey="id" onRowClick={row => props.onHistory(animalFrom(row))}
        emptyText={loading ? "Carregando registros..." : "Nenhum animal encontrado nesta fase."}
        kpis={[{ icon: "♀", iconNode: <span style={{ color: phase?.accent }}>{phaseIcon(selected)}</span>, label: phase?.label || "Animais", value: counts[selected] ?? "—", color: phase?.color || "var(--muted)" }]}/>
    </div>}
  </div>;
}
