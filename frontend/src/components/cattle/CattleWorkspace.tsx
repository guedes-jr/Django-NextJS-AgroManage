"use client";
import { useOrganizationLocale, type TranslationKey } from "@/lib/locale";
import { translateMessage, type AppLanguage } from "@/lib/localeMessages";

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

const getStatuses = (t: (key: TranslationKey) => string): Record<string, string> => ({ active: t("users.active"), sold: t("workspace.sold"), finished: t("workspace.closed"), dead: t("workspace.dead"), em_preparo: t("cattleReproduction.preparing"), vazia: t("cattleReproduction.empty"), pronta: t("workspace.ready"), coberta: t("cattleReproduction.awaitingDiagnosis"), gestante: t("workspace.pregnant"), lactante: t("cattleReproduction.inLactation"), descanso: t("swineReproduction.resting"), ativa: t("users.active"), aguardando_cobertura: t("cattleReproduction.awaitingMating") });
const moduleTones: Record<string, string> = { "feed-entry": "orange", "medication-entry": "emerald", animals: "green", batches: "orange", pastures: "emerald", management: "slate", weights: "blue", reproduction: "purple", health: "green", milk: "cyan", feeding: "blue", sales: "emerald", reports: "cyan" };
const categories = ["Bezerro", "Garrote", "Novilha", "Touro", "Matriz", "Vaca", "Terminação", "Reprodutor"];



const number = (value: unknown, language = "pt-BR") => value === undefined || value === null ? "—" : Number(value).toLocaleString(language, { maximumFractionDigits: 2 });
const date = (value?: string | null, language = "pt-BR") => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(language) : "—";
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
const options = (values: string[] | Record<string, string>) => Array.isArray(values) ? values.map(value => ({ value, label: value })) : Object.entries(values).map(([value, label]) => ({ value, label }));


const positive = (name: string, label: string, required = true): CattleField => ({ name, label, type: "number", min: "0.01", step: "0.01", required });
const payload = (values: Record<string, string>) => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ""));
function Table({ columns, children }: { columns: string[]; children: ReactNode }) { return <div className="table-responsive"><table className={styles.table}><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }

function animalAge(birth?: string | null, language: AppLanguage = "pt-BR") {
  if (!birth) return "—";
  const born = new Date(`${birth}T12:00:00`);
  const now = new Date();
  if (Number.isNaN(born.getTime()) || born > now) return "—";
  const months = (now.getFullYear() - born.getFullYear()) * 12 + now.getMonth() - born.getMonth() - (now.getDate() < born.getDate() ? 1 : 0);
  if (months < 1) return translateMessage(language, "workspace.lessThan1Month");
  return new Intl.NumberFormat(language, { style: "unit", unit: months < 12 ? "month" : "year", unitDisplay: "long" }).format(months < 12 ? months : Math.floor(months / 12));
}

function DairyAnimalStatus({ animal }: { animal: CattleAnimal }) {
  const { t } = useOrganizationLocale();
  const statuses = getStatuses(t);
  if (animal.status !== "active") return <span className={styles.animalBadge} data-tone="muted">{statuses[animal.status] || animal.status}</span>;
  return <div className={styles.animalBadges}>
    {animal.is_lactating && <span className={styles.animalBadge} data-tone="green">{t("cattleReproduction.lactation")}</span>}
    {animal.gender === "F" && animal.reproductive_status === "gestante" && <span className={styles.animalBadge} data-tone="blue">{t("workspace.pregnant")}</span>}
    {!animal.is_lactating && animal.gender === "F" && animal.reproductive_status === "descanso" && <span className={styles.animalBadge} data-tone="amber">{t("workspace.dry")}</span>}
    {!animal.is_lactating && !(animal.gender === "F" && ["gestante", "descanso"].includes(animal.reproductive_status)) && <span className={styles.animalBadge} data-tone="muted">{animal.gender === "M" ? t("users.active") : statuses[animal.reproductive_status] || t("structure.dedicated.active")}</span>}
  </div>;
}

function AnimalRowActions({ compact, identifier, children }: { compact: boolean; identifier: string; children: ReactNode }) {
  const { t } = useOrganizationLocale();
  if (!compact) return <div className={styles.actions}>{children}</div>;
  return <details className={styles.rowMenu}>
    <summary aria-label={t("workspace.actionsForAnimalValue", { value: identifier })} title={t("workspace.animalActions")}><MoreHorizontal size={19} aria-hidden="true"/></summary>
    <div className={styles.rowMenuItems} onClick={event => {
      if ((event.target as HTMLElement).closest("button")) (event.currentTarget.parentElement as HTMLDetailsElement).open = false;
    }}>{children}</div>
  </details>;
}

