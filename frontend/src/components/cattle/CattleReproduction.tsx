"use client";

import type { ReactNode } from "react";
import { ChartNoAxesColumnIncreasing, HeartPulse, MilkOff, Plus, Syringe, VenusAndMars, Pencil, Eye } from "lucide-react";
import { ReproducaoKpiCards } from "@/components/reproducao/ReproducaoKpiCards";
import { ReproducaoHeader, ReproducaoPhaseCards, ReproducaoPhaseTabs } from "@/components/reproducao/ReproducaoLayout";
import { ReproducaoTabContent, type TableRow, type QuickAction } from "@/components/reproducao/ReproducaoTabContent";
import type { ServerPagination } from "@/components/ui/DataTable";
import type { CattleAnimal } from "@/services/cattleService";
import { CowIcon, LactationIcon } from "./CattleIcons";
import { useOrganizationLocale, type TranslationKey } from "@/lib/locale";

const phaseIcon = (id: string, size = 20) => id === "lactating" ? <LactationIcon size={size}/> : id === "dry" ? <MilkOff size={size}/> : id === "pregnant" ? <HeartPulse size={size}/> : <CowIcon size={size}/>;

const phases = [
  { id: "heifers", labelKey: "cattleReproduction.heifers", summaryKey: "cattleReproduction.heiferSummary", icon: <CowIcon size={36} />, accent: "#e84b67", color: "#fff5f6" },
  { id: "cows", labelKey: "cattleReproduction.cows", summaryKey: "cattleReproduction.cowSummary", icon: <CowIcon size={36} />, accent: "#3978d4", color: "#f2f7ff" },
  { id: "pregnant", labelKey: "cattleReproduction.pregnant", summaryKey: "cattleReproduction.pregnantSummary", icon: <HeartPulse size={36} />, accent: "#e98727", color: "#fff8ed" },
  { id: "lactating", labelKey: "cattleReproduction.lactating", summaryKey: "cattleReproduction.lactatingSummary", icon: <LactationIcon size={36} />, accent: "#9654d8", color: "#faf3ff" },
  { id: "dry", labelKey: "cattleReproduction.dry", summaryKey: "cattleReproduction.drySummary", icon: <MilkOff size={36} />, accent: "#249253", color: "#f1fbf5" },
] as const;
const statusKeys: Record<string, TranslationKey> = {
  vazia: "cattleReproduction.empty",
  pronta: "cattleReproduction.readyMating",
  em_preparo: "cattleReproduction.preparing",
  aguardando_cobertura: "cattleReproduction.awaitingMating",
  coberta: "cattleReproduction.awaitingDiagnosis",
  gestante: "cattleReproduction.pregnant",
  lactante: "cattleReproduction.lactatingStatus",
  descanso: "cattleReproduction.resting",
};
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
  const { language, t } = useOrganizationLocale();
  const localizedPhases = phases.map(item => ({ ...item, label: t(item.labelKey), summary: t(item.summaryKey) }));
  const statuses = Object.fromEntries(Object.entries(statusKeys).map(([key, labelKey]) => [
    key,
    { label: t(labelKey), variant: key === "pronta" || key === "lactante" ? "green" : key === "coberta" ? "blue" : key === "gestante" ? "purple" : key === "vazia" ? "gray" : "amber" },
  ])) as Record<string, { label: string; variant: "green" | "amber" | "purple" | "blue" | "gray" }>;
  const phase = localizedPhases.find(item => item.id === selected);
  const cards = localizedPhases.map(item => ({ ...item, count: counts[item.id] }));
  const actions: QuickAction[] = [
    { label: t("cattleReproduction.viewHistory"), icon: <Eye size={16}/>, onClick: row => props.onHistory(animalFrom(row)) },
    ...(props.canWrite ? [
    { label: t("cattleReproduction.registerMating"), icon: <VenusAndMars size={16}/>, variant: "primary", shouldShow: row => !["coberta", "gestante"].includes(animalFrom(row).reproductive_status), onClick: row => props.onMating(animalFrom(row)) },
    { label: t("cattleReproduction.diagnosePregnancy"), icon: <Syringe size={16}/>, variant: "primary", shouldShow: row => animalFrom(row).reproductive_status === "coberta", onClick: row => props.onDiagnosis(animalFrom(row)) },
    { label: t("cattleReproduction.registerBirth"), icon: <CowIcon size={16}/>, variant: "primary", shouldShow: row => animalFrom(row).reproductive_status === "gestante", onClick: row => props.onBirth(animalFrom(row)) },
    { label: t("cattleReproduction.registerDryOff"), icon: <MilkOff size={16}/>, shouldShow: row => animalFrom(row).is_lactating, onClick: row => props.onEvent(animalFrom(row), "dry_off") },
    ...(props.manager ? [{ label: t("cattleReproduction.editAnimal"), icon: <Pencil size={16}/>, onClick: (row: TableRow) => props.onEdit(animalFrom(row)) }] : []),
  ] as QuickAction[] : []),
  ];
  return <div className="repro-dashboard" aria-busy={loading}>
    <div className="repro-breadcrumb mb-4"><nav className="d-flex align-items-center gap-2 small" style={{ color: "var(--muted-foreground)" }}><span>{t("cattleReproduction.herd")}</span><span>›</span><span className="fw-semibold text-foreground">{props.production === "dairy" ? t("cattleReproduction.dairy") : t("cattleReproduction.beef")}</span><span>›</span><span>{t("cattleReproduction.production")}</span>{phase && <><span>›</span><span className="fw-semibold" style={{ color: "var(--primary)" }}>{phase.label}</span></>}</nav></div>
    <ReproducaoHeader subtitle={t("cattleReproduction.subtitle")}>
      <div className="d-flex align-items-end flex-wrap gap-2">{props.headerActions}{onNew && ["heifers", "cows"].includes(selected) && <button className="btn btn-primary d-inline-flex align-items-center gap-2 fw-semibold px-4 py-2 shadow-sm rounded-pill transition-all hover-scale" style={{ fontSize: ".9rem", backgroundColor: "var(--primary)", borderColor: "var(--primary)" }} disabled={loading} onClick={onNew}><Plus size={18}/>{selected === "heifers" ? t("cattleReproduction.registerHeifer") : t("cattleReproduction.registerCow")}</button>}</div>
    </ReproducaoHeader>
    <ReproducaoPhaseTabs selected={selected} onSelect={onSelect} phases={[{ id: "dashboard", label: t("cattleReproduction.dashboard"), icon: <ChartNoAxesColumnIncreasing size={20}/> }, ...cards.map(card => ({ ...card, icon: <span aria-hidden="true">{card.id === "lactating" ? <LactationIcon size={20}/> : card.id === "dry" ? <MilkOff size={20}/> : card.id === "pregnant" ? <HeartPulse size={20}/> : <CowIcon size={20}/>}</span> }))]} />
    {selected === "dashboard" ? <div className="repro-overview">
      <ReproducaoKpiCards kpis={localizedPhases.map((item, index) => ({ icon: ["♀", "♀", "🤰", "💧", "⏳"][index], iconNode: <span style={{ color: item.accent }}>{phaseIcon(item.id)}</span>, label: item.label, value: counts[item.id] ?? "—", color: item.color }))}/>
      {loading && !Object.keys(counts).length ? <p role="status">{t("cattleReproduction.loading")}</p> : <ReproducaoPhaseCards phases={cards} onSelect={onSelect}/>}
      <p className="small text-muted-foreground">{t("cattleReproduction.overlapNote")}</p>
    </div> : <div className="position-relative">
      {loading && <p role="status" className="small text-muted-foreground">{t("cattleReproduction.updating")}</p>}
      <ReproducaoTabContent key={selected} columns={[
        { key: "identifier", label: t("cattleReproduction.tag") }, { key: "name", label: t("cattleReproduction.name") }, { key: "breed_name", label: t("cattleReproduction.breed") },
        { key: "current_weight_kg", label: t("cattleReproduction.weight"), render: value => value == null ? "—" : Number(value).toLocaleString(language) },
        { key: "last_mating_date", label: t("cattleReproduction.lastMating"), render: value => value ? new Date(`${String(value).slice(0,10)}T12:00:00`).toLocaleDateString(language) : "—" }, { key: "expected_birth_date", label: t("cattleReproduction.expectedBirth"), render: value => value ? new Date(`${String(value).slice(0,10)}T12:00:00`).toLocaleDateString(language) : "—" },
        { key: "is_lactating", label: t("cattleReproduction.lactation"), render: value => value ? t("cattleReproduction.inLactation") : "—" },
      ]} rows={animals.map(animal => ({ ...animal, animal }))} statusKey="reproductive_status" statusMap={statuses}
        searchPlaceholder={t("cattleReproduction.searchPlaceholder")} searchValue={search} onSearchChange={onSearch}
        filterKey="reproductive_status" filterValue={status || "all"} onFilterChange={value => onStatus(value === "all" ? "" : value)} filterOptions={Object.entries(statuses).map(([value, entry]) => ({ value, label: entry.label }))}
        pagination={pagination} actions={actions} rowKey="id" onRowClick={row => props.onHistory(animalFrom(row))}
        emptyText={loading ? "Carregando registros..." : "Nenhum animal encontrado nesta fase."}
        kpis={[{ icon: "♀", iconNode: <span style={{ color: phase?.accent }}>{phaseIcon(selected)}</span>, label: phase?.label || "Animais", value: counts[selected] ?? "—", color: phase?.color || "var(--muted)" }]}/>
    </div>}
  </div>;
}
