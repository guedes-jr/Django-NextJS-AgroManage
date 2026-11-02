"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { cattleHref, cattleRoot } from "@/services/cattleNavigation";
import { useRouter } from "next/navigation";
import { CowIcon, BullIcon, CowIcon as CattleIcon, LactationIcon } from "./CattleIcons";
import homeStyles from "@/components/livestock/species-module-home.module.css";
import { LayoutDashboard, Tags, Scale, HeartPulse, VenusAndMars, Venus, Mars, Layers3, ClipboardCheck, Wheat, Syringe, MapPin, Milk, BadgeDollarSign, ChartNoAxesCombined, RefreshCw, Plus, ChevronRight, MoreHorizontal, Search, ClipboardList, CheckCircle2 } from "lucide-react";
import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";
import { Modal } from "@/components/ui/Modal";
import { clinicalService } from "@/services/clinicalService";
import { cattleService, cattleError, type CattleAnimal, type CattleBatchResult, type CattleBatch, type CattlePasture, type CattleGrazing, type CattleMilk, type CattleHistory, type CattleOverview, type CattleFeed, type CattleResource, type CattleAgendaEvent } from "@/services/cattleService";
import { CattleForm, type CattleField, type CattleFormSpec } from "./CattleForm";
import styles from "./cattle.module.css";
import { CattleAgenda } from "./CattleAgenda";
import { CattleFeedingReport } from "./CattleFeedingReport";
import { CattleNutrition } from "./CattleNutrition";
import { CattleGenealogy } from "./CattleGenealogy";
import { CattleReproductionForm } from "./CattleReproductionForm";
import { CattleReproduction } from "./CattleReproduction";
import { cattleOperations, type StockLotOption } from "@/services/cattleOperationsService";
import { CattleManagementWorkspace } from "./CattleManagementWorkspace";

export type CattleView = "overview" | "animals" | "batches" | "weights" | "reproduction" | "health" | "pastures" | "grazings" | "milk" | "sales" | "feeding" | "reports" | "management";
type Row = CattleAnimal | CattleBatch | CattlePasture | CattleGrazing | CattleMilk | CattleFeed;
const root = cattleRoot;
const modules = [
  { id: "overview", label: "Visão geral", href: root, icon: LayoutDashboard, description: "Indicadores do rebanho de corte e leite" },
  { id: "animals", label: "Cadastro", href: `${root}/cadastro`, icon: ClipboardList, description: "Animais, matrizes e lotes" },
  { id: "batches", label: "Lotes", href: `${root}/lotes`, icon: Tags, description: "Cria, recria, engorda e reprodução" },
  { id: "management", label: "Manejos", href: `${root}/manejos`, icon: ClipboardCheck, description: "Pesagens, sanidade e castração com conferência e confirmação" },
  { id: "weights", label: "Pesagens", href: `${root}/pesagens`, icon: Scale, description: "Peso atual, evolução e ganho médio diário" },
  { id: "reproduction", label: "Reprodução", href: `${root}/reproducao`, icon: VenusAndMars, description: "Coberturas, diagnóstico, partos e bezerras/os" },
  { id: "health", label: "Sanidade", href: `${root}/sanidade`, icon: HeartPulse, description: "Vacinas, exames, tratamentos e ocorrências" },
  { id: "pastures", label: "Pastagens", href: `${root}/pastos`, icon: MapPin, description: "Piquetes, área e ocupação por lote" },
  { id: "operations", label: "Central de manejo", href: `${root}/operacoes`, icon: ClipboardList, description: "Finalidade, transferências, ocorrências, importação e protocolos" },
  { id: "milk", label: "Leite", href: `${root}/leite`, icon: Milk, description: "Ordenhas por vaca e turno, produção e descarte" },
  { id: "feed-entry", label: "Lançar ração", href: `${root}/racao/tratos`, icon: Wheat, description: "Registre o fornecimento por lote com baixa no estoque" },
  { id: "medication-entry", label: "Aplicar medicamentos", href: `${root}/manejos?launch=medication`, icon: Syringe, description: "Registre aplicações, doses e períodos de carência" },
  { id: "feeding", label: "Alimentação", href: `${root}/racao`, icon: Wheat, description: "Consumo, fórmulas e produção de ração" },
  { id: "sales", label: "Vendas", href: `${root}/vendas`, icon: BadgeDollarSign, description: "Venda de lotes e receitas no financeiro" },
  { id: "reports", label: "Relatórios", href: `${root}/relatorios`, icon: ChartNoAxesCombined, description: "Inventário, alimentação, custos e resultados do rebanho" },
];
const moduleTones: Record<string, string> = { "feed-entry": "orange", "medication-entry": "emerald", animals: "green", batches: "orange", pastures: "emerald", management: "slate", weights: "blue", reproduction: "purple", health: "green", milk: "cyan", feeding: "blue", sales: "emerald", reports: "cyan" };
const categories = ["Bezerro", "Garrote", "Novilha", "Touro", "Matriz", "Vaca", "Terminação", "Reprodutor"];
const phases: Record<string, string> = { creche: "Cria", crescimento: "Recria", engorda: "Engorda", reproducao: "Reprodução" };
const statuses: Record<string, string> = { active: "Ativo", sold: "Vendido", finished: "Encerrado", dead: "Morto", em_preparo: "Em preparo", vazia: "Vazia", pronta: "Pronta", coberta: "Aguardando diagnóstico", gestante: "Gestante", lactante: "Em lactação", descanso: "Em descanso", ativa: "Ativo", aguardando_cobertura: "Aguardando cobertura" };
const sessions: Record<string, string> = { morning: "Manhã", afternoon: "Tarde", evening: "Noite" };
const number = (value: unknown) => value === undefined || value === null ? "—" : Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const date = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
const options = (values: string[] | Record<string, string>) => Array.isArray(values) ? values.map(value => ({ value, label: value })) : Object.entries(values).map(([value, label]) => ({ value, label }));
const notes: CattleField = { name: "notes", label: "Observações", type: "textarea" };
const dayField: CattleField = { name: "date", label: "Data", type: "date", required: true };
const positive = (name: string, label: string, required = true): CattleField => ({ name, label, type: "number", min: "0.01", step: "0.01", required });
const payload = (values: Record<string, string>) => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ""));
function Table({ columns, children }: { columns: string[]; children: ReactNode }) { return <div className="table-responsive"><table className={styles.table}><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }

function animalAge(birth?: string | null) {
  if (!birth) return "—";
  const born = new Date(`${birth}T12:00:00`);
  const now = new Date();
  if (Number.isNaN(born.getTime()) || born > now) return "—";
  const months = (now.getFullYear() - born.getFullYear()) * 12 + now.getMonth() - born.getMonth() - (now.getDate() < born.getDate() ? 1 : 0);
  if (months < 1) return "Menos de 1 mês";
  if (months < 12) return `${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? "ano" : "anos"}`;
}

function DairyAnimalStatus({ animal }: { animal: CattleAnimal }) {
  if (animal.status !== "active") return <span className={styles.animalBadge} data-tone="muted">{statuses[animal.status] || animal.status}</span>;
  return <div className={styles.animalBadges}>
    {animal.is_lactating && <span className={styles.animalBadge} data-tone="green">Lactação</span>}
    {animal.gender === "F" && animal.reproductive_status === "gestante" && <span className={styles.animalBadge} data-tone="blue">Gestante</span>}
    {!animal.is_lactating && animal.gender === "F" && animal.reproductive_status === "descanso" && <span className={styles.animalBadge} data-tone="amber">Seca</span>}
    {!animal.is_lactating && !(animal.gender === "F" && ["gestante", "descanso"].includes(animal.reproductive_status)) && <span className={styles.animalBadge} data-tone="muted">{animal.gender === "M" ? "Ativo" : statuses[animal.reproductive_status] || "Ativa"}</span>}
  </div>;
}

function AnimalRowActions({ compact, identifier, children }: { compact: boolean; identifier: string; children: ReactNode }) {
  if (!compact) return <div className={styles.actions}>{children}</div>;
  return <details className={styles.rowMenu}>
    <summary aria-label={`Ações do animal ${identifier}`} title="Ações do animal"><MoreHorizontal size={19} aria-hidden="true"/></summary>
    <div className={styles.rowMenuItems} onClick={event => {
      if ((event.target as HTMLElement).closest("button")) (event.currentTarget.parentElement as HTMLDetailsElement).open = false;
    }}>{children}</div>
  </details>;
}