export function CattleWorkspace({ view = "overview", production, youngFemales = false, dairyAnimals = false, initialReproductionTab = "dashboard", initialMedication = false }: { initialMedication?: boolean; initialReproductionTab?: string; view?: CattleView; production?: "beef" | "dairy"; youngFemales?: boolean; dairyAnimals?: boolean }) {
  const { language, t } = useOrganizationLocale();
  const statuses = getStatuses(t);
  const categoryKeys: Record<string, TranslationKey> = { "Bezerro": "workspace.maleCalf", "Garrote": "workspace.yearlingMale", "Novilha": "workspace.heifer", "Touro": "workspace.bull", "Matriz": "swineReproduction.matrix", "Vaca": "workspace.cow", "Terminação": "swine.categoryFinishing", "Reprodutor": "swine.categoryBoar" };
  const categoryOptions = categories.map(value => ({ value, label: categoryKeys[value] ? t(categoryKeys[value]) : value }));
const modules = [
  { id: "overview", label: t("swine.tabOverview"), href: root, icon: LayoutDashboard, description: t("workspace.beefAndDairyHerdIndicators") },
  { id: "animals", label: t("swine.home.module.registry"), href: `${root}/cadastro`, icon: ClipboardList, description: t("swine.home.module.registryDescription") },
  { id: "batches", label: t("lotReport.batches"), href: `${root}/lotes`, icon: Tags, description: t("workspace.breedingRearingFinishingAndReproduction") },
  { id: "management", label: t("workspace.managementOperations"), href: `${root}/manejos`, icon: ClipboardCheck, description: t("workspace.weighingHealthAndCastrationWithReviewAndConfirmation") },
  { id: "weights", label: t("workspace.weighings"), href: `${root}/pesagens`, icon: Scale, description: t("workspace.currentWeightTrendsAndAverageDailyGain") },
  { id: "reproduction", label: t("cattleReproduction.production"), href: `${root}/reproducao`, icon: VenusAndMars, description: t("workspace.matingsDiagnosisCalvingsAndCalves") },
  { id: "health", label: t("swine.overviewHealth"), href: `${root}/sanidade`, icon: HeartPulse, description: t("workspace.vaccinesTestsTreatmentsAndOccurrences") },
  { id: "pastures", label: t("workspace.pastures"), href: `${root}/pastos`, icon: MapPin, description: t("workspace.paddocksAreaAndOccupancyByBatch") },
  { id: "operations", label: t("workspace.managementCenter"), href: `${root}/operacoes`, icon: ClipboardList, description: t("workspace.purposeTransfersOccurrencesImportsAndProtocols") },
  { id: "milk", label: t("workspace.milk"), href: `${root}/leite`, icon: Milk, description: t("workspace.milkingsByCowAndSessionProductionAndDiscards") },
  { id: "feed-entry", label: t("workspace.recordFeed"), href: `${root}/racao/tratos`, icon: Wheat, description: t("workspace.recordFeedSupplyPerBatchWithStockDeduction") },
  { id: "medication-entry", label: t("workspace.administerMedicines"), href: `${root}/manejos?launch=medication`, icon: Syringe, description: t("workspace.recordAdministrationsDosesAndWithdrawalPeriods") },
  { id: "feeding", label: t("animalDetail.feed"), href: `${root}/racao`, icon: Wheat, description: t("workspace.consumptionFormulasAndFeedProduction") },
  { id: "sales", label: t("workspace.sales"), href: `${root}/vendas`, icon: BadgeDollarSign, description: t("workspace.batchSalesAndFinancialIncome") },
  { id: "reports", label: t("swine.home.module.reports"), href: `${root}/relatorios`, icon: ChartNoAxesCombined, description: t("workspace.herdInventoryFeedingCostsAndResults") },
];
const phases: Record<string, string> = { creche: "Cria", crescimento: "Recria", engorda: "Engorda", reproducao: "Reprodução" };
const sessions: Record<string, string> = { morning: t("workspace.morningLabel"), afternoon: "Tarde", evening: "Noite" };
const notes: CattleField = { name: "notes", label: t("reproduction.observations"), type: "textarea" };
const dayField: CattleField = { name: "date", label: t("lotReport.date"), type: "date", required: true };
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
  const [farm] = useState("");
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
      }).catch(error => { if (!controller.signal.aborted) { setRows([]); setError(cattleError(error, language)); } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [view, resource, page, search, status, category, farm, withdrawal, refresh, manager, youngFemales, dairyAnimals, dairyTab, reproductionGroup, reproductionPageSize, reproductionStatus, production, language]);

  useEffect(() => {
    if (!historyAnimal) return;
    const controller = new AbortController();
    cattleService.history(historyAnimal.id, controller.signal).then(data => { if (!controller.signal.aborted) setHistory(data); })
      .catch(error => { if (!controller.signal.aborted) setHistoryError(cattleError(error, language)); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [historyAnimal, language]);

  const farmField: CattleField = { name: "farm_id", label: t("dairy.home.farm"), type: "select", required: true, options: farms.map(farm => ({ value: farm.id, label: farm.name })) };
  const farmInitial = farm || (farms.length === 1 ? farms[0].id : "");
  const openHistory = (animal: CattleAnimal) => { setHistory([]); setHistoryError(""); setHistoryLoading(true); setHistoryAnimal(animal); };
  async function resolveAnimal(values: Record<string, string>) {
    const data = await cattleService.list<CattleAnimal>("animals", { identifier: values.identifier.trim(), farm: values.farm_id, status: "active" });
    if (data.results.length !== 1) throw { response: { data: { detail: t("workspace.earTagNotFoundOnThisFarmRegisterTheAnimal") } } };
    return data.results[0];
  }
  async function animalForm(animal?: CattleAnimal, preset: { gender?: "F" | "M"; category?: string } = {}) {
    setPreparing(true); setError("");
    try {
      const batches = await cattleService.all<CattleBatch>("batches", { status: "active" });
      const editing = !!animal;
      const fields: CattleField[] = [
        { ...farmField, section: "animal", readOnly: editing },
        { name: "name", label: t("cattleReproduction.name"), maxLength: 100, section: "animal" },
        { name: "identifier", label: t("workspace.earTagIdentification"), required: true, maxLength: 50, section: "animal" },
        { name: "breed_name_input", label: t("cattleReproduction.breed"), section: "animal", readOnly: editing },
        { name: "coat_color", label: t("workspace.colorCoat"), maxLength: 80, section: "animal" },
        { name: "gender", label: t("workspace.sex"), type: "select", required: true, options: options({ F: t("workspace.female"), M: t("workspace.male") }), section: "animal", readOnly: editing },
        { name: "category", label: t("lotReport.category"), type: "select", required: true, options: categoryOptions, section: "animal" },
        { name: "batch", label: t("workspace.sourceBatchOptional"), type: "select", section: "animal", dependsOn: "farm_id", options: batches.map(row => ({ value: row.id, label: row.batch_code, parentValue: row.farm_id })), readOnly: editing },
        { name: "sire_identifier_input", label: t("workspace.registeredSireSEarTag"), section: "genealogy", maxLength: 50 },
        { name: "dam_identifier_input", label: t("workspace.registeredDamSEarTag"), section: "genealogy", maxLength: 50 },
        { name: "sire_name", label: t("workspace.externalSireNameRegistration"), section: "genealogy" },
        { name: "dam_name", label: t("workspace.externalDamNameRegistration"), section: "genealogy" },
        { name: "birth_date", label: t("poultryReproduction.birth"), type: "date", max: today(), section: "development" },
        { name: "entry_date", label: t("workspace.farmEntry"), type: "date", required: true, max: today(), section: "development", readOnly: editing },
        { ...positive("birth_weight_kg", t("workspace.birthWeightKg"), false), section: "development" },
        ...(!editing ? [{ name: "initial_weaning_date", label: t("workspace.previousWeaningIfKnown"), type: "date" as const, max: today(), section: "development" }] : []),
        { ...positive("initial_weight_kg", editing ? "Peso de entrada (kg)" : "Peso na entrada (kg)", false), section: "development", readOnly: editing },
        ...(editing ? [{ name: "current_weight_kg", label: t("workspace.recordedCurrentWeightKg"), type: "number" as const, readOnly: true, section: "development" }, { name: "weaning_date", label: t("workspace.recordedWeaning"), type: "date" as const, readOnly: true, section: "development" }] : []),
        { name: "reproductive_status", label: editing ? t("workspace.recordedReproductiveStatus") : t("workspace.initialStatus"), visibleWhen: { field: "gender", value: "F" }, type: "select", options: options(editing ? statuses : { vazia: "Vazia", em_preparo: "Em preparo", pronta: "Pronta para cobertura", lactante: "Em lactação / com cria", descanso: "Pós-parto / descanso" }), section: "reproduction", readOnly: editing },
        { name: "historical_birth_count", label: t("workspace.reportedCalvingsBeforeRegistration"), type: "number", min: "0", max: "32767", step: "1", visibleWhen: { field: "gender", value: "F" }, section: "reproduction" },
        { name: "historical_last_birth_date", label: t("workspace.reportedLastPreviousCalving"), type: "date", max: today(), visibleWhen: { field: "gender", value: "F" }, section: "reproduction" },
        ...(editing ? [{ name: "birth_count", label: t("workspace.calvingsRecordedInTheSystem"), type: "number" as const, readOnly: true, section: "reproduction" }, { name: "last_mating_date", label: t("workspace.lastRecordedMatingAi"), type: "date" as const, readOnly: true, section: "reproduction" }, { name: "expected_birth_date", label: t("workspace.recordedExpectedCalving"), type: "date" as const, readOnly: true, section: "reproduction" }, { name: "gestation_days", label: t("swineReproduction.gestationDays"), type: "number" as const, readOnly: true, section: "reproduction" }] : []),
        { name: "genealogical_registration", label: t("workspace.pedigreeRegistrationRgd"), maxLength: 80, section: "additional" },
        { name: "embryo_role", label: t("workspace.embryoRole"), type: "select", options: options({ donor: "Doadora", recipient: "Receptora" }), visibleWhen: { field: "gender", value: "F" }, section: "additional" },
        { name: "cattle_purpose", label: t("workspace.productionPurpose"), type: "select", options: options({ unknown: t("lotReport.notInformed"), beef: t("workspace.beef"), dairy: t("workspace.milk"), dual: t("workspace.dualPurpose") }), section: "animal" },
        { name: "dairy_aptitude", label: t("workspace.dairyAptitude"), type: "checkbox", section: "additional" },
        { name: "beef_aptitude", label: t("workspace.beefAptitude"), type: "checkbox", section: "additional" },
        { ...notes, section: "additional" },
      ];
      const initial: Record<string, string> = animal ? Object.fromEntries(fields.map(field => [field.name, String(({ ...animal, farm_id: animal.farm, breed_name_input: animal.breed_name, sire_identifier_input: animal.sire_identifier, dam_identifier_input: animal.dam_identifier } as Record<string, unknown>)[field.name] ?? "")])) : { farm_id: farmInitial, entry_date: today(), gender: "F", category: "Vaca", reproductive_status: "vazia", historical_birth_count: "0", dairy_aptitude: "false", beef_aptitude: "false", cattle_purpose: production || "unknown", ...preset };
      setForm({ title: editing ? t("workspace.editBovineValue", { value: animal.identifier }) : t("workspace.registerBovine"), description: t("workspace.individualRegistrationParentageAndAnimalHistory"), initial, fields,
        sections: [{ id: "animal", title: t("workspace.animalDetails") }, { id: "genealogy", title: t("workspace.parentageGenealogy"), description: t("workspace.useEarTagsFromTheSameFarmOrEnterExternal") }, { id: "reproduction", title: t("workspace.reproductiveInformation"), description: t("workspace.reportedHistoryDoesNotCreateMatingsPregnanciesOrCalvingsRecord") }, { id: "development", title: t("workspace.birthAndDevelopment"), description: t("workspace.laterWeighingsAndWeaningAreRecordedInManagementOperations") }, { id: "additional", title: t("workspace.additionalInformation"), description: t("workspace.productionPurposeSeparatesTheSegmentsAptitudeAndLactationAreIndependent") }],
        submitLabel: t("workspace.saveRegistration"), save: values => {
          const data: Record<string, unknown> = Object.fromEntries(fields.filter(field => !field.readOnly && (!field.visibleWhen || values[field.visibleWhen.field] === field.visibleWhen.value)).map(field => [field.name, values[field.name] ?? ""]));
          for (const key of ["birth_date", "birth_weight_kg", "historical_last_birth_date", "initial_weaning_date"]) if (data[key] === "") data[key] = null;
          if (data.historical_birth_count === "") data.historical_birth_count = 0;
          if (!editing) return cattleService.create("animals", { ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== "")), reproductive_status: values.gender === "M" ? "ativa" : values.reproductive_status || "vazia" });
          return cattleService.update("animals", animal.id, data);
        },
      });
    } catch (error) { setError(cattleError(error, language)); } finally { setPreparing(false); }
  }
  function newAnimal(preset: { gender?: "F" | "M"; category?: string } = {}) { void animalForm(undefined, preset); }
  function editAnimal(animal: CattleAnimal) { void animalForm(animal); }
  function newBatch() {
    setForm({ title: t("workspace.registerCattleBatch"), description: t("workspace.useCollectiveBatchesForAnimalsWithoutIndividualRegistrationQuantitiesMust"),
      initial: { cattle_purpose: production || "unknown", farm_id: farmInitial, phase: "crescimento", category: "Garrote", entry_date: today(), origin: "purchased", gender: "Misto" },
      fields: [farmField, { name: "cattle_purpose", label: t("workspace.productionPurpose"), type: "select", required: true, options: options({ unknown: t("lotReport.notInformed"), beef: t("workspace.beef"), dairy: t("workspace.milk"), dual: t("workspace.dualPurpose") }) }, { name: "batch_code", label: t("clinical.batchCode"), required: true, maxLength: 50 }, { name: "name", label: t("cattleReproduction.name") }, { name: "phase", label: t("workspace.phase"), type: "select", required: true, options: options(phases) }, { name: "category", label: t("lotReport.category"), type: "select", required: true, options: categoryOptions }, { name: "quantity", label: t("reproduction.animalQuantity"), type: "number", required: true, min: "1", step: "1" }, { name: "gender", label: t("workspace.sex"), type: "select", required: true, options: options({ M: t("livestock.registration.males"), F: t("livestock.registration.females"), Misto: "Misto" }) }, { name: "origin", label: t("animalDetail.origin"), type: "select", required: true, options: options({ purchased: "Comprado", born: t("workspace.bornOnTheFarm"), donated: "Doado" }) }, { name: "breed_name_input", label: t("cattleReproduction.breed") }, { name: "entry_date", label: t("swineReproduction.entry"), type: "date", required: true, max: today() }, positive("avg_weight_kg", t("workspace.averageWeightPerAnimalKg"), false), ...(manager ? [positive("purchase_value", t("workspace.totalPurchaseAmountR"), false), { name: "purchase_due_date", label: t("workspace.purchaseDueDate"), type: "date" } satisfies CattleField] : []), notes], save: values => cattleService.create("batches", payload(values)),
    });
  }
  function weighing(row: CattleAnimal | CattleBatch, batch = false) {
    setForm({ title: t("workspace.weighingValue", { value: batch ? (row as CattleBatch).batch_code : (row as CattleAnimal).identifier }), description: batch ? "Informe o peso médio por animal do lote." : "A pesagem será adicionada ao histórico do animal.", initial: { weighing_date: today() }, fields: [positive("weight_kg", batch ? "Peso médio (kg/animal)" : "Peso (kg)"), { name: "weighing_date", label: t("reproduction.weighingDate"), type: "date", required: true, max: today() }, notes], save: values => cattleService.action(batch ? "batches" : "animals", row.id, "register-weight", values) });
  }
  function mating(animal: CattleAnimal) {
    setForm({ title: `Cobertura · ${animal.identifier}`, initial: { mating_date: today(), mating_type: "natural" }, fields: [{ name: "mating_date", label: t("swineReproduction.coverageDate"), type: "date", required: true, max: today() }, { name: "mating_type", label: t("workspace.method"), type: "select", required: true, options: options({ natural: t("swineReproduction.naturalMating"), ai: t("swineReproduction.artificialInsemination"), iatf: "IATF" }) }, { name: "sire_info", label: t("workspace.bullSemenIdentification"), required: true }, { name: "expected_diagnosis_date", label: t("workspace.expectedDiagnosisDateSetByThePersonResponsible"), type: "date" }, notes], save: values => cattleService.action("animals", animal.id, "register-mating", values) });
  }
  async function agendaAnimalAction(event: CattleAgendaEvent) {
    if (!event.animal) return;
    setPreparing(true); setError("");
    try { const animal = await cattleService.animal(event.animal); if (event.kind === "birth") birth(animal); else diagnosis(animal); }
    catch (error) { setError(cattleError(error, language)); } finally { setPreparing(false); }
  }
  function diagnosis(animal: CattleAnimal) {
    setForm({ title: t("workspace.pregnancyDiagnosisValue", { value: animal.identifier }), initial: { diagnosis_date: today() }, fields: [{ name: "diagnosis_date", label: t("reproduction.diagnosisDate"), type: "date", required: true, max: today() }, { name: "result", label: t("reproduction.result"), type: "select", required: true, options: options({ positive: t("workspace.positive"), negative: t("workspace.negative") }) }], save: values => cattleService.action("animals", animal.id, "diagnose-pregnancy", values) });
  }
  function birth(animal: CattleAnimal) {
    setForm({ title: t("workspace.recordCalvingValue", { value: animal.identifier }), description: t("workspace.forALiveBirthEnterTheCalfSEarTag"), initial: { date: today(), outcome: "alive", calf_gender: "F" }, fields: [{ ...dayField, max: today() }, { name: "outcome", label: t("reproduction.result"), type: "select", required: true, options: options({ alive: t("workspace.liveBirth"), stillborn: "Natimorto" }) }, { name: "calf_identifier", label: t("workspace.calfEarTagLiveBirth"), maxLength: 50 }, { name: "calf_gender", label: t("workspace.calfSex"), type: "select", options: options({ F: t("workspace.female"), M: t("workspace.male") }) }, positive("weight_kg", t("workspace.birthWeightKg"), false), notes], save: values => cattleService.action("animals", animal.id, "record-birth", payload(values)) });
  }
  function event(animal: CattleAnimal, initialKind?: string) {
    const kinds: Record<string, string> = { death: "Morte" };
    if (animal.reproductive_status === "gestante") kinds.abortion = "Perda gestacional / aborto";
    if (animal.category === "Bezerro") kinds.weaning = "Desmame";
    if (animal.gender === "M" && !animal.is_castrated) kinds.castration = "Castração";
    if (animal.gender === "F" && animal.is_lactating) kinds.dry_off = "Secagem";
    if (animal.gender === "F" && ["Vaca", "Matriz"].includes(animal.category) && !animal.is_lactating) kinds.start_lactation = "Iniciar lactação";
    setForm({ title: `Manejo · ${animal.identifier}`, description: t("workspace.weaningMayIncludeTheCalfSWeightAndDestinationGroup"), initial: { date: today(), ...(initialKind ? { kind: initialKind } : {}) }, fields: [{ name: "kind", label: t("workspace.managementOperation"), type: "select", required: true, options: options(kinds) }, { ...dayField, max: today() }, ...(animal.category === "Bezerro" ? [positive("weight_kg", t("workspace.weaningWeightKgWeaningOnly"), false), { name: "destination_group", label: t("workspace.destinationManagementGroupWeaningOnly"), maxLength: 100 } satisfies CattleField] : []), { ...notes, required: true }], save: values => cattleService.action("animals", animal.id, "record-event", payload(values)) });
  }
  async function vaccination(animal: CattleAnimal) {
    setPreparing(true);
    try {
      const vaccines = (await cattleService.stockItems()).filter(item => ["vacina", "medicamento_vacina"].includes(item.categoria));
      setForm({ title: t("workspace.vaccinationValue", { value: animal.identifier }), description: t("workspace.selectAVaccineFromStockToRecordConsumptionForExternal"), initial: { application_date: today(), dose_type: "primeira" }, fields: [{ name: "vaccine_item_id", label: t("workspace.vaccineFromStock"), type: "select", options: vaccines.map(item => ({ value: item.id, label: `${item.nome.slice(0, 30)}${item.nome.length > 30 ? "..." : ""} · ${number(item.estoque_atual, language)} ${item.unidade_medida}` })) }, { name: "vaccine_name", label: t("workspace.vaccineNameExternalAdministration") }, { name: "application_date", label: t("reproduction.applicationDateCapitalized"), type: "date", required: true, max: today() }, { name: "dose_type", label: t("reproduction.doseType"), type: "select", required: true, options: options({ unica: t("reproduction.singleDose"), primeira: t("clinical.firstDose"), segunda: t("clinical.secondDose"), terceira: t("clinical.thirdDose"), reforco: t("reproduction.boosterDose") }) }, positive("dosage_ml", t("workspace.administeredDoseMl"), false), notes], save: values => cattleService.action("animals", animal.id, "register-vaccination", payload(values)) });
    } catch (error) { setError(cattleError(error, language)); } finally { setPreparing(false); }
  }
  function health(animal: CattleAnimal) {
    setForm({ title: t("workspace.healthRecordValue", { value: animal.identifier }), initial: { application_date: today(), treatment_type: "exam" }, fields: [{ name: "treatment_type", label: t("plantations.labor.workerType"), type: "select", required: true, options: options({ medication: t("swineReproduction.medication"), exam: "Exame", surgery: "Cirurgia", other: t("reproduction.other") }) }, { name: "description", label: t("workspace.descriptionResult"), type: "textarea", required: true }, { name: "application_date", label: t("lotReport.date"), type: "date", required: true, max: today() }, { name: "veterinary", label: t("clinical.responsibleVeterinarian") }, notes], save: values => clinicalService.createHealthRecord({ ...values, animal: animal.id, farm: animal.farm }) });
  }
  function newMilk() {
    setForm({ title: t("workspace.recordMilking"), description: t("workspace.enterTheEarTagOfAFemaleBovineRegisteredOn"), initial: { farm_id: farmInitial, date: today(), session: "morning", discarded_liters: "0" }, fields: [farmField, { name: "identifier", label: t("workspace.cowEarTag"), required: true, maxLength: 50 }, { ...dayField, max: today() }, { name: "session", label: t("workspace.session"), type: "select", required: true, options: options(sessions) }, positive("liters", t("workspace.totalProductionLiters")), { name: "discarded_liters", label: t("workspace.discardedMilkLiters"), type: "number", min: "0", step: "0.01", required: true }, { name: "discard_reason", label: t("workspace.discardReasonRequiredIfAnyMilkIsDiscarded"), maxLength: 200 }, notes], save: async values => { const animal = await resolveAnimal(values); return cattleService.create("milk", { animal: animal.id, date: values.date, session: values.session, liters: values.liters, discarded_liters: values.discarded_liters, discard_reason: values.discard_reason || "", notes: values.notes || "" }); } });
  }
  async function newFeed() {
    setPreparing(true);
    try {
      const items = (await cattleService.stockItems()).filter(item => ["racao", "suplemento", "nucleo"].includes(item.categoria) && item.unidade_medida === "kg" && ["", "bovino", "multiplo"].includes(item.especie_animal || ""));
      const batches = await cattleService.all<CattleBatch>("batches", { status: "active", ...(production ? { production } : {}) });
      setForm({ title: t("workspace.recordFeeding"), description: t("workspace.enterACollectiveBatchOrAnAnimalSEarTag"), initial: { farm_id: farmInitial, destination: "batch", data_inicio: today(), data_fim: today() }, fields: [farmField, { name: "destination", label: t("crops.destination"), type: "select", required: true, options: options({ batch: t("workspace.collectiveBatch"), animal: t("workspace.animalByEarTag") }) }, { name: "batch_id", label: t("workspace.collectiveBatch"), type: "select", required: true, dependsOn: "farm_id", visibleWhen: { field: "destination", value: "batch" }, options: batches.map(batch => ({ value: batch.id, label: `${batch.batch_code} · ${batch.quantity} animais`, parentValue: batch.farm_id })) }, { name: "identifier", label: t("cattleReproduction.tag"), required: true, maxLength: 50, visibleWhen: { field: "destination", value: "animal" } }, { name: "item_estoque", label: t("workspace.feedSupplementInStockKg"), type: "select", required: true, options: items.map(item => ({ value: item.id, label: `${item.nome.slice(0, 30)}${item.nome.length > 30 ? "..." : ""} · ${number(item.estoque_atual, language)} kg` })) }, { name: "data_inicio", label: t("workspace.periodStart"), type: "date", required: true, max: today() }, { name: "data_fim", label: t("workspace.periodEnd"), type: "date", required: true, max: today() }, positive("quantidade", t("workspace.totalQuantityConsumedKg")), notes], save: async values => {
        let target: Record<string, unknown>;
        if (values.destination === "animal") target = { animais: [(await resolveAnimal(values)).id] };
        else {
          const batch = batches.find(row => row.id === values.batch_id && row.farm_id === values.farm_id);
          if (!batch) throw new Error("Selecione um lote da fazenda.");
          target = { lote_animal: batch.id };
        }
        return cattleService.create("feed", { ...target, item_estoque: values.item_estoque, data_inicio: values.data_inicio, data_fim: values.data_fim, quantidade: values.quantidade, tipo_registro: "total_periodo", observacao: values.notes || "" });
      } });
    } catch (error) { setError(cattleError(error, language)); } finally { setPreparing(false); }
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
    } catch (error) { setError(cattleError(error, language)); } finally { setPreparing(false); }
  }
  function editMilk(row: CattleMilk) {
    setForm({ title: t("workspace.correctMilkingValue", { value: row.identifier }), initial: { date: row.date, session: row.session, liters: row.liters, discarded_liters: row.discarded_liters, discard_reason: row.discard_reason || "", notes: row.notes || "" }, fields: [{ ...dayField, max: today() }, { name: "session", label: t("workspace.session"), type: "select", required: true, options: options(sessions) }, positive("liters", t("workspace.totalProductionLiters")), { name: "discarded_liters", label: t("workspace.discardedLiters"), type: "number", min: "0", step: "0.01", required: true }, { name: "discard_reason", label: t("workspace.discardReason"), maxLength: 200 }, notes], save: values => cattleService.update("milk", row.id, values) });
  }
  function newPasture() {
    setForm({ title: t("workspace.registerPasturePaddock"), initial: { farm_id: farmInitial, availability: "unknown" }, fields: [farmField, { name: "name", label: t("workspace.pastureName"), required: true }, positive("area_ha", t("plantations.detail.area")), positive("max_stocking_ua_ha", t("workspace.maximumStockingUaHa1Ua450Kg"), false), { name: "availability", label: t("workspace.availability"), type: "select", required: true, options: options({ unknown: t("plantations.detail.notProvided"), available: "Liberado", resting: t("swineReproduction.resting"), blocked: "Interditado" }) }, { name: "availability_reason", label: t("workspace.reasonAvailabilityGuidance"), maxLength: 255 }, notes], save: values => cattleService.create("pastures", { farm: values.farm_id, name: values.name, area_ha: values.area_ha, max_stocking_ua_ha: values.max_stocking_ua_ha || null, availability: values.availability, availability_reason: values.availability_reason || "", notes: values.notes || "" }) });
  }
  function editPasture(pasture: CattlePasture) {
    setForm({ title: t("workspace.editPastureValue", { value: pasture.name }), initial: { name: pasture.name, area_ha: pasture.area_ha, max_stocking_ua_ha: pasture.max_stocking_ua_ha || "", availability: pasture.availability, availability_reason: pasture.availability_reason || "", notes: pasture.notes || "" }, fields: [{ name: "name", label: t("workspace.pastureName"), required: true }, positive("area_ha", t("plantations.detail.area")), positive("max_stocking_ua_ha", t("workspace.maximumStockingUaHa1Ua450Kg"), false), { name: "availability", label: t("workspace.availability"), type: "select", required: true, options: options({ unknown: t("plantations.detail.notProvided"), available: "Liberado", resting: t("swineReproduction.resting"), blocked: "Interditado" }) }, { name: "availability_reason", label: t("workspace.reasonAvailabilityGuidance"), maxLength: 255 }, notes], save: values => cattleService.update("pastures", pasture.id, { ...values, max_stocking_ua_ha: values.max_stocking_ua_ha || null }) });
  }
  function grazing(pasture: CattlePasture) {
    setForm({ title: t("workspace.pastureEntryValue", { value: pasture.name }), description: t("workspace.enterTheCodeOfAnActiveBatchFromFarmValue", { value: pasture.farm_name }), initial: { entry_date: today() }, fields: [{ name: "batch_code", label: t("clinical.batchCode"), required: true, maxLength: 50 }, { name: "entry_date", label: t("workspace.pastureEntry"), type: "date", required: true, max: today() }, notes], save: async values => { const data = await cattleService.list<CattleBatch>("batches", { farm: pasture.farm, batch_code: values.batch_code.trim(), status: "active" }); if (data.results.length !== 1) throw { response: { data: { detail: t("workspace.activeBatchNotFoundOnThisFarm") } } }; return cattleService.create("grazings", { pasture: pasture.id, batch: data.results[0].id, entry_date: values.entry_date, notes: values.notes || "" }); } });
  }
  function closeGrazing(row: CattleGrazing) {
    setForm({ title: t("workspace.pastureExitValue", { value: row.batch_code }), initial: { exit_date: today() }, fields: [{ name: "exit_date", label: t("workspace.exitDate"), type: "date", min: row.entry_date, max: today(), required: true }], save: values => cattleService.action("grazings", row.id, "close", values) });
  }
  function changePhase(batch: CattleBatch) {
    setForm({ title: t("workspace.changePhaseValue", { value: batch.batch_code }), initial: { date: today(), category: batch.category }, fields: [{ name: "category", label: t("workspace.categoryAfterTheChangeConfirm"), type: "select", required: true, options: categoryOptions }, { name: "phase", label: t("workspace.newPhase"), type: "select", required: true, options: options(phases).filter(option => option.value !== batch.phase) }, { ...dayField, min: batch.entry_date, max: today() }, notes], save: values => cattleService.action("batches", batch.id, "change-phase", values) });
  }
  async function chooseBatchResult() {
    setPreparing(true); setError("");
    try {
      const batches = await cattleService.all<CattleBatch>("batches", { ...(farm ? { farm } : {}), ...(production ? { production } : {}) });
      if (!batches.length) { setError(t("workspace.noBatchFoundForThisSegmentAndFarm")); return; }
      setForm({ title: t("workspace.batchFinancialResult"), description: t("workspace.selectAnActiveOrClosedBatchToViewItsCosts"), fields: [{ name: "batch", label: t("workspace.batchFarm"), type: "select", required: true, options: batches.map(batch => ({ value: batch.id, label: `${batch.batch_code} · ${batch.farm_name} · ${statuses[batch.status] || batch.status}` })) }], submitLabel: t("workspace.viewResult"), save: async values => {
        const result = await cattleService.batchResult(values.batch);
        setResultBatchId(values.batch); setResultYield(""); setResultError(""); setBatchResult(result);
      } });
    } catch (error) { setError(cattleError(error, language)); } finally { setPreparing(false); }
  }
  async function showBatchResult(batch: CattleBatch) {
    setPreparing(true); setError("");
    try { setResultError(""); setResultBatchId(batch.id); setResultYield(""); setBatchResult(await cattleService.batchResult(batch.id)); }
    catch (error) { setError(cattleError(error, language)); } finally { setPreparing(false); }
  }
  function batchDeath(batch: CattleBatch) {
    const requestKey = crypto.randomUUID();
    setForm({ title: `Mortalidade · ${batch.batch_code}`, description: t("workspace.entryForACollectiveBatchWithoutIndividualIdentificationReducesAvailable"), initial: { date: today() }, fields: [{ ...dayField, min: batch.entry_date, max: today() }, { name: "quantity", label: t("workspace.deadAnimals"), type: "number", min: "1", max: String(batch.quantity), step: "1", required: true }, { name: "reason", label: t("workspace.causeReason"), type: "textarea", required: true }], save: values => cattleService.action("batches", batch.id, "registrar-mortalidade", { ...values, request_key: requestKey }) });
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
      setForm({ title: t("workspace.groupHealthValue", { value: batch.batch_code }), description: t("workspace.administrationToABatchWithoutIndividualEarTagsEnterThe"), initial: { date: today(), quantity: String(batch.quantity), service_cost: "0" }, fields: [
        { ...dayField, min: batch.entry_date, max: today() },
        { name: "quantity", label: t("workspace.treatedAnimals"), type: "number", min: "1", max: String(batch.quantity), step: "1", required: true },
        { name: "description", label: t("workspace.procedureTreatment"), required: true, maxLength: 500 },
        { name: "inventory_lot", label: t("workspace.productAndStockBatchCheckTheUnit"), type: "select", options: lots.map(lot => ({ value: lot.id, label: lot.label })) },
        { ...positive("quantity_per_head", t("workspace.dosePerAnimalInStockUnits"), false), step: "0.0001", min: "0.0001" },
        { ...positive("service_cost", t("workspace.externalServiceCostR"), false), min: "0" }
      ], save: values => cattleService.action("batches", batch.id, "record-treatment", { ...payload(values), request_key: requestKey }) });
    } catch (error) { setError(cattleError(error, language)); } finally { setPreparing(false); }
  }
  function batchCost(batch: CattleBatch) {
    const requestKey = crypto.randomUUID();
    setForm({ title: t("workspace.allocateCostValue", { value: batch.batch_code }), description: t("workspace.recordOnlyExternalCostsNotYetAllocatedHealthServicesPasture"), initial: { date: today() }, fields: [{ ...dayField, min: batch.entry_date, max: today() }, { name: "category", label: t("workspace.costType"), type: "select", required: true, options: options({ sanitary: t("workspace.healthServiceExternalTreatment"), pasture: "Pastagem / arrendamento", labor: t("swine.home.module.workforce"), freight: "Frete", other: t("reproduction.other") }) }, positive("amount", t("plantations.detail.total")), { name: "description", label: t("workspace.descriptionReference"), type: "textarea", required: true }], save: values => cattleService.action("batches", batch.id, "record-cost", { ...values, request_key: requestKey }) });
  }
  function sell(batch: CattleBatch) {
    const carcass = { field: "pricing_basis", value: "carcass_arroba" };
    setForm({ title: `Venda · ${batch.batch_code}`, description: t("workspace.valueAnimalsAvailableNetIncomeRemainsOutstandingUntilReceiptIs", { value: batch.quantity }), initial: { date: today(), due_date: today(), mode: "whole", pricing_basis: "live_kg" }, fields: [
      { name: "mode", label: t("workspace.saleType"), type: "select", required: true, options: options({ whole: t("livestock.sale.wholeBatch"), partial: t("livestock.sale.partialBatch") }) },
      { name: "quantity", label: t("workspace.soldAnimals"), type: "number", min: "1", max: String(batch.quantity), step: "1", required: true, visibleWhen: { field: "mode", value: "partial" } },
      { name: "pricing_basis", label: t("workspace.pricingBasis"), type: "select", required: true, options: options({ live_kg: t("workspace.kgLiveWeight"), carcass_arroba: t("workspace.carcassArroba15Kg") }) },
      positive("weight_kg", t("workspace.totalLiveWeightSoldKg")),
      { ...positive("price_per_kg", t("workspace.pricePerLiveKgR")), step: "0.000001", visibleWhen: { field: "pricing_basis", value: "live_kg" } },
      { ...positive("price_per_arroba", t("workspace.pricePerArrobaR")), visibleWhen: carcass },
      { ...positive("carcass_weight_kg", t("workspace.measuredTotalCarcassWeightKg"), false), visibleWhen: carcass },
      { ...positive("yield_percent", t("workspace.orEstimatedYield"), false), max: "100", visibleWhen: carcass },
      { ...positive("deductions", t("workspace.totalDeductionsR"), false), min: "0" },
      { name: "deduction_description", label: t("workspace.deductionDetailsFreightFunruralEtc"), maxLength: 500 },
      { name: "slaughter_reference", label: t("workspace.deliveryNoteDocumentReference"), maxLength: 200 },
      { ...dayField, min: batch.entry_date, max: today() }, { name: "buyer", label: t("plantations.harvest.buyer"), required: true },
      { name: "due_date", label: t("workspace.receivableDueDate"), type: "date", required: true }, notes
    ], submitLabel: t("workspace.recordSaleAndIncome"), save: values => {
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
    ["Animais ativos (cabeças)", number(overview.total_head, language)], ["Identificados por brinco", number(overview.identified_animals, language)], ["Lotes ativos", number(overview.active_batches, language)],
    ["Fêmeas gestantes identificadas", number(overview.pregnant_females, language)], ["Fêmeas em lactação identificadas", number(overview.lactating_females, language)], ["Peso médio dos identificados (kg)", number(overview.average_identified_weight, language)],
    ["Leite produzido no mês (L)", number(overview.milk_produced_month, language)], ["Leite aproveitável no mês (L)", number(overview.milk_usable_month, language)], ["Área de pastagens (ha)", number(overview.pasture_area_ha, language)],
  ] : [];
  const metricAppearance = [
    { icon: CattleIcon, tone: "rose" }, { icon: Tags, tone: "blue" }, { icon: ClipboardList, tone: "amber" },
    { icon: VenusAndMars, tone: "purple" }, { icon: LactationIcon, tone: "pink" }, { icon: Scale, tone: "blue" },
    { icon: Milk, tone: "cyan" }, { icon: Milk, tone: "emerald" }, { icon: MapPin, tone: "emerald" },
  ];
  const animalsTable = ["animals", "weights", "health"].includes(view);
  const savedForm = () => { setForm(null); setSuccess(t("workspace.recordSavedSuccessfully")); setRefresh(value => value + 1); };
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
                ? t("dairy.home.description")
                : production === "beef"
                ? t("workspace.breedingRearingFinishingWeighingAndSales")
                : t("workspace.manageAllBeefAndDairyCattleOperations")
              : dairyAnimals
              ? t("workspace.cowsCalvesBullsAndDairyHerdRecords")
              : currentModule?.description}
          </p>
        </div>
      </div>
      <div className={styles.headerActions}>
        <button className="btn btn-outline-secondary btn-sm" onClick={() => setRefresh(value => value + 1)} disabled={loading}><RefreshCw size={15} className="me-1" aria-hidden="true" />  {t("inventory.alerts.refresh")}</button>
      </div>
    </header>}
    {success && <div role="status" className="alert alert-success py-2">{success}</div>}
    {error && <div role="alert" className="alert alert-danger">{error} <button className="btn btn-sm btn-outline-danger" onClick={() => setRefresh(value => value + 1)}>{t("lotReport.retry")}</button></div>}
    {loading && !overview ? <div className={styles.empty} role="status">{t("workspace.loadingHerdData")}</div> : !error && <>
      {production && <p className="alert alert-info py-2 small">{t("workspace.thisSegmentIncludesThePurpose")} {production === "dairy" ? t("workspace.dairy") : t("workspace.beefLabel")}  {t("workspace.andDualPurpose")} <Link href={cattleHref(`${root}/operacoes?tab=classification`, production || "beef")}>{t("workspace.reviewUnclassifiedAnimalsAndBatches")}</Link>.</p>}
      {(["overview", "reports", "milk"].includes(view)) && <section className={homeStyles.summaryPanel} aria-labelledby="cattle-summary-title">
        <div className={homeStyles.sectionHeading}><div><span>{view === "milk" ? t("workspace.milkProduction") : t("workspace.herdOverview")}</span><h2 id="cattle-summary-title">{view === "milk" ? t("workspace.milkProductionSummary") : production ? `Resumo · ${productionTitle}` : t("workspace.cattleFarmingSummary")}</h2></div><small className={styles.summaryScope}>{t("dairy.home.allFarms")}</small></div>
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
        headerActions={<><button className="btn btn-outline-secondary btn-sm" disabled={loading} onClick={() => setRefresh(value => value+1)}><RefreshCw size={15} aria-hidden="true"/>  {t("inventory.alerts.refresh")}</button></>}
        onNew={canWrite ? () => newAnimal({ gender: "F", category: reproductionGroup === "heifers" ? "Novilha" : "Vaca" }) : undefined}
        onSelect={value => { setReproductionGroup(value); setPage(1); setSearch(""); setReproductionStatus(""); setRows([]); router.replace(cattleHref(`${root}/reproducao?tab=${value}`, production || "beef"), { scroll: false }); }}
        animals={rows as CattleAnimal[]} pagination={{ page: page-1, pageSize: reproductionPageSize, total: count, onPageChange: value => setPage(value+1), onPageSizeChange: value => { setReproductionPageSize(value); setPage(1); } }}
        search={search} onSearch={value => { setSearch(value); setPage(1); }} status={reproductionStatus} onStatus={value => { setReproductionStatus(value); setPage(1); }}
        canWrite={canWrite && !loading && !preparing} manager={manager} onMating={mating} onDiagnosis={diagnosis} onBirth={birth} onEvent={event} onHistory={openHistory} onEdit={editAnimal} />}

      {view === "health" && <CattleAgenda key={farm || "all"} farm={farm} refresh={refresh} canWrite={canWrite && !preparing} manager={manager} onAnimalAction={agendaAnimalAction} onChanged={() => setRefresh(value => value + 1)} />}
      {view === "management" ? (manager ? <CattleManagementWorkspace key={initialMedication ? "medication" : "management"} initialMedication={initialMedication} production={production} farms={farms} canWrite={canWrite} onChanged={() => setRefresh(value => value + 1)} /> : <p role="alert">{t("workspace.groupManagementRequiresAManagerOrAdministrator")}</p>) : ["overview", "reports"].includes(view) ? <>
        {view === "overview" && <section aria-labelledby="cattle-modules-title" className={styles.operations}>
          <div className={homeStyles.modulesHeading}><div><span>{t("swine.home.operations")}</span><h2 id="cattle-modules-title">{t("swine.home.chooseModule")}</h2></div><p>{t("workspace.chooseAnAreaToContinueManagingTheHerd")}</p></div>
          <div className={homeStyles.moduleGrid}>{activeModules.filter(module => module.id !== "overview" && module.id !== "feeding").map(module => <Link className={homeStyles.moduleCard} data-tone={moduleTones[module.id]} href={cattleHref(module.href, production || "beef")} key={module.id}><div className={homeStyles.moduleIcon} aria-hidden="true"><module.icon size={26} strokeWidth={1.8} /></div><div className={homeStyles.moduleCopy}><h3>{module.label}</h3><p>{module.description}</p></div><span className={homeStyles.moduleAction}>{t("swine.home.open")} <ChevronRight size={19} aria-hidden="true" /></span></Link>)}</div>
        </section>}
        <div className={styles.insightGrid}><section className={styles.panel}><div className={styles.sectionTitle}><ChartNoAxesCombined size={20} aria-hidden="true" /><div><span>{t("workspace.inventory")}</span><h2>{t("workspace.activeHerdComposition")}</h2></div></div>{overview?.categories.length ? overview.categories.map(item => <div className={styles.category} key={item.category}><span>{item.category}</span><progress value={item.quantity} max={overview.total_head} aria-label={item.category} /><strong>{number(item.quantity, language)}</strong></div>) : <p className={styles.muted}>{t("workspace.noActiveAnimalsRegisteredStartWithIndividualRegistrationOrBatches")}</p>}</section>
        <CattleAgenda key={farm || "all"} farm={farm} refresh={refresh} canWrite={canWrite && !preparing} manager={manager} onAnimalAction={agendaAnimalAction} onChanged={() => setRefresh(value => value + 1)} /></div>
        {view === "reports" && manager && <CattleFeedingReport key={`${farm}:${production}`} farm={farm} production={production || "beef"} />}
        {view === "reports" && manager && <section className={styles.panel}><h2>{t("workspace.financialClosingPerBatch")}</h2><p>{t("workspace.purchasesConsumptionHealthAdditionalCostsSalesMarginMortalityAverageDaily")}</p><button disabled={preparing} className="btn btn-success btn-sm mb-3" onClick={chooseBatchResult}>{t("workspace.viewBatchResult")}</button><h2>{t("workspace.exportCattleRecords")}</h2><div className={styles.actions}>{(["animals", "batches", "milk"] as const).map(resource => <button key={resource} disabled={preparing} className="btn btn-outline-success btn-sm" onClick={() => exportCsv(resource)}>{preparing ? t("workspace.preparing") : { animals: "Animais (CSV)", batches: "Lotes (CSV)", milk: "Ordenhas (CSV)" }[resource]}</button>)}</div></section>}

      </> : <>
        {view === "animals" && (
          <div className={homeStyles.modulesHeading}>
            <div>
              <span>{t("workspace.registrationShortcuts")}</span>
              <h2>{t("workspace.whatWouldYouLikeToRegister")}</h2>
            </div>
            <p>{dairyAnimals ? t("workspace.registerCowsYoungFemalesOrBreedingMalesInTheDairy") : t("workspace.registerBreedingFemalesMalesOrCollectiveHerdBatches")}</p>
          </div>
        )}
        {view === "animals" && (
          <section className={styles.registrationGrid} aria-label={t("workspace.registrationActionsByCategory")}>
            {(dairyAnimals
              ? [
                  {
                    title: t("workspace.cowsAndBreedingFemales"),
                    description: t("workspace.registerLactatingOrDryCowsForMilkProduction"),
                    icon: LactationIcon,
                    tone: "green",
                    features: [t("workspace.milkingAndLactationTracking"), t("workspace.reproductiveCyclesAndCalvings"), t("workspace.genealogyAndIndividualHistory")],
                    action: () => newAnimal({ gender: "F", category: "Vaca" }),
                    button: "Cadastrar vaca",
                  },
                  {
                    title: t("workspace.femaleCalvesAndHeifers"),
                    description: t("workspace.youngFemalesForRearingAndDairyHerdReplacement"),
                    icon: CowIcon,
                    tone: "pink",
                    features: [t("workspace.developmentMonitoring"), t("workspace.weighingAndWeightGainTracking"), t("workspace.futureLactatingBreedingFemales")],
                    action: () => newAnimal({ gender: "F", category: "Novilha" }),
                    button: "Cadastrar bezerra / novilha",
                  },
                  {
                    title: t("workspace.bullsAndBreedingMales"),
                    description: t("workspace.breedingMaleIdentificationAndGenealogyTracking"),
                    icon: BullIcon,
                    tone: "blue",
                    features: [t("workspace.individualEarTagIdentification"), t("workspace.genealogyAndMatingTracking"), t("workspace.healthAndWeightMonitoring")],
                    action: () => newAnimal({ gender: "M", category: "Touro" }),
                    button: "Cadastrar touro",
                  },
                ]
              : [
                  {
                    title: t("workspace.femalesAndBreedingCows"),
                    description: t("workspace.registerHerdCowsAndHeifers"),
                    icon: Venus,
                    tone: "purple",
                    features: [t("workspace.reproductiveCycles"), t("workspace.calvingsAndGenealogy"), t("workspace.independentLactation")],
                    action: () => newAnimal({ gender: "F", category: "Vaca" }),
                    button: "Cadastrar fêmea",
                  },
                  {
                    title: t("workspace.malesAndBreedingBulls"),
                    description: t("workspace.individualIdentificationAndMonitoring"),
                    icon: Mars,
                    tone: "blue",
                    features: [t("workspace.earTagAndBreed"), t("workspace.individualWeighings"), t("workspace.managementHistory")],
                    action: () => newAnimal({ gender: "M", category: "Touro" }),
                    button: "Cadastrar macho",
                  },
                  {
                    title: t("workspace.collectiveBatches"),
                    description: t("workspace.animalsWithoutIndividualIdentification"),
                    icon: Layers3,
                    tone: "orange",
                    features: [t("workspace.breedingRearingAndFinishing"), t("workspace.headcountTracking"), t("workspace.averageWeightPerAnimal")],
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
                <span>{dairyAnimals ? t("workspace.dairyHerd") : view === "grazings" ? t("workspace.occupancyHistory") : t("workspace.herdRecords")}</span>
                <h2>{dairyAnimals ? (youngFemales ? t("workspace.femaleCalvesAndHeifers") : t("workspace.registeredAnimals")) : title}</h2>
                <p>{dairyAnimals ? t("workspace.dairyAnimalListAndHistory") : currentModule?.description}</p>
              </div>
            </div>
            <span className={styles.countBadge}>{number(count, language)}  {t("reproduction.records")}</span>
          </div>
        <div className={styles.toolbar}><div className={styles.filters}>
          <label className={styles.searchField}><Search size={17} aria-hidden="true" /><input aria-label={t("workspace.searchRecords")} className="form-control form-control-sm" placeholder={dairyAnimals ? t("workspace.searchByEarTagNameOrBatch") : view === "milk" ? t("workspace.searchByEarTag") : "Buscar registros..."} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
          {(resource === "animals" || resource === "batches") && <select aria-label={t("structure.dedicated.status")} className="form-select form-select-sm" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>{Object.entries({ "": "Todas as situações", active: "Ativos", sold: "Vendidos", dead: "Mortos", finished: "Encerrados" }).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>}
          {resource === "animals" && !dairyAnimals && <select aria-label={t("lotReport.category")} className="form-select form-select-sm" value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}><option value="">{t("notifications.allCategories")}</option>{categories.map(value => <option key={value}>{value}</option>)}</select>}
          {resource === "animals" && <select aria-label={t("workspace.filterWithdrawalPeriods")} className="form-select form-select-sm" value={withdrawal} onChange={event => { setWithdrawal(event.target.value); setPage(1); }}><option value="">{t("workspace.allWithdrawalPeriods")}</option><option value="milk">{t("workspace.inMilkWithdrawalPeriod")}</option><option value="meat">{t("workspace.inSlaughterWithdrawalPeriod")}</option></select>}
        </div><div className={styles.actions}>{manager && ["animals", "batches", "milk"].includes(view) && <button disabled={preparing} className="btn btn-outline-secondary btn-sm" onClick={() => exportCsv(resource as "animals" | "batches" | "milk")}>{t("workspace.exportFilterCsv")}</button>}{view === "pastures" && <Link className="btn btn-outline-secondary btn-sm" href={cattleHref(`${root}/pastos/ocupacoes`, production || "beef")}>{t("workspace.viewOccupancy")}</Link>}{newAction && canWrite && <button className="btn btn-success btn-sm" disabled={preparing} onClick={newAction}><Plus size={15} aria-hidden="true" /> {({ animals: "Cadastrar animal", batches: "Cadastrar lote", milk: "Registrar ordenha", feeding: "Registrar consumo", pastures: "Cadastrar pasto" } as Partial<Record<CattleView, string>>)[view] || t("workspace.newRecord")}</button>}</div></div>
        {dairyAnimals && <nav className={styles.categoryTabs} aria-label={t("workspace.dairyAnimalCategories")}>{[
          ["all", t("crops.allFields")], ["cows", t("cattleReproduction.cows")], ["heifers", t("cattleReproduction.heifers")], ["calves", "Bezerras"], ["bulls", t("workspace.bulls")],
        ].map(([value, label]) => <button type="button" key={value} className={styles.categoryTab} aria-pressed={dairyTab === value} onClick={() => { setDairyTab(value); setPage(1); }} disabled={loading}>{label} <span>({loading ? "…" : categoryCounts[value] ?? 0})</span></button>)}</nav>}
        {view === "feeding" && manager && <div className={`${styles.actions} mb-3`} aria-label={t("livestock.feed.tabs.production")}><Link className="btn btn-outline-secondary btn-sm" href={cattleHref(`${root}/racao/producao`, production || "beef")}>{t("swine.home.module.feedMill")}</Link><Link className="btn btn-outline-secondary btn-sm" href={cattleHref(`${root}/racao/gerenciar-formulas`, production || "beef")}>{t("workspace.manageFormulas")}</Link></div>}
        {view === "feeding" && <Table columns={[t("plantations.operation.period"), t("crops.destination"), t("inventory.movements.feed"), t("inventory.movements.consumption"), ...(manager ? [t("crops.totalCost")] : [])]}>{(rows as CattleFeed[]).map(row => <tr key={row.id}><td>{date(row.data_inicio, language)}<small>{t("plantations.history.through")} {date(row.data_fim, language)}</small></td><td>{row.lote_codigo || row.animais_identificadores.join(", ")}</td><td>{row.item_nome}</td><td>{number(row.quantidade, language)} kg</td>{manager && <td>{Number(row.custo_total || 0).toLocaleString(language, { style: "currency", currency: "BRL" })}</td>}</tr>)}</Table>}
        {view === "pastures" && <p className={styles.muted}>{t("workspace.currentStockingOfOccupiedCollectiveBatchesUsingAverageWeights1")}</p>}
        {view === "batches" && <p className={styles.muted}>{t("workspace.collectiveBatchesOfAnimalsWithoutIndividualIdentificationToRecordA")}</p>}
        {animalsTable && <Table columns={dairyAnimals ? [t("cattleReproduction.tag"), t("cattleReproduction.name"), t("lotReport.category"), t("cattleReproduction.breed"), "Idade", t("users.columnStatus"), t("lotReport.actions")] : ["Brinco / fazenda", t("workspace.categoryBreed"), t("workspace.sex"), t("workspace.currentWeight"), t("lotReport.actions")]}>{(rows as CattleAnimal[]).map(animal => <tr key={animal.id}>{dairyAnimals ? <><td><strong>{animal.identifier}</strong>{!farm && <small>{animal.farm_name}</small>}</td><td>{animal.name || "—"}</td><td>{animal.category === "Bezerro" && animal.gender === "F" ? t("workspace.femaleCalf") : animal.category || "—"}</td><td>{animal.breed_name || "—"}</td><td>{animalAge(animal.birth_date, language)}</td><td><DairyAnimalStatus animal={animal}/>{animal.milk_withdrawal_until && animal.milk_withdrawal_until >= today() && <small className="text-danger">{t("workspace.milkWithdrawalUntil")} {date(animal.milk_withdrawal_until, language)}</small>}{animal.meat_withdrawal_until && animal.meat_withdrawal_until >= today() && <small className="text-danger">{t("workspace.slaughterWithdrawalUntil")} {date(animal.meat_withdrawal_until, language)}</small>}</td></> : <><td><strong>{animal.identifier}</strong><small>{animal.farm_name}</small>{animal.management_group && <small>{t("workspace.group")} {animal.management_group}</small>}{animal.is_castrated && <small>{t("workspace.castrated")}</small>}{animal.is_lactating && <small>{t("cattleReproduction.inLactation")}</small>}{animal.milk_withdrawal_until && animal.milk_withdrawal_until >= today() && <small className="text-danger">{t("workspace.milkWithdrawalUntilLabel")} {date(animal.milk_withdrawal_until, language)}</small>}{animal.meat_withdrawal_until && animal.meat_withdrawal_until >= today() && <small className="text-danger">{t("workspace.slaughterWithdrawalUntilLabel")} {date(animal.meat_withdrawal_until, language)}</small>}</td><td>{animal.category || "—"}<small>{animal.breed_name || t("livestock.registration.noBreed")}</small></td><td>{animal.gender === "F" ? t("workspace.female") : t("workspace.male")}</td><td>{number(animal.current_weight_kg, language)} kg</td></>}<td><AnimalRowActions compact={dairyAnimals} identifier={animal.identifier}>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => openHistory(animal)}>{t("workspace.sheetHistory")}</button>
          {canWrite && animal.status === "active" && <>
            {view === "animals" && manager && <button className="btn btn-outline-secondary btn-sm" onClick={() => editAnimal(animal)}>{t("profile.edit")}</button>}
            {["animals", "weights"].includes(view) && <button className="btn btn-outline-success btn-sm" onClick={() => weighing(animal)}>{t("workspace.weigh")}</button>}
            {view === "health" && <><button className="btn btn-outline-success btn-sm" onClick={() => vaccination(animal)}>{t("workspace.vaccinate")}</button><button className="btn btn-outline-secondary btn-sm" onClick={() => health(animal)}>{t("workspace.testTreatment")}</button></>}
            {view === "animals" && manager && <button className="btn btn-outline-secondary btn-sm" onClick={() => event(animal)}>{t("workspace.manageRemove")}</button>}
          </>}
        </AnimalRowActions></td></tr>)}</Table>}
        {(view === "batches" || view === "sales") && <Table columns={[t("workspace.batchFarm"), "Categoria / fase", t("workspace.headLabel"), t("poultryReproduction.averageWeight"), t("lotReport.actions")]}>{(rows as CattleBatch[]).map(batch => <tr key={batch.id}><td><strong>{batch.batch_code}</strong><small>{batch.farm_name}</small>{batch.operations?.pastures.map(pasto => <small key={pasto.name}>{pasto.name} · {pasto.days}  {t("plantations.detail.daysSuffix")}</small>)}<small>{t("workspace.lastWeighing")} {date(batch.operations?.last_weighing_date, language)}</small></td><td>{batch.category}<small>{phases[batch.phase] || batch.phase}</small>{batch.operations?.age_days !== null && batch.operations?.age_days !== undefined && <small>{t("workspace.referenceAge")} {batch.operations.age_days}  {t("plantations.detail.daysSuffix")}</small>}</td><td>{number(batch.quantity, language)}</td><td>{number(batch.avg_weight_kg, language)} kg</td><td><div className={styles.actions}>{manager && <><button className="btn btn-outline-success btn-sm" onClick={() => showBatchResult(batch)}>{t("workspace.batchResult")}</button>{canWrite && <button className="btn btn-outline-secondary btn-sm" onClick={() => batchCost(batch)}>{t("workspace.allocateCost")}</button>}</>}{batch.status === "active" && canWrite && <>{view === "batches" && <button className="btn btn-outline-success btn-sm" onClick={() => weighing(batch, true)}>{t("workspace.weighBatch")}</button>}{view === "batches" && <button className="btn btn-outline-secondary btn-sm" onClick={() => batchTreatment(batch)}>{t("workspace.groupHealth")}</button>}{view === "batches" && <button className="btn btn-outline-danger btn-sm" onClick={() => batchDeath(batch)}>{t("poultryReproduction.mortality")}</button>}{manager && <>{view === "batches" && <button className="btn btn-outline-secondary btn-sm" onClick={() => changePhase(batch)}>{t("workspace.changePhase")}</button>}<button className="btn btn-outline-secondary btn-sm" onClick={() => sell(batch)}>{t("workspace.sell")}</button></>}</>}</div></td></tr>)}</Table>}
        {view === "milk" && <Table columns={["Data / turno", "Vaca / fazenda", t("poultryReproduction.productionStatus"), t("poultryReproduction.discard"), t("workspace.usableLabel"), ...(manager ? [t("lotReport.actions")] : [])]}>{(rows as CattleMilk[]).map(row => <tr key={row.id}><td>{date(row.date, language)}<small>{sessions[row.session]}</small></td><td><strong>{row.identifier}</strong><small>{row.farm_name}</small></td><td>{number(row.liters, language)} L</td><td>{number(row.discarded_liters, language)} L<small>{row.discard_reason}</small></td><td>{number(Number(row.liters) - Number(row.discarded_liters), language)} L</td>{manager && <td><button className="btn btn-outline-secondary btn-sm" onClick={() => editMilk(row)}>{t("workspace.correct")}</button></td>}</tr>)}</Table>}
        {view === "pastures" && <Table columns={["Pasto / piquete", t("dairy.home.farm"), t("plantations.area"), t("workspace.stockingCapacity"), t("lotReport.actions")]}>{(rows as CattlePasture[]).map(row => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.notes}</small><small>{({ occupied: "Em uso", unknown: "Disponibilidade não informada", available: "Liberado", resting: "Em descanso", blocked: "Interditado" } as Record<string, string>)[row.occupancy.state]}</small>{row.occupancy.occupied_days !== null && <small>{t("workspace.currentOccupancyUntil")} {row.occupancy.occupied_days}  {t("plantations.detail.daysSuffix")}</small>}{row.occupancy.empty_days !== null && <small>{t("workspace.unoccupiedFor")} {row.occupancy.empty_days}  {t("plantations.detail.daysSuffix")}</small>}<small>{row.availability_reason}</small></td><td>{row.farm_name}</td><td>{number(row.area_ha, language)} ha</td><td>{number(row.occupancy.heads, language)}  {t("workspace.head")}<small>{row.occupancy.stocking_ua_ha === null ? t("workspace.insufficientWeightDataToCalculateAuHa") : `${number(row.occupancy.stocking_ua_ha, language)} UA/ha`}</small><small className={Number(row.occupancy.capacity_percent) > 100 ? "text-danger" : ""}>{row.occupancy.capacity_percent === null ? t("workspace.capacityNotCalculated") : t("workspace.valueOfCapacity", { value: number(row.occupancy.capacity_percent, language) })}</small></td><td>{canWrite && manager && <div className={styles.actions}><button className="btn btn-outline-success btn-sm" disabled={["resting", "blocked"].includes(row.availability)} onClick={() => grazing(row)}>{t("workspace.batchEntry")}</button><button className="btn btn-outline-secondary btn-sm" onClick={() => editPasture(row)}>{t("workspace.editCapacity")}</button></div>}</td></tr>)}</Table>}
        {view === "grazings" && <Table columns={["Pasto", t("lotReport.batch"), t("workspace.currentHeadcount"), t("swineReproduction.entry"), t("inventory.movements.exit"), t("lotReport.actions")]}>{(rows as CattleGrazing[]).map(row => <tr key={row.id}><td>{row.pasture_name}</td><td>{row.batch_code}</td><td>{number(row.quantity, language)}</td><td>{date(row.entry_date, language)}</td><td>{row.exit_date ? date(row.exit_date, language) : t("workspace.occupied")}</td><td>{!row.exit_date && canWrite && manager && <button className="btn btn-outline-secondary btn-sm" onClick={() => closeGrazing(row)}>{t("workspace.recordExit")}</button>}</td></tr>)}</Table>}
        {!rows.length && <div className={styles.empty}>{t("workspace.noRecordsFoundForTheSelectedFilters")}</div>}
        <div className={styles.pagination}><span>{number(count, language)}  {t("workspace.recordsPage")} {page}</span><button className="btn btn-outline-secondary btn-sm" disabled={page === 1} onClick={() => setPage(value => value - 1)}>{t("notifications.previous")}</button><button className="btn btn-outline-secondary btn-sm" disabled={page * 30 >= count} onClick={() => setPage(value => value + 1)}>{t("notifications.next")}</button></div>
      </section>}</>}
      {view === "sales" && manager && <section className={styles.panel}><h2>{t("workspace.latestRecordedSales")}</h2><Table columns={[t("lotReport.date"), t("lotReport.batch"), t("workspace.headLabel"), t("plantations.harvest.buyer"), t("workspace.incomeLabel")]}>{sales.map(sale => <tr key={sale.id}><td>{date(sale.date, language)}</td><td>{sale.batch_code}</td><td>{number(sale.quantity, language)}</td><td>{sale.buyer}</td><td>{Number(sale.amount).toLocaleString(language, { style: "currency", currency: "BRL" })}</td></tr>)}</Table>{!sales.length && <p className={styles.empty}>{t("livestock.sale.none")}</p>}</section>}
    </>}
    {batchResult && <Modal isOpen onClose={() => setBatchResult(null)} title={`Resultado · ${batchResult.batch_code}`} description={t("workspace.partialFinancialResultOfEntriesRegardlessOfSettlement")}><div className={styles.form}>
        {resultError && <div className="alert alert-danger" role="alert">{resultError}</div>}
        <div className={styles.fields}>{[[t("workspace.averageDailyGainInPeriodKgDay"), batchResult.daily_weight_gain], [t("swineReproduction.entry"), batchResult.initial_head], [t("swine.sold"), batchResult.sold_head], ["Mortes", batchResult.deaths], [t("inventory.suppliers.active"), batchResult.remaining_head], [t("swine.mortality"), batchResult.mortality_percent], ["Compra (R$)", batchResult.acquisition], [t("workspace.consumptionAndHealthR"), batchResult.operational_cost], [t("workspace.additionalCostsR"), batchResult.additional_cost], [t("workspace.totalCostR"), batchResult.total_cost], [t("workspace.grossIncomeR"), batchResult.gross_revenue], ["Descontos (R$)", batchResult.deductions], [t("workspace.netIncomeR"), batchResult.net_revenue], [t("workspace.partialResultR"), batchResult.result], [t("workspace.partialMargin"), batchResult.margin_percent], [t("workspace.costPerAnimalSoldR"), batchResult.cost_per_sold_head], [t("workspace.resultPerAnimalSoldR"), batchResult.result_per_sold_head], [t("workspace.carcassArrobas"), batchResult.carcass_arrobas], [t("workspace.costPerArrobaR"), batchResult.cost_per_arroba]].map(([label, value]) => <div key={String(label)}><small>{label}</small><strong className="d-block">{number(value, language)}</strong></div>)}</div>
        <form className="d-flex flex-wrap gap-2 align-items-end mt-3" onSubmit={async event => { event.preventDefault(); setPreparing(true); setResultError(""); try { setBatchResult(await cattleService.batchResult(resultBatchId, resultYield)); } catch (error) { setResultError(cattleError(error, language)); } finally { setPreparing(false); } }}><label className={styles.field}>{t("workspace.estimatedCarcassYield")}<input className="form-control form-control-sm" type="number" min="0.01" max="100" step="0.01" value={resultYield} onChange={event => setResultYield(event.target.value)}/></label><button className="btn btn-outline-success btn-sm" disabled={preparing}>{t("workspace.recalculateArrobas")}</button></form>
        {batchResult.carcass_estimated && <p className="text-muted mt-3">{t("workspace.carcassCalculatedUsingTheEstimatedYieldStatedInTheSale")}</p>}
        {batchResult.warnings.map(text => <p key={text} className="text-muted small mt-3">{text}</p>)}
        <h3 className="h6 mt-3">{t("workspace.allocatedOperationalCosts")}</h3><Table columns={[t("lotReport.date"), t("lotReport.description"), t("workspace.amountR")]}>{batchResult.entries.map(row => <tr key={row.id}><td>{date(row.date, language)}</td><td>{row.description}</td><td>{number(row.amount, language)}</td></tr>)}</Table>
        <h3 className="h6 mt-3">{t("workspace.gainBetweenWeighingsKgAnimalDay")}</h3><Table columns={[t("workspace.start"), t("workspace.end"), t("poultryReproduction.days"), "GMD"]}>{batchResult.weight_intervals.map(row => <tr key={`${row.start}-${row.end}`}><td>{date(row.start, language)}</td><td>{date(row.end, language)}</td><td>{row.days}</td><td>{Number(row.gmd).toLocaleString(language, { maximumFractionDigits: 3 })}</td></tr>)}</Table>
      </div></Modal>}
      {form && (view === "reproduction" ? <CattleReproductionForm spec={form} onClose={() => setForm(null)} onSaved={savedForm}/> : <CattleForm spec={form} onClose={() => setForm(null)} onSaved={savedForm}/>)}
    {historyAnimal && <Modal variant={view === "reproduction" ? "reproduction" : "default"} isOpen onClose={() => setHistoryAnimal(null)} maxWidth={styles.formDialog} title={t("workspace.bovineSheetValue", { value: historyAnimal.identifier })} description={`${historyAnimal.category || t("inventory.form.species.bovino")} · ${historyAnimal.farm_name}`}><div className={styles.form}>
      <div className={styles.metrics}><article className={styles.metric}><span>{t("workspace.currentWeight")}</span><strong>{number(historyAnimal.current_weight_kg, language)} kg</strong></article><article className={styles.metric}><span>{t("poultryReproduction.birth")}</span><strong style={{ fontSize: "1rem" }}>{date(historyAnimal.birth_date, language)}</strong></article></div>
      <p className={styles.muted}>{t("workspace.breed")} {historyAnimal.breed_name || t("plantations.detail.notProvided")}  {t("workspace.sexLabel")} {historyAnimal.gender === "F" ? t("workspace.female") : t("workspace.male")}  {t("workspace.entryLabel")} {date(historyAnimal.entry_date, language)}</p><p className={styles.muted}>{t("workspace.sire")} {historyAnimal.sire_identifier || historyAnimal.sire_name || t("lotReport.notInformed")}  {t("workspace.dam")} {historyAnimal.dam_identifier || historyAnimal.dam_name || t("plantations.detail.notProvided")}</p><hr />
      <CattleGenealogy key={historyAnimal.id} id={historyAnimal.id} />
      {historyLoading ? <p role="status">{t("workspace.loadingHistoryLabel")}</p> : historyError ? <p role="alert" className="text-danger">{historyError}</p> : <>
        {(() => { const weights = history.filter(event => event.type === "weight" && event.date && event.details?.weight_kg !== undefined).sort((a, b) => (b.date || "").localeCompare(a.date || "")); if (weights.length < 2) return null; const previous = weights.find(event => event.date !== weights[0].date); if (!previous) return null; const days = (Date.parse(weights[0].date!) - Date.parse(previous.date!)) / 86400000; return days > 0 ? <p className={styles.muted}>{t("workspace.averageDailyGainBetweenTheLastTwoWeighings")} <strong>{number((weights[0].details!.weight_kg! - previous.details!.weight_kg!) / days, language)}  {t("workspace.kgDay")}</strong> ({days}  {t("workspace.days")}</p> : null; })()}
        {history.map((event, index) => <article className={styles.event} key={`${event.type}-${event.date}-${index}`}><time>{date(event.date, language)}</time><strong>{event.title}</strong><p>{event.subtitle}</p></article>)}{!history.length && <p className={styles.empty}>{t("workspace.noManagementOperationsRecordedForThisAnimal")}</p>}
      </>}
    </div></Modal>}
  </div>;
}