export function CattleWorkspace({ view = "overview", production, youngFemales = false, dairyAnimals = false, initialReproductionTab = "dashboard", initialMedication = false }: { initialMedication?: boolean; initialReproductionTab?: string; view?: CattleView; production?: "beef" | "dairy"; youngFemales?: boolean; dairyAnimals?: boolean }) {
  const router = useRouter();
  const access = useOrganizationAccess();
  const operator = access?.role === "operator";
  const canWrite = !!access && !access.read_only;
  const manager = !!access && !operator;
  const [resultError, setResultError] = useState("");
  const [resultBatchId, setResultBatchId] = useState("");
  const [resultYield, setResultYield] = useState("");
  const [batchResult, setBatchResult] = useState<CattleBatchResult | null>(null);
  const [overview, setOverview] = useState<CattleOverview | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [farms, setFarms] = useState<{ id: string; name: string }[]>([]);
  const [sales, setSales] = useState<Awaited<ReturnType<typeof cattleService.sales>>>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [category, setCategory] = useState("");
  const [reproductionPageSize, setReproductionPageSize] = useState(10);
  const [reproductionStatus, setReproductionStatus] = useState("");
  const [reproductionGroup, setReproductionGroup] = useState(initialReproductionTab);
  const [reproductionCounts, setReproductionCounts] = useState<Record<string, number>>({});
  const [dairyTab, setDairyTab] = useState("all");
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [farm, setFarm] = useState("");
  const [withdrawal, setWithdrawal] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<CattleFormSpec | null>(null);
  const [historyAnimal, setHistoryAnimal] = useState<CattleAnimal | null>(null);
  const [history, setHistory] = useState<CattleHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const resource: CattleResource = view === "batches" || view === "sales" ? "batches" : view === "milk" ? "milk" : view === "feeding" ? "feed" : view === "pastures" ? "pastures" : view === "grazings" ? "grazings" : "animals";

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      const params: Record<string, string | number> = { page, search };
      if (production && ["animals", "batches"].includes(resource)) params.production = production;
      if ((resource === "animals" || resource === "batches") && status) params.status = status;
      if (farm) params.farm = farm;
      if (resource === "animals" && withdrawal) params.withdrawal = withdrawal;
      if (resource === "animals" && category) params.category = category;
      if (view === "reproduction") { params.gender = "F"; params.status = "active"; params.page_size = reproductionPageSize; if (reproductionStatus) params.reproductive_status = reproductionStatus; if (reproductionGroup !== "dashboard") params.reproduction_group = reproductionGroup; }
      if (youngFemales) params.young_females = "true";
      const countParams = { ...params };
      if (dairyAnimals) params.dairy_category = dairyTab;
      Promise.all([
        cattleService.overview(controller.signal, farm, production),
        cattleService.farms(controller.signal),
        (["overview", "reports", "management"].includes(view) || (view === "reproduction" && reproductionGroup === "dashboard")) ? Promise.resolve(null) : cattleService.list<Row>(resource, params, controller.signal),
        view === "sales" && manager ? cattleService.sales(controller.signal, farm, production) : Promise.resolve([]),
        dairyAnimals ? cattleService.categoryCounts(countParams, controller.signal) : Promise.resolve({}),
        view === "reproduction" ? cattleService.reproductionSummary({ ...(farm ? { farm } : {}), ...(production ? { production } : {}) }, controller.signal) : Promise.resolve({}),
      ]).then(([summary, farms, data, sales, counts, reproduction]) => {
        if (controller.signal.aborted) return;
        setReproductionCounts(reproduction); setCategoryCounts(counts); setOverview(summary); setFarms(farms); setRows(data?.results || []); setCount(data?.count || 0); setSales(sales);
      }).catch(error => { if (!controller.signal.aborted) { setRows([]); setError(cattleError(error)); } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [view, resource, page, search, status, category, farm, withdrawal, refresh, manager, youngFemales, dairyAnimals, dairyTab, reproductionGroup, reproductionPageSize, reproductionStatus, production]);

  useEffect(() => {
    if (!historyAnimal) return;
    const controller = new AbortController();
    cattleService.history(historyAnimal.id, controller.signal).then(data => { if (!controller.signal.aborted) setHistory(data); })
      .catch(error => { if (!controller.signal.aborted) setHistoryError(cattleError(error)); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [historyAnimal]);

  const farmField: CattleField = { name: "farm_id", label: "Fazenda", type: "select", required: true, options: farms.map(farm => ({ value: farm.id, label: farm.name })) };
  const farmInitial = farm || (farms.length === 1 ? farms[0].id : "");
  const openHistory = (animal: CattleAnimal) => { setHistory([]); setHistoryError(""); setHistoryLoading(true); setHistoryAnimal(animal); };
  async function resolveAnimal(values: Record<string, string>) {
    const data = await cattleService.list<CattleAnimal>("animals", { identifier: values.identifier.trim(), farm: values.farm_id, status: "active" });
    if (data.results.length !== 1) throw { response: { data: { detail: "Brinco não encontrado nesta fazenda. Cadastre o animal antes de registrar a ordenha." } } };
    return data.results[0];
  }
  async function animalForm(animal?: CattleAnimal, preset: { gender?: "F" | "M"; category?: string } = {}) {
    setPreparing(true); setError("");
    try {
      const batches = await cattleService.all<CattleBatch>("batches", { status: "active" });
      const editing = !!animal;
      const fields: CattleField[] = [
        { ...farmField, section: "animal", readOnly: editing },
        { name: "name", label: "Nome", maxLength: 100, section: "animal" },
        { name: "identifier", label: "Brinco / identificação", required: true, maxLength: 50, section: "animal" },
        { name: "breed_name_input", label: "Raça", section: "animal", readOnly: editing },
        { name: "coat_color", label: "Cor / pelagem", maxLength: 80, section: "animal" },
        { name: "gender", label: "Sexo", type: "select", required: true, options: options({ F: "Fêmea", M: "Macho" }), section: "animal", readOnly: editing },
        { name: "category", label: "Categoria", type: "select", required: true, options: options(categories), section: "animal" },
        { name: "batch", label: "Lote de origem (opcional)", type: "select", section: "animal", dependsOn: "farm_id", options: batches.map(row => ({ value: row.id, label: row.batch_code, parentValue: row.farm_id })), readOnly: editing },
        { name: "sire_identifier_input", label: "Brinco do pai cadastrado", section: "genealogy", maxLength: 50 },
        { name: "dam_identifier_input", label: "Brinco da mãe cadastrada", section: "genealogy", maxLength: 50 },
        { name: "sire_name", label: "Pai externo (nome / registro)", section: "genealogy" },
        { name: "dam_name", label: "Mãe externa (nome / registro)", section: "genealogy" },
        { name: "birth_date", label: "Nascimento", type: "date", max: today(), section: "development" },
        { name: "entry_date", label: "Entrada na fazenda", type: "date", required: true, max: today(), section: "development", readOnly: editing },
        { ...positive("birth_weight_kg", "Peso ao nascer (kg)", false), section: "development" },
        ...(!editing ? [{ name: "initial_weaning_date", label: "Desmame anterior (se conhecido)", type: "date" as const, max: today(), section: "development" }] : []),
        { ...positive("initial_weight_kg", editing ? "Peso de entrada (kg)" : "Peso na entrada (kg)", false), section: "development", readOnly: editing },
        ...(editing ? [{ name: "current_weight_kg", label: "Peso atual registrado (kg)", type: "number" as const, readOnly: true, section: "development" }, { name: "weaning_date", label: "Desmame registrado", type: "date" as const, readOnly: true, section: "development" }] : []),
        { name: "reproductive_status", label: editing ? "Status reprodutivo registrado" : "Situação inicial", visibleWhen: { field: "gender", value: "F" }, type: "select", options: options(editing ? statuses : { vazia: "Vazia", em_preparo: "Em preparo", pronta: "Pronta para cobertura", lactante: "Em lactação / com cria", descanso: "Pós-parto / descanso" }), section: "reproduction", readOnly: editing },
        { name: "historical_birth_count", label: "Partos anteriores ao cadastro (informados)", type: "number", min: "0", max: "32767", step: "1", visibleWhen: { field: "gender", value: "F" }, section: "reproduction" },
        { name: "historical_last_birth_date", label: "Último parto anterior (informado)", type: "date", max: today(), visibleWhen: { field: "gender", value: "F" }, section: "reproduction" },
        ...(editing ? [{ name: "birth_count", label: "Partos registrados no sistema", type: "number" as const, readOnly: true, section: "reproduction" }, { name: "last_mating_date", label: "Última cobertura / IA registrada", type: "date" as const, readOnly: true, section: "reproduction" }, { name: "expected_birth_date", label: "Previsão de parto registrada", type: "date" as const, readOnly: true, section: "reproduction" }, { name: "gestation_days", label: "Dias de gestação", type: "number" as const, readOnly: true, section: "reproduction" }] : []),
        { name: "genealogical_registration", label: "Registro genealógico (RGD)", maxLength: 80, section: "additional" },
        { name: "embryo_role", label: "Função embrionária", type: "select", options: options({ donor: "Doadora", recipient: "Receptora" }), visibleWhen: { field: "gender", value: "F" }, section: "additional" },
        { name: "cattle_purpose", label: "Finalidade produtiva", type: "select", options: options({ unknown: "Não informado", beef: "Corte", dairy: "Leite", dual: "Dupla finalidade" }), section: "animal" },
        { name: "dairy_aptitude", label: "Aptidão leiteira", type: "checkbox", section: "additional" },
        { name: "beef_aptitude", label: "Aptidão de corte", type: "checkbox", section: "additional" },
        { ...notes, section: "additional" },
      ];
      const initial: Record<string, string> = animal ? Object.fromEntries(fields.map(field => [field.name, String(({ ...animal, farm_id: animal.farm, breed_name_input: animal.breed_name, sire_identifier_input: animal.sire_identifier, dam_identifier_input: animal.dam_identifier } as Record<string, unknown>)[field.name] ?? "")])) : { farm_id: farmInitial, entry_date: today(), gender: "F", category: "Vaca", reproductive_status: "vazia", historical_birth_count: "0", dairy_aptitude: "false", beef_aptitude: "false", cattle_purpose: production || "unknown", ...preset };
      setForm({ title: editing ? `Editar bovino · ${animal.identifier}` : "Cadastrar bovino", description: "Registro individual, filiação e histórico do animal.", initial, fields,
        sections: [{ id: "animal", title: "Dados do animal" }, { id: "genealogy", title: "Filiação (genealogia)", description: "Use os brincos de animais da mesma fazenda ou informe ascendentes externos." }, { id: "reproduction", title: "Informações reprodutivas", description: "O histórico informado não cria coberturas, gestações ou partos. Registre esses eventos no módulo Reprodução." }, { id: "development", title: "Nascimento e desenvolvimento", description: "Pesagens e desmame posteriores são registrados nos manejos." }, { id: "additional", title: "Informações complementares", description: "A finalidade produtiva separa os segmentos. Aptidão e lactação são características independentes." }],
        submitLabel: "Salvar cadastro", save: values => {
          const data: Record<string, unknown> = Object.fromEntries(fields.filter(field => !field.readOnly && (!field.visibleWhen || values[field.visibleWhen.field] === field.visibleWhen.value)).map(field => [field.name, values[field.name] ?? ""]));
          for (const key of ["birth_date", "birth_weight_kg", "historical_last_birth_date", "initial_weaning_date"]) if (data[key] === "") data[key] = null;
          if (data.historical_birth_count === "") data.historical_birth_count = 0;
          if (!editing) return cattleService.create("animals", { ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== "")), reproductive_status: values.gender === "M" ? "ativa" : values.reproductive_status || "vazia" });
          return cattleService.update("animals", animal.id, data);
        },
      });
    } catch (error) { setError(cattleError(error)); } finally { setPreparing(false); }
  }
  function newAnimal(preset: { gender?: "F" | "M"; category?: string } = {}) { void animalForm(undefined, preset); }
  function editAnimal(animal: CattleAnimal) { void animalForm(animal); }
  function newBatch() {
    setForm({ title: "Cadastrar lote bovino", description: "Use lotes coletivos para animais sem cadastro individual. As quantidades não devem repetir os animais cadastrados por brinco.",
      initial: { cattle_purpose: production || "unknown", farm_id: farmInitial, phase: "crescimento", category: "Garrote", entry_date: today(), origin: "purchased", gender: "Misto" },
      fields: [farmField, { name: "cattle_purpose", label: "Finalidade produtiva", type: "select", required: true, options: options({ unknown: "Não informado", beef: "Corte", dairy: "Leite", dual: "Dupla finalidade" }) }, { name: "batch_code", label: "Código do lote", required: true, maxLength: 50 }, { name: "name", label: "Nome" }, { name: "phase", label: "Fase", type: "select", required: true, options: options(phases) }, { name: "category", label: "Categoria", type: "select", required: true, options: options(categories) }, { name: "quantity", label: "Quantidade de animais", type: "number", required: true, min: "1", step: "1" }, { name: "gender", label: "Sexo", type: "select", required: true, options: options({ M: "Machos", F: "Fêmeas", Misto: "Misto" }) }, { name: "origin", label: "Origem", type: "select", required: true, options: options({ purchased: "Comprado", born: "Nascido na fazenda", donated: "Doado" }) }, { name: "breed_name_input", label: "Raça" }, { name: "entry_date", label: "Entrada", type: "date", required: true, max: today() }, positive("avg_weight_kg", "Peso médio por animal (kg)", false), ...(manager ? [positive("purchase_value", "Valor total da compra (R$)", false), { name: "purchase_due_date", label: "Vencimento da compra", type: "date" } satisfies CattleField] : []), notes], save: values => cattleService.create("batches", payload(values)),
    });
  }
  function weighing(row: CattleAnimal | CattleBatch, batch = false) {
    setForm({ title: `Pesagem · ${batch ? (row as CattleBatch).batch_code : (row as CattleAnimal).identifier}`, description: batch ? "Informe o peso médio por animal do lote." : "A pesagem será adicionada ao histórico do animal.", initial: { weighing_date: today() }, fields: [positive("weight_kg", batch ? "Peso médio (kg/animal)" : "Peso (kg)"), { name: "weighing_date", label: "Data da pesagem", type: "date", required: true, max: today() }, notes], save: values => cattleService.action(batch ? "batches" : "animals", row.id, "register-weight", values) });
  }
  function mating(animal: CattleAnimal) {
    setForm({ title: `Cobertura · ${animal.identifier}`, initial: { mating_date: today(), mating_type: "natural" }, fields: [{ name: "mating_date", label: "Data da cobertura", type: "date", required: true, max: today() }, { name: "mating_type", label: "Método", type: "select", required: true, options: options({ natural: "Monta natural", ai: "Inseminação artificial", iatf: "IATF" }) }, { name: "sire_info", label: "Touro / identificação do sêmen", required: true }, { name: "expected_diagnosis_date", label: "Diagnóstico previsto (data definida pelo responsável)", type: "date" }, notes], save: values => cattleService.action("animals", animal.id, "register-mating", values) });
  }
  async function agendaAnimalAction(event: CattleAgendaEvent) {
    if (!event.animal) return;
    setPreparing(true); setError("");
    try { const animal = await cattleService.animal(event.animal); if (event.kind === "birth") birth(animal); else diagnosis(animal); }
    catch (error) { setError(cattleError(error)); } finally { setPreparing(false); }
  }
  function diagnosis(animal: CattleAnimal) {
    setForm({ title: `Diagnóstico de gestação · ${animal.identifier}`, initial: { diagnosis_date: today() }, fields: [{ name: "diagnosis_date", label: "Data do diagnóstico", type: "date", required: true, max: today() }, { name: "result", label: "Resultado", type: "select", required: true, options: options({ positive: "Positivo", negative: "Negativo" }) }], save: values => cattleService.action("animals", animal.id, "diagnose-pregnancy", values) });
  }
  function birth(animal: CattleAnimal) {
    setForm({ title: `Registrar parto · ${animal.identifier}`, description: "Para nascimento vivo, informe o brinco do bezerro. O cadastro será criado e vinculado à mãe.", initial: { date: today(), outcome: "alive", calf_gender: "F" }, fields: [{ ...dayField, max: today() }, { name: "outcome", label: "Resultado", type: "select", required: true, options: options({ alive: "Nascido vivo", stillborn: "Natimorto" }) }, { name: "calf_identifier", label: "Brinco do bezerro (nascido vivo)", maxLength: 50 }, { name: "calf_gender", label: "Sexo do bezerro", type: "select", options: options({ F: "Fêmea", M: "Macho" }) }, positive("weight_kg", "Peso ao nascer (kg)", false), notes], save: values => cattleService.action("animals", animal.id, "record-birth", payload(values)) });
  }
  function event(animal: CattleAnimal, initialKind?: string) {
    const kinds: Record<string, string> = { death: "Morte" };
    if (animal.reproductive_status === "gestante") kinds.abortion = "Perda gestacional / aborto";
    if (animal.category === "Bezerro") kinds.weaning = "Desmame";
    if (animal.gender === "M" && !animal.is_castrated) kinds.castration = "Castração";
    if (animal.gender === "F" && animal.is_lactating) kinds.dry_off = "Secagem";
    if (animal.gender === "F" && ["Vaca", "Matriz"].includes(animal.category) && !animal.is_lactating) kinds.start_lactation = "Iniciar lactação";
    setForm({ title: `Manejo · ${animal.identifier}`, description: "O desmame pode incluir peso e grupo de destino do bezerro; ele preserva a lactação da mãe. A secagem encerra a lactação sem interromper a gestação. Morte retira o animal do rebanho ativo.", initial: { date: today(), ...(initialKind ? { kind: initialKind } : {}) }, fields: [{ name: "kind", label: "Manejo", type: "select", required: true, options: options(kinds) }, { ...dayField, max: today() }, ...(animal.category === "Bezerro" ? [positive("weight_kg", "Peso ao desmame (kg, apenas para desmame)", false), { name: "destination_group", label: "Grupo de manejo de destino (apenas desmame)", maxLength: 100 } satisfies CattleField] : []), { ...notes, required: true }], save: values => cattleService.action("animals", animal.id, "record-event", payload(values)) });
  }
  async function vaccination(animal: CattleAnimal) {
    setPreparing(true);
    try {
      const vaccines = (await cattleService.stockItems()).filter(item => ["vacina", "medicamento_vacina"].includes(item.categoria));
      setForm({ title: `Vacinação · ${animal.identifier}`, description: "Selecione a vacina do estoque para registrar o consumo. Para aplicações externas, informe o nome.", initial: { application_date: today(), dose_type: "primeira" }, fields: [{ name: "vaccine_item_id", label: "Vacina do estoque", type: "select", options: vaccines.map(item => ({ value: item.id, label: `${item.nome.slice(0, 30)}${item.nome.length > 30 ? "..." : ""} · ${number(item.estoque_atual)} ${item.unidade_medida}` })) }, { name: "vaccine_name", label: "Nome da vacina (aplicação externa)" }, { name: "application_date", label: "Data da aplicação", type: "date", required: true, max: today() }, { name: "dose_type", label: "Tipo de dose", type: "select", required: true, options: options({ unica: "Dose única", primeira: "1ª dose", segunda: "2ª dose", terceira: "3ª dose", reforco: "Reforço" }) }, positive("dosage_ml", "Dose aplicada (mL)", false), notes], save: values => cattleService.action("animals", animal.id, "register-vaccination", payload(values)) });
    } catch (error) { setError(cattleError(error)); } finally { setPreparing(false); }
  }
  function health(animal: CattleAnimal) {
    setForm({ title: `Registro sanitário · ${animal.identifier}`, initial: { application_date: today(), treatment_type: "exam" }, fields: [{ name: "treatment_type", label: "Tipo", type: "select", required: true, options: options({ medication: "Medicação", exam: "Exame", surgery: "Cirurgia", other: "Outro" }) }, { name: "description", label: "Descrição / resultado", type: "textarea", required: true }, { name: "application_date", label: "Data", type: "date", required: true, max: today() }, { name: "veterinary", label: "Veterinário responsável" }, notes], save: values => clinicalService.createHealthRecord({ ...values, animal: animal.id, farm: animal.farm }) });
  }
  function newMilk() {
    setForm({ title: "Registrar ordenha", description: "Informe o brinco de uma fêmea bovina cadastrada na fazenda selecionada.", initial: { farm_id: farmInitial, date: today(), session: "morning", discarded_liters: "0" }, fields: [farmField, { name: "identifier", label: "Brinco da vaca", required: true, maxLength: 50 }, { ...dayField, max: today() }, { name: "session", label: "Turno", type: "select", required: true, options: options(sessions) }, positive("liters", "Produção total (litros)"), { name: "discarded_liters", label: "Leite descartado (litros)", type: "number", min: "0", step: "0.01", required: true }, { name: "discard_reason", label: "Motivo do descarte (obrigatório se houver descarte)", maxLength: 200 }, notes], save: async values => { const animal = await resolveAnimal(values); return cattleService.create("milk", { animal: animal.id, date: values.date, session: values.session, liters: values.liters, discarded_liters: values.discarded_liters, discard_reason: values.discard_reason || "", notes: values.notes || "" }); } });
  }
  async function newFeed() {
    setPreparing(true);
    try {
      const items = (await cattleService.stockItems()).filter(item => ["racao", "suplemento", "nucleo"].includes(item.categoria) && item.unidade_medida === "kg" && ["", "bovino", "multiplo"].includes(item.especie_animal || ""));
      const batches = await cattleService.all<CattleBatch>("batches", { status: "active", ...(production ? { production } : {}) });
      setForm({ title: "Registrar alimentação", description: "Informe um lote coletivo ou o brinco de um animal. A quantidade é o total consumido no período, com baixa no estoque.", initial: { farm_id: farmInitial, destination: "batch", data_inicio: today(), data_fim: today() }, fields: [farmField, { name: "destination", label: "Destino", type: "select", required: true, options: options({ batch: "Lote coletivo", animal: "Animal por brinco" }) }, { name: "batch_id", label: "Lote coletivo", type: "select", required: true, dependsOn: "farm_id", visibleWhen: { field: "destination", value: "batch" }, options: batches.map(batch => ({ value: batch.id, label: `${batch.batch_code} · ${batch.quantity} animais`, parentValue: batch.farm_id })) }, { name: "identifier", label: "Brinco", required: true, maxLength: 50, visibleWhen: { field: "destination", value: "animal" } }, { name: "item_estoque", label: "Ração / suplemento em estoque (kg)", type: "select", required: true, options: items.map(item => ({ value: item.id, label: `${item.nome.slice(0, 30)}${item.nome.length > 30 ? "..." : ""} · ${number(item.estoque_atual)} kg` })) }, { name: "data_inicio", label: "Início do período", type: "date", required: true, max: today() }, { name: "data_fim", label: "Fim do período", type: "date", required: true, max: today() }, positive("quantidade", "Quantidade total consumida (kg)"), notes], save: async values => {
        let target: Record<string, unknown>;
        if (values.destination === "animal") target = { animais: [(await resolveAnimal(values)).id] };
        else {
          const batch = batches.find(row => row.id === values.batch_id && row.farm_id === values.farm_id);
          if (!batch) throw new Error("Selecione um lote da fazenda.");
          target = { lote_animal: batch.id };
        }
        return cattleService.create("feed", { ...target, item_estoque: values.item_estoque, data_inicio: values.data_inicio, data_fim: values.data_fim, quantidade: values.quantidade, tipo_registro: "total_periodo", observacao: values.notes || "" });
      } });
    } catch (error) { setError(cattleError(error)); } finally { setPreparing(false); }
  }
  async function exportCsv(resource: "animals" | "batches" | "milk") {
    setPreparing(true);
    try {
      const filters: Record<string, string> = farm ? { farm } : {};
      if (production && ["animals", "batches"].includes(resource)) filters.production = production;
      if (["animals", "batches"].includes(resource) && status) filters.status = status;
      if (resource === "animals" && category) filters.category = category;
      if (resource === "animals" && withdrawal) filters.withdrawal = withdrawal;
      if (search) filters.search = search;
      if (view === "reproduction") { if (reproductionGroup !== "calves") filters.gender = "F"; if (reproductionGroup !== "dashboard") filters.reproduction_group = reproductionGroup; }
      if (youngFemales && resource === "animals") filters.young_females = "true";
      if (dairyAnimals && resource === "animals") filters.dairy_category = dairyTab;
      const records = await cattleService.all<CattleAnimal & CattleBatch & CattleMilk>(resource, filters);
      const columns: [string, string][] = resource === "animals" ? [["identifier", "Brinco"], ["name", "Nome"], ["farm_name", "Fazenda"], ["category", "Categoria"], ["gender", "Sexo"], ["status", "Situação"], ["current_weight_kg", "Peso (kg)"], ["is_castrated", "Castrado"], ["is_lactating", "Em lactação"], ["management_group", "Grupo de manejo"], ["milk_withdrawal_until", "Carência leite até"], ["meat_withdrawal_until", "Carência abate até"]] : resource === "batches" ? [["batch_code", "Lote"], ["farm_name", "Fazenda"], ["category", "Categoria"], ["phase", "Fase"], ["quantity", "Cabeças"], ["avg_weight_kg", "Peso médio (kg)"]] : [["identifier", "Vaca"], ["farm_name", "Fazenda"], ["date", "Data"], ["session", "Turno"], ["liters", "Produção (L)"], ["discarded_liters", "Descarte (L)"], ["discard_reason", "Motivo do descarte"]];
      const escape = (value: unknown) => { let text = String(value ?? ""); if (/^[\s]*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; };
      const csv = [columns.map(([, label]) => escape(label)).join(";"), ...records.map(record => columns.map(([key]) => escape((record as unknown as Record<string, unknown>)[key])).join(";"))].join("\r\n");
      const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `bovinos-${resource}-${today()}.csv`; link.click(); URL.revokeObjectURL(url);
    } catch (error) { setError(cattleError(error)); } finally { setPreparing(false); }
  }
  function editMilk(row: CattleMilk) {
    setForm({ title: `Corrigir ordenha · ${row.identifier}`, initial: { date: row.date, session: row.session, liters: row.liters, discarded_liters: row.discarded_liters, discard_reason: row.discard_reason || "", notes: row.notes || "" }, fields: [{ ...dayField, max: today() }, { name: "session", label: "Turno", type: "select", required: true, options: options(sessions) }, positive("liters", "Produção total (litros)"), { name: "discarded_liters", label: "Descarte (litros)", type: "number", min: "0", step: "0.01", required: true }, { name: "discard_reason", label: "Motivo do descarte", maxLength: 200 }, notes], save: values => cattleService.update("milk", row.id, values) });
  }
  function newPasture() {
    setForm({ title: "Cadastrar pasto / piquete", initial: { farm_id: farmInitial, availability: "unknown" }, fields: [farmField, { name: "name", label: "Nome do pasto", required: true }, positive("area_ha", "Área (ha)"), positive("max_stocking_ua_ha", "Lotação máxima (UA/ha, 1 UA = 450 kg)", false), { name: "availability", label: "Disponibilidade", type: "select", required: true, options: options({ unknown: "Não informada", available: "Liberado", resting: "Em descanso", blocked: "Interditado" }) }, { name: "availability_reason", label: "Motivo / orientação sobre disponibilidade", maxLength: 255 }, notes], save: values => cattleService.create("pastures", { farm: values.farm_id, name: values.name, area_ha: values.area_ha, max_stocking_ua_ha: values.max_stocking_ua_ha || null, availability: values.availability, availability_reason: values.availability_reason || "", notes: values.notes || "" }) });
  }
  function editPasture(pasture: CattlePasture) {
    setForm({ title: `Editar pasto · ${pasture.name}`, initial: { name: pasture.name, area_ha: pasture.area_ha, max_stocking_ua_ha: pasture.max_stocking_ua_ha || "", availability: pasture.availability, availability_reason: pasture.availability_reason || "", notes: pasture.notes || "" }, fields: [{ name: "name", label: "Nome do pasto", required: true }, positive("area_ha", "Área (ha)"), positive("max_stocking_ua_ha", "Lotação máxima (UA/ha, 1 UA = 450 kg)", false), { name: "availability", label: "Disponibilidade", type: "select", required: true, options: options({ unknown: "Não informada", available: "Liberado", resting: "Em descanso", blocked: "Interditado" }) }, { name: "availability_reason", label: "Motivo / orientação sobre disponibilidade", maxLength: 255 }, notes], save: values => cattleService.update("pastures", pasture.id, { ...values, max_stocking_ua_ha: values.max_stocking_ua_ha || null }) });
  }
  function grazing(pasture: CattlePasture) {
    setForm({ title: `Entrada no pasto · ${pasture.name}`, description: `Informe o código de um lote ativo da fazenda ${pasture.farm_name}.`, initial: { entry_date: today() }, fields: [{ name: "batch_code", label: "Código do lote", required: true, maxLength: 50 }, { name: "entry_date", label: "Entrada no pasto", type: "date", required: true, max: today() }, notes], save: async values => { const data = await cattleService.list<CattleBatch>("batches", { farm: pasture.farm, batch_code: values.batch_code.trim(), status: "active" }); if (data.results.length !== 1) throw { response: { data: { detail: "Lote ativo não encontrado nesta fazenda." } } }; return cattleService.create("grazings", { pasture: pasture.id, batch: data.results[0].id, entry_date: values.entry_date, notes: values.notes || "" }); } });
  }
  function closeGrazing(row: CattleGrazing) {
    setForm({ title: `Saída do pasto · ${row.batch_code}`, initial: { exit_date: today() }, fields: [{ name: "exit_date", label: "Data de saída", type: "date", min: row.entry_date, max: today(), required: true }], save: values => cattleService.action("grazings", row.id, "close", values) });
  }
  function changePhase(batch: CattleBatch) {
    setForm({ title: `Alterar fase · ${batch.batch_code}`, initial: { date: today(), category: batch.category }, fields: [{ name: "category", label: "Categoria após a mudança (confirme)", type: "select", required: true, options: options(categories) }, { name: "phase", label: "Nova fase", type: "select", required: true, options: options(phases).filter(option => option.value !== batch.phase) }, { ...dayField, min: batch.entry_date, max: today() }, notes], save: values => cattleService.action("batches", batch.id, "change-phase", values) });
  }
  async function chooseBatchResult() {
    setPreparing(true); setError("");
    try {
      const batches = await cattleService.all<CattleBatch>("batches", { ...(farm ? { farm } : {}), ...(production ? { production } : {}) });
      if (!batches.length) { setError("Nenhum lote encontrado neste segmento e fazenda."); return; }
      setForm({ title: "Resultado econômico do lote", description: "Selecione um lote ativo ou encerrado para consultar seus custos e vendas.", fields: [{ name: "batch", label: "Lote / fazenda", type: "select", required: true, options: batches.map(batch => ({ value: batch.id, label: `${batch.batch_code} · ${batch.farm_name} · ${statuses[batch.status] || batch.status}` })) }], submitLabel: "Consultar resultado", save: async values => {
        const result = await cattleService.batchResult(values.batch);
        setResultBatchId(values.batch); setResultYield(""); setResultError(""); setBatchResult(result);
      } });
    } catch (error) { setError(cattleError(error)); } finally { setPreparing(false); }
  }
  async function showBatchResult(batch: CattleBatch) {
    setPreparing(true); setError("");
    try { setResultError(""); setResultBatchId(batch.id); setResultYield(""); setBatchResult(await cattleService.batchResult(batch.id)); }
    catch (error) { setError(cattleError(error)); } finally { setPreparing(false); }
  }
  function batchDeath(batch: CattleBatch) {
    const requestKey = crypto.randomUUID();
    setForm({ title: `Mortalidade · ${batch.batch_code}`, description: "Lançamento para lote coletivo sem identificação individual. Reduz o efetivo disponível e preserva a autoria e o motivo.", initial: { date: today() }, fields: [{ ...dayField, min: batch.entry_date, max: today() }, { name: "quantity", label: "Animais mortos", type: "number", min: "1", max: String(batch.quantity), step: "1", required: true }, { name: "reason", label: "Causa / motivo", type: "textarea", required: true }], save: values => cattleService.action("batches", batch.id, "registrar-mortalidade", { ...values, request_key: requestKey }) });
  }
  async function batchTreatment(batch: CattleBatch) {
    setPreparing(true); setError("");
    try {
      const lots: StockLotOption[] = [];
      let page = 1;
      while (true) {
        const result = await cattleOperations.page<StockLotOption>("stock-lots", { page, page_size: 100 });
        lots.push(...result.results);
        if (!result.next) break;
        page += 1;
      }
      const requestKey = crypto.randomUUID();
      setForm({ title: `Sanidade coletiva · ${batch.batch_code}`, description: "Aplicação em lote sem brincos individuais. Informe a dose na unidade do produto selecionado. O estoque será consumido uma única vez e a carência cadastrada bloqueará a venda para abate.", initial: { date: today(), quantity: String(batch.quantity), service_cost: "0" }, fields: [
        { ...dayField, min: batch.entry_date, max: today() },
        { name: "quantity", label: "Animais tratados", type: "number", min: "1", max: String(batch.quantity), step: "1", required: true },
        { name: "description", label: "Procedimento / tratamento", required: true, maxLength: 500 },
        { name: "inventory_lot", label: "Produto e lote de estoque (confira a unidade)", type: "select", options: lots.map(lot => ({ value: lot.id, label: lot.label })) },
        { ...positive("quantity_per_head", "Dose por animal na unidade do estoque", false), step: "0.0001", min: "0.0001" },
        { ...positive("service_cost", "Custo externo do serviço (R$)", false), min: "0" }
      ], save: values => cattleService.action("batches", batch.id, "record-treatment", { ...payload(values), request_key: requestKey }) });
    } catch (error) { setError(cattleError(error)); } finally { setPreparing(false); }
  }
  function batchCost(batch: CattleBatch) {
    const requestKey = crypto.randomUUID();
    setForm({ title: `Apropriar custo · ${batch.batch_code}`, description: "Registre somente custos externos ainda não apropriados: serviço sanitário, pastagem, mão de obra ou frete. Não repita compra de animais, consumo de estoque ou descontos da venda. Este lançamento não movimenta o caixa.", initial: { date: today() }, fields: [{ ...dayField, min: batch.entry_date, max: today() }, { name: "category", label: "Tipo de custo", type: "select", required: true, options: options({ sanitary: "Serviço sanitário / tratamento externo", pasture: "Pastagem / arrendamento", labor: "Mão de obra", freight: "Frete", other: "Outro" }) }, positive("amount", "Valor total (R$)"), { name: "description", label: "Descrição / referência", type: "textarea", required: true }], save: values => cattleService.action("batches", batch.id, "record-cost", { ...values, request_key: requestKey }) });
  }
  function sell(batch: CattleBatch) {
    const carcass = { field: "pricing_basis", value: "carcass_arroba" };
    setForm({ title: `Venda · ${batch.batch_code}`, description: `${batch.quantity} animais disponíveis. A receita líquida fica em aberto no financeiro até confirmar o recebimento. Descontos são valores explícitos, sem alíquota presumida.`, initial: { date: today(), due_date: today(), mode: "whole", pricing_basis: "live_kg" }, fields: [
      { name: "mode", label: "Tipo de venda", type: "select", required: true, options: options({ whole: "Lote inteiro", partial: "Parte do lote" }) },
      { name: "quantity", label: "Animais vendidos", type: "number", min: "1", max: String(batch.quantity), step: "1", required: true, visibleWhen: { field: "mode", value: "partial" } },
      { name: "pricing_basis", label: "Base do preço", type: "select", required: true, options: options({ live_kg: "Kg de peso vivo", carcass_arroba: "Arroba de carcaça (15 kg)" }) },
      positive("weight_kg", "Peso vivo total vendido (kg)"),
      { ...positive("price_per_kg", "Preço por kg vivo (R$)"), step: "0.000001", visibleWhen: { field: "pricing_basis", value: "live_kg" } },
      { ...positive("price_per_arroba", "Preço por arroba (R$)"), visibleWhen: carcass },
      { ...positive("carcass_weight_kg", "Peso total de carcaça medido (kg)", false), visibleWhen: carcass },
      { ...positive("yield_percent", "Ou rendimento estimado (%)", false), max: "100", visibleWhen: carcass },
      { ...positive("deductions", "Total de descontos (R$)", false), min: "0" },
      { name: "deduction_description", label: "Descrição dos descontos (frete, Funrural etc.)", maxLength: 500 },
      { name: "slaughter_reference", label: "Referência do romaneio / documento", maxLength: 200 },
      { ...dayField, min: batch.entry_date, max: today() }, { name: "buyer", label: "Comprador", required: true },
      { name: "due_date", label: "Vencimento do recebimento", type: "date", required: true }, notes
    ], submitLabel: "Registrar venda e receita", save: values => {
      const visible = { ...payload(values) };
      if (values.pricing_basis === "live_kg") { delete visible.price_per_arroba; delete visible.carcass_weight_kg; delete visible.yield_percent; }
      else delete visible.price_per_kg;
      return cattleService.action("batches", batch.id, "register-sale", visible);
    } });
  }
  const activeModules = modules.filter(module => (manager || !["sales", "reports", "management", "feed-entry", "medication-entry"].includes(module.id)) && (production !== "beef" || module.id !== "milk")).sort((a, b) => production === "dairy" ? Number(b.id === "milk") - Number(a.id === "milk") : 0);
  const productionTitle = production === "dairy" ? "Pecuária leiteira" : production === "beef" ? "Gado de corte" : "Bovinos";
  const currentModule = modules.find(module => module.id === (view === "grazings" ? "pastures" : view));
  const title = youngFemales ? "Bezerras e novilhas" : view === "grazings" ? "Ocupação dos pastos" : modules.find(module => module.id === view)?.label;
  const newAction = view === "animals" ? () => newAnimal() : view === "batches" ? newBatch : view === "milk" ? newMilk : view === "feeding" ? newFeed : view === "pastures" && manager ? newPasture : null;
  const metrics = overview ? [
    ["Animais ativos (cabeças)", number(overview.total_head)], ["Identificados por brinco", number(overview.identified_animals)], ["Lotes ativos", number(overview.active_batches)],
    ["Fêmeas gestantes identificadas", number(overview.pregnant_females)], ["Fêmeas em lactação identificadas", number(overview.lactating_females)], ["Peso médio dos identificados (kg)", number(overview.average_identified_weight)],
    ["Leite produzido no mês (L)", number(overview.milk_produced_month)], ["Leite aproveitável no mês (L)", number(overview.milk_usable_month)], ["Área de pastagens (ha)", number(overview.pasture_area_ha)],
  ] : [];
  const metricAppearance = [
    { icon: CattleIcon, tone: "rose" }, { icon: Tags, tone: "blue" }, { icon: ClipboardList, tone: "amber" },
    { icon: VenusAndMars, tone: "purple" }, { icon: LactationIcon, tone: "pink" }, { icon: Scale, tone: "blue" },
    { icon: Milk, tone: "cyan" }, { icon: Milk, tone: "emerald" }, { icon: MapPin, tone: "emerald" },
  ];
  const animalsTable = ["animals", "weights", "health"].includes(view);
  const savedForm = () => { setForm(null); setSuccess("Registro salvo com sucesso."); setRefresh(value => value + 1); };
  return <div className={view === "reproduction" ? undefined : styles.page}>
    {view !== "reproduction" && <header className={styles.header}>
      <div className={styles.brand}>
        <div className={homeStyles.titleIcon} aria-hidden="true">
          {dairyAnimals ? <LactationIcon size={27} strokeWidth={1.8} /> : <CattleIcon size={27} strokeWidth={1.8} />}
        </div>
        <div>
          <h1>{view === "overview" ? productionTitle : title}</h1>
          <p>
            {view === "overview"
              ? production === "dairy"
                ? "Ordenhas, lactação, reprodução e cuidados do rebanho leiteiro"
                : production === "beef"
                ? "Cria, recria, engorda, pesagens e comercialização"
                : "Gerencie todas as operações da bovinocultura de corte e leite"
              : dairyAnimals
              ? "Vacas, bezerras, touros e registros do rebanho leiteiro"
              : currentModule?.description}
          </p>
        </div>
      </div>
      <div className={styles.headerActions}>
        {view !== "management" && <label className={styles.farmFilter}><span>Fazenda</span><select aria-label="Filtrar por fazenda" className="form-select form-select-sm" value={farm} onChange={event => { setFarm(event.target.value); setPage(1); }}><option value="">Todas as fazendas</option>{farms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <button className="btn btn-outline-secondary btn-sm" onClick={() => setRefresh(value => value + 1)} disabled={loading}><RefreshCw size={15} className="me-1" aria-hidden="true" /> Atualizar</button>
      </div>
    </header>}
    {success && <div role="status" className="alert alert-success py-2">{success}</div>}
    {error && <div role="alert" className="alert alert-danger">{error} <button className="btn btn-sm btn-outline-danger" onClick={() => setRefresh(value => value + 1)}>Tentar novamente</button></div>}
    {loading && !overview ? <div className={styles.empty} role="status">Carregando dados do rebanho...</div> : !error && <>
      {production && <p className="alert alert-info py-2 small">Este segmento considera a finalidade {production === "dairy" ? "leite" : "corte"} e dupla finalidade. <Link href={cattleHref(`${root}/operacoes?tab=classification`, production || "beef")}>Revisar animais e lotes não classificados</Link>.</p>}
      {(["overview", "reports", "milk"].includes(view)) && <section className={homeStyles.summaryPanel} aria-labelledby="cattle-summary-title">
        <div className={homeStyles.sectionHeading}><div><span>{view === "milk" ? "Produção leiteira" : "Visão geral do rebanho"}</span><h2 id="cattle-summary-title">{view === "milk" ? "Resumo da produção de leite" : production ? `Resumo · ${productionTitle}` : "Resumo da Bovinocultura"}</h2></div><small className={styles.summaryScope}>{farm ? farms.find(item => item.id === farm)?.name : "Todas as fazendas"}</small></div>
        <div className={homeStyles.metricsGrid} aria-busy={loading}>{metrics.map(([label, value], index) => {
          if (production === "beef" && label.startsWith("Leite")) return null;
          if (view === "milk" && !label.startsWith("Leite") && !label.startsWith("Fêmeas em lactação")) return null;
          if (production === "beef" && (label.startsWith("Leite") || label.startsWith("Fêmeas em lactação"))) return null;
          if (production === "dairy" && !label.startsWith("Leite") && !label.startsWith("Fêmeas em lactação") && !label.startsWith("Fêmeas gestantes")) return null;
          const appearance = metricAppearance[index];
          return <article className={`${homeStyles.metricCard} ${styles.overviewMetric}`} data-tone={appearance.tone} key={label}><div className={homeStyles.metricIcon} aria-hidden="true"><appearance.icon size={25} strokeWidth={1.8} /></div><div><strong>{value}</strong><span>{label}</span></div></article>;
        })}</div>
      </section>}
      {view === "feeding" && manager && <CattleNutrition key={farm || "all"} farm={farm} canWrite={canWrite} onChanged={() => setRefresh(value => value + 1)} />}
      {view === "reproduction" && <CattleReproduction production={production} counts={reproductionCounts} selected={reproductionGroup} loading={loading || preparing}
        headerActions={<><label className={styles.farmFilter}><span>Fazenda</span><select aria-label="Filtrar por fazenda" className="form-select form-select-sm" value={farm} onChange={event => { setFarm(event.target.value); setPage(1); }}><option value="">Todas as fazendas</option>{farms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="btn btn-outline-secondary btn-sm" disabled={loading} onClick={() => setRefresh(value => value+1)}><RefreshCw size={15} aria-hidden="true"/> Atualizar</button></>}
        onNew={canWrite ? () => newAnimal({ gender: "F", category: reproductionGroup === "heifers" ? "Novilha" : "Vaca" }) : undefined}
        onSelect={value => { setReproductionGroup(value); setPage(1); setSearch(""); setReproductionStatus(""); setRows([]); router.replace(cattleHref(`${root}/reproducao?tab=${value}`, production || "beef"), { scroll: false }); }}
        animals={rows as CattleAnimal[]} pagination={{ page: page-1, pageSize: reproductionPageSize, total: count, onPageChange: value => setPage(value+1), onPageSizeChange: value => { setReproductionPageSize(value); setPage(1); } }}
        search={search} onSearch={value => { setSearch(value); setPage(1); }} status={reproductionStatus} onStatus={value => { setReproductionStatus(value); setPage(1); }}
        canWrite={canWrite && !loading && !preparing} manager={manager} onMating={mating} onDiagnosis={diagnosis} onBirth={birth} onEvent={event} onHistory={openHistory} onEdit={editAnimal} />}

      {view === "health" && <CattleAgenda key={farm || "all"} farm={farm} refresh={refresh} canWrite={canWrite && !preparing} manager={manager} onAnimalAction={agendaAnimalAction} onChanged={() => setRefresh(value => value + 1)} />}
      {view === "management" ? (manager ? <CattleManagementWorkspace key={initialMedication ? "medication" : "management"} initialMedication={initialMedication} production={production} farms={farms} canWrite={canWrite} onChanged={() => setRefresh(value => value + 1)} /> : <p role="alert">Manejos coletivos exigem gerente ou administrador.</p>) : ["overview", "reports"].includes(view) ? <>
        {view === "overview" && <section aria-labelledby="cattle-modules-title" className={styles.operations}>
          <div className={homeStyles.modulesHeading}><div><span>Operações</span><h2 id="cattle-modules-title">O que você deseja acessar?</h2></div><p>Escolha uma área para continuar a gestão do rebanho.</p></div>
          <div className={homeStyles.moduleGrid}>{activeModules.filter(module => module.id !== "overview" && module.id !== "feeding").map(module => <Link className={homeStyles.moduleCard} data-tone={moduleTones[module.id]} href={cattleHref(module.href, production || "beef")} key={module.id}><div className={homeStyles.moduleIcon} aria-hidden="true"><module.icon size={26} strokeWidth={1.8} /></div><div className={homeStyles.moduleCopy}><h3>{module.label}</h3><p>{module.description}</p></div><span className={homeStyles.moduleAction}>Acessar <ChevronRight size={19} aria-hidden="true" /></span></Link>)}</div>
        </section>}
        <div className={styles.insightGrid}><section className={styles.panel}><div className={styles.sectionTitle}><ChartNoAxesCombined size={20} aria-hidden="true" /><div><span>Inventário</span><h2>Composição do rebanho ativo</h2></div></div>{overview?.categories.length ? overview.categories.map(item => <div className={styles.category} key={item.category}><span>{item.category}</span><progress value={item.quantity} max={overview.total_head} aria-label={item.category} /><strong>{number(item.quantity)}</strong></div>) : <p className={styles.muted}>Nenhum animal ativo cadastrado. Comece pelo cadastro individual ou pelos lotes.</p>}</section>
        <CattleAgenda key={farm || "all"} farm={farm} refresh={refresh} canWrite={canWrite && !preparing} manager={manager} onAnimalAction={agendaAnimalAction} onChanged={() => setRefresh(value => value + 1)} /></div>
        {view === "reports" && manager && <CattleFeedingReport key={`${farm}:${production}`} farm={farm} production={production || "beef"} />}
        {view === "reports" && manager && <section className={styles.panel}><h2>Fechamento econômico por lote</h2><p>Compra, consumo, sanidade, custos adicionais, vendas, margem, mortalidade, GMD e custo por arroba de carcaça.</p><button disabled={preparing} className="btn btn-success btn-sm mb-3" onClick={chooseBatchResult}>Consultar resultado do lote</button><h2>Exportar registros bovinos</h2><div className={styles.actions}>{(["animals", "batches", "milk"] as const).map(resource => <button key={resource} disabled={preparing} className="btn btn-outline-success btn-sm" onClick={() => exportCsv(resource)}>{preparing ? "Preparando..." : { animals: "Animais (CSV)", batches: "Lotes (CSV)", milk: "Ordenhas (CSV)" }[resource]}</button>)}</div></section>}

      </> : <>
        {view === "animals" && (
          <div className={homeStyles.modulesHeading}>
            <div>
              <span>Atalhos de cadastro</span>
              <h2>O que você deseja cadastrar?</h2>
            </div>
            <p>{dairyAnimals ? "Cadastre vacas, fêmeas jovens ou reprodutores do rebanho leiteiro." : "Cadastre matrizes, reprodutores ou lotes coletivos do rebanho."}</p>
          </div>
        )}
        {view === "animals" && (
          <section className={styles.registrationGrid} aria-label="Ações de cadastro por categoria">
            {(dairyAnimals
              ? [
                  {
                    title: "Vacas e matrizes",
                    description: "Cadastre vacas em lactação ou secas para produção leiteira.",
                    icon: LactationIcon,
                    tone: "green",
                    features: ["Controle de ordenhas e lactação", "Ciclos reprodutivos e partos", "Genealogia e histórico individual"],
                    action: () => newAnimal({ gender: "F", category: "Vaca" }),
                    button: "Cadastrar vaca",
                  },
                  {
                    title: "Bezerras e novilhas",
                    description: "Fêmeas jovens para recria e reposição do plantel leiteiro.",
                    icon: CowIcon,
                    tone: "pink",
                    features: ["Acompanhamento do desenvolvimento", "Controle de pesagens e ganho de peso", "Futuras matrizes em lactação"],
                    action: () => newAnimal({ gender: "F", category: "Novilha" }),
                    button: "Cadastrar bezerra / novilha",
                  },
                  {
                    title: "Touros e reprodutores",
                    description: "Identificação de reprodutores e controle de genealogia.",
                    icon: BullIcon,
                    tone: "blue",
                    features: ["Identificação individual por brinco", "Genealogia e controle de coberturas", "Acompanhamento sanitário e peso"],
                    action: () => newAnimal({ gender: "M", category: "Touro" }),
                    button: "Cadastrar touro",
                  },
                ]
              : [
                  {
                    title: "Fêmeas e matrizes",
                    description: "Cadastre vacas e novilhas do rebanho.",
                    icon: Venus,
                    tone: "purple",
                    features: ["Ciclos reprodutivos", "Partos e genealogia", "Lactação independente"],
                    action: () => newAnimal({ gender: "F", category: "Vaca" }),
                    button: "Cadastrar fêmea",
                  },
                  {
                    title: "Machos e reprodutores",
                    description: "Identificação e acompanhamento individual.",
                    icon: Mars,
                    tone: "blue",
                    features: ["Brinco e raça", "Pesagens individuais", "Histórico de manejos"],
                    action: () => newAnimal({ gender: "M", category: "Touro" }),
                    button: "Cadastrar macho",
                  },
                  {
                    title: "Lotes coletivos",
                    description: "Animais sem identificação individual.",
                    icon: Layers3,
                    tone: "orange",
                    features: ["Cria, recria e engorda", "Controle de quantidade", "Peso médio por animal"],
                    action: newBatch,
                    button: "Cadastrar lote",
                  },
                ]
            ).map((card) => (
              <article className={`${homeStyles.moduleCard} ${styles.registrationCard}`} data-tone={card.tone} key={card.title}>
                <div className={homeStyles.moduleIcon}>
                  <card.icon size={26} strokeWidth={1.8} aria-hidden="true" />
                </div>
                <h2>{card.title}</h2>
                <p className={styles.muted}>{card.description}</p>
                <ul>
                  {card.features.map((feature) => (
                    <li key={feature}>
                      <CheckCircle2 size={14} aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  className="btn btn-outline-success btn-sm"
                  disabled={!canWrite}
                  onClick={card.action}
                >
                  {card.button}
                </button>
              </article>
            ))}
          </section>
        )}
        {view !== "reproduction" && <section className={`${styles.panel} ${styles.listPanel} ${dairyAnimals ? styles.dairyList : ""}`} aria-busy={loading}>
          <div className={styles.listHeading}>
            <div className={styles.sectionTitle}>
              {currentModule && <currentModule.icon size={22} aria-hidden="true" />}
              <div>
                <span>{dairyAnimals ? "Plantel leiteiro" : view === "grazings" ? "Histórico de ocupação" : "Registros do rebanho"}</span>
                <h2>{dairyAnimals ? (youngFemales ? "Bezerras e novilhas" : "Animais cadastrados") : title}</h2>
                <p>{dairyAnimals ? "Lista e histórico de animais da pecuária leiteira" : currentModule?.description}</p>
              </div>
            </div>
            <span className={styles.countBadge}>{number(count)} registros</span>
          </div>
        <div className={styles.toolbar}><div className={styles.filters}>
          <label className={styles.searchField}><Search size={17} aria-hidden="true" /><input aria-label="Buscar registros" className="form-control form-control-sm" placeholder={dairyAnimals ? "Buscar por brinco, nome ou lote…" : view === "milk" ? "Buscar por brinco" : "Buscar registros..."} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
          {(resource === "animals" || resource === "batches") && <select aria-label="Situação" className="form-select form-select-sm" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>{Object.entries({ "": "Todas as situações", active: "Ativos", sold: "Vendidos", dead: "Mortos", finished: "Encerrados" }).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>}
          {resource === "animals" && !dairyAnimals && <select aria-label="Categoria" className="form-select form-select-sm" value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}><option value="">Todas as categorias</option>{categories.map(value => <option key={value}>{value}</option>)}</select>}
          {resource === "animals" && <select aria-label="Filtrar carências" className="form-select form-select-sm" value={withdrawal} onChange={event => { setWithdrawal(event.target.value); setPage(1); }}><option value="">Todas as carências</option><option value="milk">Em carência de leite</option><option value="meat">Em carência de abate</option></select>}
        </div><div className={styles.actions}>{manager && ["animals", "batches", "milk"].includes(view) && <button disabled={preparing} className="btn btn-outline-secondary btn-sm" onClick={() => exportCsv(resource as "animals" | "batches" | "milk")}>Exportar filtro (CSV)</button>}{view === "pastures" && <Link className="btn btn-outline-secondary btn-sm" href={cattleHref(`${root}/pastos/ocupacoes`, production || "beef")}>Ver ocupações</Link>}{newAction && canWrite && <button className="btn btn-success btn-sm" disabled={preparing} onClick={newAction}><Plus size={15} aria-hidden="true" /> {({ animals: "Cadastrar animal", batches: "Cadastrar lote", milk: "Registrar ordenha", feeding: "Registrar consumo", pastures: "Cadastrar pasto" } as Partial<Record<CattleView, string>>)[view] || "Novo registro"}</button>}</div></div>
        {dairyAnimals && <nav className={styles.categoryTabs} aria-label="Categorias de animais leiteiros">{[
          ["all", "Todos"], ["cows", "Vacas"], ["heifers", "Novilhas"], ["calves", "Bezerras"], ["bulls", "Touros"],
        ].map(([value, label]) => <button type="button" key={value} className={styles.categoryTab} aria-pressed={dairyTab === value} onClick={() => { setDairyTab(value); setPage(1); }} disabled={loading}>{label} <span>({loading ? "…" : categoryCounts[value] ?? 0})</span></button>)}</nav>}
        {view === "feeding" && manager && <div className={`${styles.actions} mb-3`} aria-label="Produção de ração"><Link className="btn btn-outline-secondary btn-sm" href={cattleHref(`${root}/racao/producao`, production || "beef")}>Fábrica de ração</Link><Link className="btn btn-outline-secondary btn-sm" href={cattleHref(`${root}/racao/gerenciar-formulas`, production || "beef")}>Gerenciar fórmulas</Link></div>}
        {view === "feeding" && <Table columns={["Período", "Destino", "Ração", "Consumo", ...(manager ? ["Custo total"] : [])]}>{(rows as CattleFeed[]).map(row => <tr key={row.id}><td>{date(row.data_inicio)}<small>até {date(row.data_fim)}</small></td><td>{row.lote_codigo || row.animais_identificadores.join(", ")}</td><td>{row.item_nome}</td><td>{number(row.quantidade)} kg</td>{manager && <td>{Number(row.custo_total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>}</tr>)}</Table>}
        {view === "pastures" && <p className={styles.muted}>Lotação atual dos lotes coletivos em ocupação, usando seus pesos médios. 1 UA = 450 kg. Animais sem peso impedem o cálculo da capacidade.</p>}
        {view === "batches" && <p className={styles.muted}>Lotes coletivos de animais sem identificação individual. Para registrar uma pesagem, informe o peso médio por animal.</p>}
        {animalsTable && <Table columns={dairyAnimals ? ["Brinco", "Nome", "Categoria", "Raça", "Idade", "Status", "Ações"] : ["Brinco / fazenda", "Categoria / raça", "Sexo", "Peso atual", "Ações"]}>{(rows as CattleAnimal[]).map(animal => <tr key={animal.id}>{dairyAnimals ? <><td><strong>{animal.identifier}</strong>{!farm && <small>{animal.farm_name}</small>}</td><td>{animal.name || "—"}</td><td>{animal.category === "Bezerro" && animal.gender === "F" ? "Bezerra" : animal.category || "—"}</td><td>{animal.breed_name || "—"}</td><td>{animalAge(animal.birth_date)}</td><td><DairyAnimalStatus animal={animal}/>{animal.milk_withdrawal_until && animal.milk_withdrawal_until >= today() && <small className="text-danger">Carência de leite até {date(animal.milk_withdrawal_until)}</small>}{animal.meat_withdrawal_until && animal.meat_withdrawal_until >= today() && <small className="text-danger">Carência de abate até {date(animal.meat_withdrawal_until)}</small>}</td></> : <><td><strong>{animal.identifier}</strong><small>{animal.farm_name}</small>{animal.management_group && <small>Grupo: {animal.management_group}</small>}{animal.is_castrated && <small>Castrado</small>}{animal.is_lactating && <small>Em lactação</small>}{animal.milk_withdrawal_until && animal.milk_withdrawal_until >= today() && <small className="text-danger">Carência leite até {date(animal.milk_withdrawal_until)}</small>}{animal.meat_withdrawal_until && animal.meat_withdrawal_until >= today() && <small className="text-danger">Carência abate até {date(animal.meat_withdrawal_until)}</small>}</td><td>{animal.category || "—"}<small>{animal.breed_name || "Raça não informada"}</small></td><td>{animal.gender === "F" ? "Fêmea" : "Macho"}</td><td>{number(animal.current_weight_kg)} kg</td></>}<td><AnimalRowActions compact={dairyAnimals} identifier={animal.identifier}>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => openHistory(animal)}>Ficha / histórico</button>
          {canWrite && animal.status === "active" && <>
            {view === "animals" && manager && <button className="btn btn-outline-secondary btn-sm" onClick={() => editAnimal(animal)}>Editar</button>}
            {["animals", "weights"].includes(view) && <button className="btn btn-outline-success btn-sm" onClick={() => weighing(animal)}>Pesar</button>}
            {view === "health" && <><button className="btn btn-outline-success btn-sm" onClick={() => vaccination(animal)}>Vacinar</button><button className="btn btn-outline-secondary btn-sm" onClick={() => health(animal)}>Exame / tratamento</button></>}
            {view === "animals" && manager && <button className="btn btn-outline-secondary btn-sm" onClick={() => event(animal)}>Manejo / baixa</button>}
          </>}
        </AnimalRowActions></td></tr>)}</Table>}
        {(view === "batches" || view === "sales") && <Table columns={["Lote / fazenda", "Categoria / fase", "Cabeças", "Peso médio", "Ações"]}>{(rows as CattleBatch[]).map(batch => <tr key={batch.id}><td><strong>{batch.batch_code}</strong><small>{batch.farm_name}</small>{batch.operations?.pastures.map(pasto => <small key={pasto.name}>{pasto.name} · {pasto.days} dias</small>)}<small>Última pesagem: {date(batch.operations?.last_weighing_date)}</small></td><td>{batch.category}<small>{phases[batch.phase] || batch.phase}</small>{batch.operations?.age_days !== null && batch.operations?.age_days !== undefined && <small>Idade de referência: {batch.operations.age_days} dias</small>}</td><td>{number(batch.quantity)}</td><td>{number(batch.avg_weight_kg)} kg</td><td><div className={styles.actions}>{manager && <><button className="btn btn-outline-success btn-sm" onClick={() => showBatchResult(batch)}>Resultado do lote</button>{canWrite && <button className="btn btn-outline-secondary btn-sm" onClick={() => batchCost(batch)}>Apropriar custo</button>}</>}{batch.status === "active" && canWrite && <>{view === "batches" && <button className="btn btn-outline-success btn-sm" onClick={() => weighing(batch, true)}>Pesar lote</button>}{view === "batches" && <button className="btn btn-outline-secondary btn-sm" onClick={() => batchTreatment(batch)}>Sanidade coletiva</button>}{view === "batches" && <button className="btn btn-outline-danger btn-sm" onClick={() => batchDeath(batch)}>Mortalidade</button>}{manager && <>{view === "batches" && <button className="btn btn-outline-secondary btn-sm" onClick={() => changePhase(batch)}>Alterar fase</button>}<button className="btn btn-outline-secondary btn-sm" onClick={() => sell(batch)}>Vender</button></>}</>}</div></td></tr>)}</Table>}
        {view === "milk" && <Table columns={["Data / turno", "Vaca / fazenda", "Produção", "Descarte", "Aproveitável", ...(manager ? ["Ações"] : [])]}>{(rows as CattleMilk[]).map(row => <tr key={row.id}><td>{date(row.date)}<small>{sessions[row.session]}</small></td><td><strong>{row.identifier}</strong><small>{row.farm_name}</small></td><td>{number(row.liters)} L</td><td>{number(row.discarded_liters)} L<small>{row.discard_reason}</small></td><td>{number(Number(row.liters) - Number(row.discarded_liters))} L</td>{manager && <td><button className="btn btn-outline-secondary btn-sm" onClick={() => editMilk(row)}>Corrigir</button></td>}</tr>)}</Table>}
        {view === "pastures" && <Table columns={["Pasto / piquete", "Fazenda", "Área", "Lotação / capacidade", "Ações"]}>{(rows as CattlePasture[]).map(row => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.notes}</small><small>{({ occupied: "Em uso", unknown: "Disponibilidade não informada", available: "Liberado", resting: "Em descanso", blocked: "Interditado" } as Record<string, string>)[row.occupancy.state]}</small>{row.occupancy.occupied_days !== null && <small>Ocupação atual: até {row.occupancy.occupied_days} dias</small>}{row.occupancy.empty_days !== null && <small>Sem ocupação há {row.occupancy.empty_days} dias</small>}<small>{row.availability_reason}</small></td><td>{row.farm_name}</td><td>{number(row.area_ha)} ha</td><td>{number(row.occupancy.heads)} cabeças<small>{row.occupancy.stocking_ua_ha === null ? "Peso insuficiente para calcular UA/ha" : `${number(row.occupancy.stocking_ua_ha)} UA/ha`}</small><small className={Number(row.occupancy.capacity_percent) > 100 ? "text-danger" : ""}>{row.occupancy.capacity_percent === null ? "Capacidade não calculada" : `${number(row.occupancy.capacity_percent)}% da capacidade`}</small></td><td>{canWrite && manager && <div className={styles.actions}><button className="btn btn-outline-success btn-sm" disabled={["resting", "blocked"].includes(row.availability)} onClick={() => grazing(row)}>Entrada de lote</button><button className="btn btn-outline-secondary btn-sm" onClick={() => editPasture(row)}>Editar capacidade</button></div>}</td></tr>)}</Table>}
        {view === "grazings" && <Table columns={["Pasto", "Lote", "Cabeças atuais", "Entrada", "Saída", "Ações"]}>{(rows as CattleGrazing[]).map(row => <tr key={row.id}><td>{row.pasture_name}</td><td>{row.batch_code}</td><td>{number(row.quantity)}</td><td>{date(row.entry_date)}</td><td>{row.exit_date ? date(row.exit_date) : "Em ocupação"}</td><td>{!row.exit_date && canWrite && manager && <button className="btn btn-outline-secondary btn-sm" onClick={() => closeGrazing(row)}>Registrar saída</button>}</td></tr>)}</Table>}
        {!rows.length && <div className={styles.empty}>Nenhum registro encontrado para os filtros selecionados.</div>}
        <div className={styles.pagination}><span>{number(count)} registros · página {page}</span><button className="btn btn-outline-secondary btn-sm" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</button><button className="btn btn-outline-secondary btn-sm" disabled={page * 30 >= count} onClick={() => setPage(value => value + 1)}>Próxima</button></div>
      </section>}</>}
      {view === "sales" && manager && <section className={styles.panel}><h2>Últimas vendas registradas</h2><Table columns={["Data", "Lote", "Cabeças", "Comprador", "Receita"]}>{sales.map(sale => <tr key={sale.id}><td>{date(sale.date)}</td><td>{sale.batch_code}</td><td>{number(sale.quantity)}</td><td>{sale.buyer}</td><td>{Number(sale.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td></tr>)}</Table>{!sales.length && <p className={styles.empty}>Nenhuma venda registrada.</p>}</section>}
    </>}
    {batchResult && <Modal isOpen onClose={() => setBatchResult(null)} title={`Resultado · ${batchResult.batch_code}`} description="Resultado econômico parcial dos lançamentos, independente da baixa financeira."><div className={styles.form}>
        {resultError && <div className="alert alert-danger" role="alert">{resultError}</div>}
        <div className={styles.fields}>{[["GMD no período (kg/dia)", batchResult.daily_weight_gain], ["Entrada", batchResult.initial_head], ["Vendidos", batchResult.sold_head], ["Mortes", batchResult.deaths], ["Ativos", batchResult.remaining_head], ["Mortalidade (%)", batchResult.mortality_percent], ["Compra (R$)", batchResult.acquisition], ["Consumos e sanidade (R$)", batchResult.operational_cost], ["Custos adicionais (R$)", batchResult.additional_cost], ["Custo total (R$)", batchResult.total_cost], ["Receita bruta (R$)", batchResult.gross_revenue], ["Descontos (R$)", batchResult.deductions], ["Receita líquida (R$)", batchResult.net_revenue], ["Resultado parcial (R$)", batchResult.result], ["Margem parcial (%)", batchResult.margin_percent], ["Custo por vendido (R$)", batchResult.cost_per_sold_head], ["Resultado por vendido (R$)", batchResult.result_per_sold_head], ["Arrobas de carcaça", batchResult.carcass_arrobas], ["Custo por arroba (R$)", batchResult.cost_per_arroba]].map(([label, value]) => <div key={String(label)}><small>{label}</small><strong className="d-block">{number(value)}</strong></div>)}</div>
        <form className="d-flex flex-wrap gap-2 align-items-end mt-3" onSubmit={async event => { event.preventDefault(); setPreparing(true); setResultError(""); try { setBatchResult(await cattleService.batchResult(resultBatchId, resultYield)); } catch (error) { setResultError(cattleError(error)); } finally { setPreparing(false); } }}><label className={styles.field}>Rendimento para estimar carcaça (%)<input className="form-control form-control-sm" type="number" min="0.01" max="100" step="0.01" value={resultYield} onChange={event => setResultYield(event.target.value)}/></label><button className="btn btn-outline-success btn-sm" disabled={preparing}>Recalcular arrobas</button></form>
        {batchResult.carcass_estimated && <p className="text-muted mt-3">Carcaça calculada pelo rendimento estimado informado na venda.</p>}
        {batchResult.warnings.map(text => <p key={text} className="text-muted small mt-3">{text}</p>)}
        <h3 className="h6 mt-3">Custos operacionais apropriados</h3><Table columns={["Data", "Descrição", "Valor (R$)"]}>{batchResult.entries.map(row => <tr key={row.id}><td>{date(row.date)}</td><td>{row.description}</td><td>{number(row.amount)}</td></tr>)}</Table>
        <h3 className="h6 mt-3">Ganho entre pesagens (kg/animal/dia)</h3><Table columns={["Início", "Fim", "Dias", "GMD"]}>{batchResult.weight_intervals.map(row => <tr key={`${row.start}-${row.end}`}><td>{date(row.start)}</td><td>{date(row.end)}</td><td>{row.days}</td><td>{Number(row.gmd).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</td></tr>)}</Table>
      </div></Modal>}
      {form && (view === "reproduction" ? <CattleReproductionForm spec={form} onClose={() => setForm(null)} onSaved={savedForm}/> : <CattleForm spec={form} onClose={() => setForm(null)} onSaved={savedForm}/>)}
    {historyAnimal && <Modal variant={view === "reproduction" ? "reproduction" : "default"} isOpen onClose={() => setHistoryAnimal(null)} maxWidth={styles.formDialog} title={`Ficha do bovino · ${historyAnimal.identifier}`} description={`${historyAnimal.category || "Bovino"} · ${historyAnimal.farm_name}`}><div className={styles.form}>
      <div className={styles.metrics}><article className={styles.metric}><span>Peso atual</span><strong>{number(historyAnimal.current_weight_kg)} kg</strong></article><article className={styles.metric}><span>Nascimento</span><strong style={{ fontSize: "1rem" }}>{date(historyAnimal.birth_date)}</strong></article></div>
      <p className={styles.muted}>Raça: {historyAnimal.breed_name || "Não informada"} · Sexo: {historyAnimal.gender === "F" ? "Fêmea" : "Macho"} · Entrada: {date(historyAnimal.entry_date)}</p><p className={styles.muted}>Pai: {historyAnimal.sire_identifier || historyAnimal.sire_name || "Não informado"} · Mãe: {historyAnimal.dam_identifier || historyAnimal.dam_name || "Não informada"}</p><hr />
      <CattleGenealogy key={historyAnimal.id} id={historyAnimal.id} />
      {historyLoading ? <p role="status">Carregando histórico...</p> : historyError ? <p role="alert" className="text-danger">{historyError}</p> : <>
        {(() => { const weights = history.filter(event => event.type === "weight" && event.date && event.details?.weight_kg !== undefined).sort((a, b) => (b.date || "").localeCompare(a.date || "")); if (weights.length < 2) return null; const previous = weights.find(event => event.date !== weights[0].date); if (!previous) return null; const days = (Date.parse(weights[0].date!) - Date.parse(previous.date!)) / 86400000; return days > 0 ? <p className={styles.muted}>Ganho médio diário entre as duas últimas pesagens: <strong>{number((weights[0].details!.weight_kg! - previous.details!.weight_kg!) / days)} kg/dia</strong> ({days} dias).</p> : null; })()}
        {history.map((event, index) => <article className={styles.event} key={`${event.type}-${event.date}-${index}`}><time>{date(event.date)}</time><strong>{event.title}</strong><p>{event.subtitle}</p></article>)}{!history.length && <p className={styles.empty}>Nenhum manejo registrado para este animal.</p>}
      </>}
    </div></Modal>}
  </div>;
}
