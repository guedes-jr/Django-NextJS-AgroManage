"use client";

import { useEffect, useState, useCallback, useRef, Suspense, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Plus, Loader2, Eye, Baby, HeartHandshake, House, PiggyBank, ScanLine, TrendingUp, Weight } from "lucide-react";
import { ReproducaoDashboard, ReproducaoConfig } from "@/components/reproducao/ReproducaoDashboard";
import { useToast } from "@/components/ui/Toast";
import { useOrganizationLocale } from "@/lib/locale";
import {
  getReproductionDashboard,
  getMarras,
  getMatrizes,
  getGestacoes,
  getMaternidades,
  getCreches,
  getCrescimentos,
  getEngordas,
  createAnimal,
  createMating,
  updateAnimal,
  updateLitter,
  batchWean,
  getReproducers,
  diagnosePregnancy,
  registerHeat,
  mergeBatches,
} from "@/services/livestockService";

type TabId = "dashboard" | "marras" | "matrizes" | "gestacao" | "maternidade" | "creche" | "crescimento" | "engorda";

const CACHE_TTL_MS = 30_000;
const POLL_INTERVAL_MS = 60_000;

const ALL_TABS: TabId[] = ["dashboard", "marras", "matrizes", "gestacao", "maternidade", "creche", "crescimento", "engorda"];

const TAB_FETCH_MAP: Record<TabId, () => Promise<any>> = {
  dashboard: () => getReproductionDashboard('suinos'),
  marras: () => getMarras('suinos'),
  matrizes: () => getMatrizes('suinos'),
  gestacao: () => getGestacoes('suinos'),
  maternidade: () => getMaternidades('suinos'),
  creche: () => getCreches('suinos'),
  crescimento: () => getCrescimentos('suinos'),
  engorda: () => getEngordas('suinos'),
};

function ReproducaoPageContent() {
  const { showToast } = useToast();
  const { language, t } = useOrganizationLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  
  const [initialLoading, setInitialLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [tabData, setTabData] = useState<Record<string, any>>({});
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({});
  const [loadErrors, setLoadErrors] = useState<Partial<Record<TabId, string>>>({});
  const mountedRef = useRef(true);
  const lastFetchRef = useRef<Record<string, number>>({});
  const [reproducers, setReproducers] = useState<{ id: number; identifier: string; category: string }[]>([]);
  
  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(tabFromUrl || "dashboard");

  // Sync state to URL
  useEffect(() => {
    const currentTab = searchParams.get("tab");
    if (activeTab !== currentTab) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", activeTab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [activeTab, pathname, router, searchParams]);

  // Sync URL to state (for back/forward buttons)
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    getReproducers('suinos').then(setReproducers).catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchTabData = useCallback(async (tabId: TabId, fetchFn: () => Promise<any>) => {
    lastFetchRef.current[tabId] = Date.now();
    setTabLoading(prev => ({ ...prev, [tabId]: true }));
    try {
      const data = await fetchFn();
      if (mountedRef.current) {
        setTabData(prev => ({ ...prev, [tabId]: data }));
        setLoadErrors(prev => { const next = { ...prev }; delete next[tabId]; return next; });
      }
    } catch {
      delete lastFetchRef.current[tabId];
      if (mountedRef.current) {
        setLoadErrors(prev => ({ ...prev, [tabId]: t("swineReproduction.loadPhaseError") }));
      }
    } finally {
      if (mountedRef.current) {
        setTabLoading(prev => ({ ...prev, [tabId]: false }));
      }
    }
  }, [t]);

  const refetchTabs = useCallback(async (tabIds: TabId[], showLoader = false, force = false) => {
    const toFetch = tabIds.filter(id => {
      if (force) return true;
      const elapsed = Date.now() - (lastFetchRef.current[id] || 0);
      return elapsed > CACHE_TTL_MS;
    });
    if (toFetch.length === 0) return;
    if (showLoader) setInitialLoading(true);
    try {
      await Promise.all(toFetch.map(id => fetchTabData(id, TAB_FETCH_MAP[id])));
    } finally {
      if (showLoader && mountedRef.current) setInitialLoading(false);
    }
  }, [fetchTabData]);

  const fetchAll = useCallback(async () => {
    await refetchTabs(ALL_TABS, true);
  }, [refetchTabs]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const interval = setInterval(() => { refetchTabs(ALL_TABS); }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refetchTabs]);

  const tab = tabData;
  const d = tab.dashboard?.kpis || {};

  const tabLoadingStates: Record<string, boolean> = {
    dashboard: tabLoading.dashboard ?? true,
    marras: tabLoading.marras ?? true,
    matrizes: tabLoading.matrizes ?? true,
    gestacao: tabLoading.gestacao ?? true,
    maternidade: tabLoading.maternidade ?? true,
    creche: tabLoading.creche ?? true,
    crescimento: tabLoading.crescimento ?? true,
    engorda: tabLoading.engorda ?? true,
  };

  const m = tab.marras?.kpis || {};
  const mat = tab.matrizes?.kpis || {};
  const g = tab.gestacao?.kpis || {};
  const matn = tab.maternidade?.kpis || {};
  const cr = tab.creche?.kpis || {};
  const cresc = tab.crescimento?.kpis || {};
  const eng = tab.engorda?.kpis || {};
  const formatDateCell = useCallback((value: unknown) => {
    if (!value) return "—";
    const raw = String(value);
    const date = raw.includes("T") ? new Date(raw) : new Date(`${raw.slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString(language);
  }, [language]);

  const config: ReproducaoConfig = useMemo(() => ({
    especie: "suinos",
    emoji: "🐷",
    titulo: t("swineReproduction.title"),
    subtitulo: t("swineReproduction.subtitle"),
    badgeColor: "oklch(0.65 0.15 230)",
    badgeTextColor: "oklch(0.45 0.15 145)",
    kpis: [
      { label: t("swineReproduction.gilts"), value: d.marras ?? "—", icon: "🐖", color: "oklch(0.95 0.05 145)", trend: "up" },
      { label: t("swineReproduction.awaitingCoverageCapital"), value: d.aguardando_cobertura ?? "—", icon: "🔄", color: "oklch(0.94 0.04 230)", trend: "neutral" },
      { label: t("swineReproduction.pregnantCapital"), value: d.gestantes ?? "—", icon: "🤰", color: "oklch(0.97 0.04 80)", trend: "up" },
      { label: t("swineReproduction.monthPiglets"), value: d.nascidos_mes ?? "—", icon: "🍼", color: "oklch(0.96 0.04 290)", trend: "up" },
      { label: t("swineReproduction.pregnancyRate"), value: d.tx_prenhez ?? "—", icon: "🎯", color: "var(--muted)", trend: "neutral" },
    ],
    flowSteps: [
      { id: "marras", icon: <PiggyBank />, label: t("swineReproduction.gilts"), count: tab.marras?.rows?.length ?? 0, color: "#fff5f6", borderColor: "#fecdd3", accent: "#e84b67", summary: `${m.em_preparo ?? 0} ${t("swineReproduction.preparing")}` },
      { id: "matrizes", icon: <HeartHandshake />, label: t("swineReproduction.matrices"), count: tab.matrizes?.rows?.length ?? 0, color: "#f2f7ff", borderColor: "#bfdbfe", accent: "#3978d4", summary: `${mat.cobertas ?? 0} ${t("swineReproduction.coveragesPending")}` },
      { id: "gestacao", icon: <ScanLine />, label: t("swineReproduction.gestation"), count: tab.gestacao?.rows?.length ?? 0, color: "#fff8ed", borderColor: "#fed7aa", accent: "#e98727", summary: `${g.aguardando_dg ?? 0} ${t("swineReproduction.waitingDiagnosis")} · ${g.confirmadas ?? 0} ${t("swineReproduction.pregnant")}` },
      { id: "maternidade", icon: <Baby />, label: t("swineReproduction.maternity"), count: tab.maternidade?.rows?.length ?? 0, color: "#faf3ff", borderColor: "#e9d5ff", accent: "#9654d8", summary: `${matn.nascidos_mes ?? 0} ${t("swineReproduction.bornThisMonth")}` },
      { id: "creche", icon: <House />, label: t("swineReproduction.nursery"), count: tab.creche?.rows?.length ?? 0, color: "#f1fbf5", borderColor: "#bbf7d0", accent: "#249253", summary: `${cr.animais_alojados ?? 0} ${t("swineReproduction.housedAnimals")}` },
      { id: "crescimento", icon: <TrendingUp />, label: t("swineReproduction.growth"), count: tab.crescimento?.rows?.length ?? 0, color: "#fffbef", borderColor: "#fde68a", accent: "#d59a16", summary: `${cresc.animais_alojados ?? 0} ${t("swineReproduction.housedAnimals")}` },
      { id: "engorda", icon: <Weight />, label: t("swineReproduction.fattening"), count: tab.engorda?.rows?.length ?? 0, color: "#effafa", borderColor: "#99f6e4", accent: "#168f86", summary: `${eng.animais_alojados ?? 0} ${t("swineReproduction.housedAnimals")}` },
    ],
    alerts: tab.dashboard?.alerts?.length > 0 ? tab.dashboard.alerts : [],
    activities: [],
    aiSuggestions: tab.dashboard?.aiSuggestions?.length > 0 ? tab.dashboard.aiSuggestions : [],
    tabs: [
      {
        id: "marras",
        icon: "🐖",
        label: t("swineReproduction.gilts"),
        count: tab.marras?.rows?.length,
        selectable: true,
        rowKey: "id",
        batchActions: [
          { 
            label: t("swineReproduction.registerCoverage"),
            icon: "🤰", 
            variant: "primary", 
            type: "mating_marra"
          },
          {
            label: t("swineReproduction.registerHeat"),
            icon: "🔴",
            variant: "secondary",
            type: "heat",
          },
        ],
        kpis: [
          { label: t("swineReproduction.totalGilts"), value: m.total ?? 0, icon: "🐖", color: "oklch(0.95 0.05 145)", trend: "up" },
          { label: t("swineReproduction.available"), value: m.disponiveis ?? 0, icon: "✅", color: "oklch(0.94 0.04 230)", trend: "neutral" },
          { label: t("swineReproduction.preparingCapital"), value: m.em_preparo ?? 0, icon: "⏳", color: "oklch(0.97 0.04 80)", trend: "neutral" },
          { label: t("swineReproduction.ready"), value: m.prontas ?? 0, icon: "🎯", color: "oklch(0.96 0.04 290)", trend: "up" },
        ],
        tabActions: [
          { label: t("swineReproduction.registerWeight"), icon: "⚖️", color: "oklch(0.55 0.16 230)", desc: t("swineReproduction.updateWeight"), type: 'weight' },
          { label: t("swineReproduction.registerVaccine"), icon: "💉", color: "oklch(0.6 0.22 27)", desc: t("swineReproduction.vaccination"), type: 'vaccine' },
          { label: t("swineReproduction.registerHeat"), icon: "🔴", color: "oklch(0.65 0.18 15)", desc: t("swineReproduction.firstHeat"), type: 'heat' },
          { label: t("swineReproduction.registerCoverage"), icon: "🔄", color: "oklch(0.78 0.15 85)", desc: t("swineReproduction.firstCoverage"), type: 'mating_marra' },
        ],
        tabAlerts: tab.marras?.alerts || [],
        tabAiSuggestions: tab.marras?.aiSuggestions || [],
        columns: [
          { key: "identifier", label: t("swineReproduction.earTag"), render: (v: any) => <span className="repro-table-id">{String(v)}</span> },
          { key: "idade", label: t("swineReproduction.ageDays") },
          { key: "peso", label: t("swineReproduction.weightKg") },
          { key: "entrada", label: t("swineReproduction.entry"), render: formatDateCell },
          { key: "cio1_data", label: t("swineReproduction.firstHeatShort"), render: (v: any, row: any) => v ? <span style={{ color: row.cio1_previsto ? 'var(--muted-foreground)' : 'inherit', fontStyle: row.cio1_previsto ? 'italic' : 'normal' }}>{formatDateCell(v)}{row.cio1_previsto ? ` ${t("swineReproduction.predicted")}` : ''}</span> : <span className="text-muted">—</span> },
          { key: "cio2_data", label: t("swineReproduction.secondHeat"), render: (v: any, row: any) => v ? <span style={{ color: 'var(--muted-foreground)', fontStyle: 'italic' }}>{formatDateCell(v)} {t("swineReproduction.predicted")}</span> : <span className="text-muted">—</span> },
          { key: "cio3_data", label: t("swineReproduction.thirdHeatCoverage"), render: (v: any, row: any) => v ? <span style={{ color: 'oklch(0.55 0.16 145)', fontWeight: 600, fontStyle: 'italic' }}>{formatDateCell(v)} {t("swineReproduction.predicted")}</span> : <span className="text-muted">—</span> },
        ],
        actions: [
          {
            label: t("swineReproduction.technicalSheet"),
            icon: <Eye size={16} />,
            variant: "secondary",
            type: 'technical_sheet',
          } as any
        ],
        rows: tab.marras?.rows || [],
        statusKey: "status",
        statusMap: {
          "aguardando_cobertura": { label: t("swineReproduction.awaitingCoverageCapital"), variant: "amber" },
          "pronta": { label: t("swineReproduction.readyForCoverage"), variant: "green" },
          "em_preparo": { label: t("swineReproduction.inPreparation"), variant: "amber" },
          "vazia": { label: t("swineReproduction.availableStatus"), variant: "gray" },
          "coberta": { label: t("swineReproduction.coveredAwaitingDiagnosis"), variant: "blue" },
        },
      },
      {
        id: "matrizes",
        icon: "👩‍🍼",
        label: t("swineReproduction.matrices"),
        count: tab.matrizes?.rows?.length,
        selectable: true,
        rowKey: "id",
        batchActions: [
          { 
            label: t("swineReproduction.registerCoverage"),
            icon: "🤰", 
            variant: "primary", 
            type: "mating_marra"
          },
          { label: t("swineReproduction.discard"), icon: "🚫", variant: "danger", type: "discard" },
        ],
        primaryActionLabel: t("swineReproduction.registerCoverage"),
        primaryActionModalFields: [
          { name: "matriz", label: `${t("swineReproduction.matrix")} (${t("swineReproduction.earTag")})`, type: "text", required: true },
          { name: "data_cobertura", label: t("swineReproduction.matingDate"), type: "date", required: true },
          { name: "mating_type", label: t("swineReproduction.matingType"), type: "select", options: [
            { value: "natural", label: t("swineReproduction.naturalMating") },
            { value: "ai", label: t("swineReproduction.artificialInsemination") },
            { value: "iatf", label: "IATF" },
          ], initialValue: "natural" },
          { name: "sire_info", label: t("swineReproduction.sireDose"), type: "text" },
        ],
        onSave: async (data: any) => {
          await createMating({
            female_identifier: data.matriz,
            mating_date: data.data_cobertura,
            mating_type: data.mating_type,
            sire_info: data.sire_info || "",
          });
          showToast(t("swineReproduction.coverageSaved"), "success");
          refetchTabs(["matrizes", "gestacao", "dashboard"], false, true);
        },
        kpis: [
          { label: t("swineReproduction.totalMatrices"), value: mat.total ?? 0, icon: "👩‍🍼", color: "oklch(0.94 0.04 230)", trend: "neutral" },
          { label: t("swineReproduction.empty"), value: mat.vazias ?? 0, icon: "🟢", color: "oklch(0.95 0.05 145)", trend: "down" },
          { label: t("swineReproduction.covered"), value: mat.cobertas ?? 0, icon: "🔵", color: "oklch(0.55 0.16 230)", trend: "up" },
          { label: t("swineReproduction.lactating"), value: mat.lactantes ?? 0, icon: "🍼", color: "oklch(0.96 0.04 290)", trend: "up" },
        ],
        tabActions: [
          { label: t("swineReproduction.registerCoverage"), icon: "🤰", color: "oklch(0.55 0.16 230)", desc: t("swineReproduction.newCoverage"), type: 'primary' },
          { label: t("swineReproduction.pregnancyDiagnosis"), icon: "🔬", color: "oklch(0.55 0.16 145)", desc: t("swineReproduction.confirmPregnancy"), type: 'diagnosis' },
          { label: `${t("swineReproduction.discard")} ${t("swineReproduction.matrix")}`, icon: "🚫", color: "oklch(0.6 0.22 27)", desc: t("swineReproduction.removeFromHerd"), type: 'discard' },
          { label: t("swineReproduction.history"), icon: "📋", color: "oklch(0.78 0.15 85)", desc: t("swineReproduction.viewHistory"), type: 'history' },
        ],
        tabAlerts: tab.matrizes?.alerts || [],
        tabAiSuggestions: tab.matrizes?.aiSuggestions || [],
        columns: [
          { key: "identifier", label: t("swineReproduction.earTag"), render: (v: any) => <span className="repro-table-id">{String(v)}</span> },
          { key: "op", label: t("swineReproduction.farrowingOrder") },
          { key: "dias_abertos", label: t("swineReproduction.openDays") },
          { key: "ultima_cobertura", label: t("swineReproduction.lastCoverage"), render: formatDateCell },
        ],
        actions: [
          {
            label: t("swineReproduction.technicalSheet"),
            icon: <Eye size={16} />,
            variant: "secondary",
            type: 'technical_sheet',
          } as any
        ],
        rows: tab.matrizes?.rows || [],
        statusKey: "status",
        statusMap: {
          "vazia": { label: t("swineReproduction.empty"), variant: "gray" },
          "aguardando_cobertura": { label: t("swineReproduction.awaitingCoverageCapital"), variant: "amber" },
          "coberta": { label: t("swineReproduction.covered"), variant: "blue" },
          "gestante": { label: t("swineReproduction.pregnantCapital"), variant: "green" },
          "lactante": { label: t("swineReproduction.lactating"), variant: "purple" },
          "descanso": { label: t("swineReproduction.resting"), variant: "amber" },
        },
      },
      {
        id: "gestacao",
        icon: "🤰",
        label: t("swineReproduction.gestation"),
        count: tab.gestacao?.rows?.length,
        selectable: true,
        rowKey: "id",
        batchActions: [
          { 
            label: t("swineReproduction.confirmBatchBirth"),
            icon: "🍼", 
            variant: "primary", 
            type: 'birth', 
            onClick: () => {},
            shouldShow: (rows: any[]) => rows.every(r => r.status === "Gestante" || r.status === "Parto próximo")
          } as any,
          { 
            label: "Confirmar Prenhez", 
            icon: "✅", 
            variant: "primary", 
            onClick: async (rows: any[]) => {
              try {
                await Promise.all(rows.map(r => {
                  const id = r.animal_id || r.id;
                  return diagnosePregnancy(id, 'positive');
                }));
                showToast(t("swineReproduction.pregnancyConfirmedFor", { count: rows.length }), "success");
                refetchTabs(["gestacao", "maternidade", "dashboard", "matrizes"], false, true);
              } catch (err) {
                showToast(t("swineReproduction.pregnancyConfirmFailed"), "error");
              }
            },
            shouldShow: (rows: any[]) => rows.every(r => r.status === "Confirmar Prenhez")
          },
          { 
            label: "Registrar Perda", 
            icon: "⚠️", 
            variant: "danger", 
            type: 'loss', 
          },
        ],
        kpis: [
          { label: t("swineReproduction.totalGestating"), value: g.total ?? 0, icon: "🤰", color: "oklch(0.97 0.04 80)", trend: "up" },
          { label: t("swineReproduction.awaitingDiagnosisShort"), value: g.aguardando_dg ?? 0, icon: "🔬", color: "oklch(0.94 0.04 230)", trend: "neutral" },
          { label: t("swineReproduction.confirmedPregnancy"), value: g.confirmadas ?? 0, icon: "✅", color: "oklch(0.95 0.05 145)", trend: "up" },
          { label: t("swineReproduction.nearBirth"), value: g.parto_proximo ?? 0, icon: "⏰", color: "oklch(0.6 0.22 27)", trend: "neutral" },
        ],
        tabActions: [
          { label: t("swineReproduction.confirmBatchBirth"), icon: "🍼", color: "oklch(0.55 0.16 145)", desc: t("swineReproduction.birthRegistration"), type: 'birth' },
          { label: t("swineReproduction.registerLoss"), icon: "❌", color: "oklch(0.6 0.22 27)", desc: t("swineReproduction.abortionResorption"), type: 'loss' },
          { label: t("swineReproduction.registerVaccine"), icon: "💉", color: "oklch(0.55 0.16 230)", desc: t("swineReproduction.preBirthVaccination"), type: 'vaccine' },
        ],
        tabAlerts: tab.gestacao?.alerts || [],
        tabAiSuggestions: tab.gestacao?.aiSuggestions || [],
        columns: [
          { key: "identifier", label: t("swineReproduction.earTag"), render: (v: any) => <span className="repro-table-id">{String(v)}</span> },
          { key: "cobertura", label: t("swineReproduction.coverageDate"), render: formatDateCell },
          { key: "dias", label: t("swineReproduction.gestationDays") },
          { key: "previsao", label: t("swineReproduction.diagnosisOrBirthForecast"), render: formatDateCell },
          { key: "dias_faltantes", label: t("swineReproduction.nextEventDeadline") },
        ],
        actions: [
          {
            label: t("swineReproduction.birthRegistration"),
            icon: <Plus size={16} />,
            variant: "primary",
            type: 'birth',
            onClick: () => {},
          } as any,
          {
            label: t("swineReproduction.technicalSheet"),
            icon: <Eye size={16} />,
            variant: "secondary",
            type: 'technical_sheet',
          } as any
        ],
        rows: tab.gestacao?.rows || [],
        statusKey: "status",
        statusMap: {
          "Gestante": { label: t("swineReproduction.confirmedPregnancy"), variant: "green" },
          "Parto próximo": { label: t("swineReproduction.nearBirth"), variant: "amber" },
          "Confirmar Prenhez": { label: t("swineReproduction.awaitingDiagnosis21"), variant: "blue" },
        },
      },
      {
        id: "maternidade",
        icon: "🍼",
        label: t("swineReproduction.maternity"),
        count: tab.maternidade?.rows?.length,
        selectable: true,
        rowKey: "id",
        batchActions: [
          { label: t("swineReproduction.postpartumVaccine"), icon: "💉", variant: "default", type: "postpartum_vaccine" },
          { label: t("swineReproduction.confirmWeaning"), icon: "🔄", variant: "primary", type: 'wean' as any },
        ],
        kpis: [
          { label: t("swineReproduction.inLactation"), value: matn.em_lactacao ?? 0, icon: "🍼", color: "oklch(0.96 0.04 290)", trend: "up" },
          { label: t("swineReproduction.bornMonth"), value: matn.nascidos_mes ?? 0, icon: "🐷", color: "oklch(0.95 0.05 145)", trend: "up" },
          { label: t("swineReproduction.weanedMonth"), value: matn.desmamados_mes ?? 0, icon: "✅", color: "oklch(0.55 0.16 230)", trend: "up" },
          { label: t("swineReproduction.mortality"), value: matn.mortalidade ?? "—", icon: "📉", color: "oklch(0.6 0.22 27)", trend: "down" },
          { label: t("swineReproduction.averageBorn"), value: matn.media_nascidos ?? "—", icon: "📊", color: "oklch(0.55 0.16 145)", trend: "neutral" },
        ],
        tabActions: [
          { label: t("swineReproduction.registerProcedure"), icon: "📝", color: "oklch(0.55 0.16 145)", desc: t("swineReproduction.transferPigletsMedication"), type: 'procedure' },
          { label: t("swineReproduction.registerMortality"), icon: "⚠️", color: "oklch(0.6 0.22 27)", desc: t("swineReproduction.recordDeath"), type: 'mortality' },
          { label: t("swineReproduction.postpartumVaccine"), icon: "💉", color: "oklch(0.55 0.16 230)", desc: t("swineReproduction.vaccinateMatrix"), type: 'postpartum_vaccine' },
          { label: t("swineReproduction.confirmWeaning"), icon: "🔄", color: "oklch(0.78 0.15 85)", desc: t("swineReproduction.advanceNursery"), type: 'wean' },
        ],
        tabAlerts: tab.maternidade?.alerts || [],
        tabAiSuggestions: tab.maternidade?.aiSuggestions || [],
        columns: [
          { key: "identifier", label: t("swineReproduction.matrix"), render: (v: any) => <span className="repro-table-id">{String(v)}</span> },
          { key: "data_parto", label: t("swineReproduction.farrowingDate"), render: formatDateCell },
          { key: "vivos", label: t("swineReproduction.liveBorn") },
          { key: "obitos", label: t("swineReproduction.deaths") },
          { key: "mortalidade_pos", label: t("swineReproduction.mortality") },
          { key: "mumificados", label: t("swineReproduction.mummified") },
          { key: "vivos_atual", label: t("swineReproduction.currentLive") },
          { key: "idade", label: t("swineReproduction.ageDaysShort") },
          { key: "previsao_desmame", label: t("swineReproduction.weaningForecast"), render: formatDateCell },
        ],
        actions: [
          {
            label: t("swineReproduction.technicalSheet"),
            icon: <Eye size={16} />,
            variant: "secondary",
            type: 'technical_sheet',
          } as any
        ],
        rows: tab.maternidade?.rows || [],
        statusKey: "status",
        statusMap: {
          "Lactação": { label: t("swineReproduction.inLactation"), variant: "purple" },
          "Pronto p/ Desmame": { label: t("swineReproduction.readyForWeaning"), variant: "amber" },
          "Desmamado": { label: t("swineReproduction.weaned"), variant: "green" },
        },
      },
      {
        id: "creche",
        icon: "🐷",
        label: t("swineReproduction.nursery"),
        count: tab.creche?.rows?.length,
        selectable: true,
        rowKey: "lote",
        batchActions: [
          { label: t("swineReproduction.transferGrowth"), icon: "🔄", variant: "primary", type: "transfer_crescimento" },
          { label: t("swineReproduction.mergeBatches"), icon: "🔗", variant: "secondary", type: "merge_batches" },
        ],
        kpis: [
          { label: t("swineReproduction.totalBatches"), value: cr.total ?? 0, icon: "📦", color: "oklch(0.95 0.04 185)", trend: "up" },
          { label: t("swineReproduction.housed"), value: cr.animais_alojados ?? 0, icon: "🐷", color: "oklch(0.94 0.04 230)", trend: "up" },
          { label: t("swineReproduction.averageWeight"), value: cr.peso_medio ?? "—", icon: "⚖️", color: "oklch(0.97 0.04 80)", trend: "neutral" },
        ],
        tabActions: [
          { label: t("swineReproduction.registerWeight"), icon: "⚖️", color: "oklch(0.55 0.16 230)", desc: t("swineReproduction.updateBatchWeight"), type: 'weight' },
          { label: t("swineReproduction.registerVaccine"), icon: "💉", color: "oklch(0.6 0.22 27)", desc: t("swineReproduction.vaccination"), type: 'vaccine' },
          { label: t("swineReproduction.registerMortality"), icon: "⚠️", color: "oklch(0.58 0.2 25)", desc: t("swineReproduction.writeOffBatch"), type: 'batch_mortality' },
          { label: t("swineReproduction.mergeBatches"), icon: "🔗", color: "oklch(0.65 0.15 270)", desc: t("swineReproduction.unifyBatches"), type: 'merge_batches' },
          { label: t("swineReproduction.transferGrowth"), icon: "🔄", color: "oklch(0.78 0.15 85)", desc: t("swineReproduction.toGrowth"), type: "transfer_crescimento" },
        ],
        tabAlerts: tab.creche?.alerts || [],
        tabAiSuggestions: tab.creche?.aiSuggestions || [],
        columns: [
          { key: "lote", label: t("swineReproduction.batch") },
          { key: "entrada", label: t("swineReproduction.entry"), render: formatDateCell },
          { key: "idade", label: t("swineReproduction.batchAge"), render: (value: number | null) => value == null ? "—" : `${value} ${t("swineReproduction.days")}` },
          { key: "qtd", label: t("swineReproduction.currentQuantity") },
          { key: "peso", label: t("swineReproduction.averageWeight") },
          { key: "prev_crescimento", label: t("swineReproduction.growthForecast"), render: formatDateCell },
        ],
        actions: [
          {
            label: t("swineReproduction.technicalSheet"),
            icon: <Eye size={16} />,
            variant: "secondary",
            type: 'technical_sheet',
          } as any
        ],
        rows: tab.creche?.rows || [],
        statusKey: "status",
        statusMap: {
          "active": { label: t("swineReproduction.housedStatus"), variant: "blue" },
          "ready_for_growth": { label: t("swineReproduction.readyGrowth"), variant: "amber" },
        },
      },
      {
        id: "crescimento",
        icon: "📈",
        label: t("swineReproduction.growth"),
        count: tab.crescimento?.rows?.length,
        selectable: true,
        rowKey: "lote",
        batchActions: [
          { label: t("swineReproduction.transferFattening"), icon: "🔄", variant: "primary", type: "transfer_engorda" },
        ],
        kpis: [
          { label: t("swineReproduction.totalBatches"), value: cresc.total ?? 0, icon: "📦", color: "oklch(0.94 0.04 230)", trend: "neutral" },
          { label: t("swineReproduction.housed"), value: cresc.animais_alojados ?? 0, icon: "🐷", color: "oklch(0.95 0.05 145)", trend: "up" },
          { label: t("swineReproduction.averageWeight"), value: cresc.peso_medio ? `${cresc.peso_medio} kg` : "—", icon: "⚖️", color: "oklch(0.97 0.04 80)", trend: "neutral" },
          { label: t("swineReproduction.averageDailyGain"), value: cresc.gpd_medio ? `${cresc.gpd_medio} kg` : "—", icon: "📊", color: "oklch(0.96 0.04 290)", trend: "up" },
          { label: t("swineReproduction.nextFattening"), value: cresc.proximos_engorda ?? 0, icon: "📈", color: "oklch(0.6 0.22 27)", trend: "up" },
        ],
        tabActions: [
          { label: t("swineReproduction.registerWeight"), icon: "⚖️", color: "oklch(0.55 0.16 230)", desc: t("swineReproduction.updateWeight"), type: 'weight' },
          { label: t("swineReproduction.registerMedication"), icon: "💊", color: "oklch(0.6 0.22 27)", desc: t("swineReproduction.medication"), type: 'vaccine' },
          { label: t("swineReproduction.registerMortality"), icon: "⚠️", color: "oklch(0.58 0.2 25)", desc: t("swineReproduction.writeOffBatch"), type: 'batch_mortality' },
          { label: t("swineReproduction.transferFattening"), icon: "🔄", color: "oklch(0.78 0.15 85)", desc: t("swineReproduction.toFattening"), type: "transfer_engorda" },
        ],
        tabAlerts: tab.crescimento?.alerts || [],
        tabAiSuggestions: tab.crescimento?.aiSuggestions || [],
        columns: [
          { key: "lote", label: t("swineReproduction.batch") },
          { key: "entrada", label: t("swineReproduction.entry"), render: formatDateCell },
          { key: "dias", label: t("swineReproduction.days") },
          { key: "qtd", label: t("swineReproduction.quantity") },
          { key: "peso", label: t("swineReproduction.weightKg"), render: (v: any) => v != null ? `${v} kg` : "—" },
          { key: "idade", label: t("swineReproduction.batchAge"), render: (value: number | null) => value == null ? "—" : `${value} ${t("swineReproduction.days")}` },
          { key: "previsao", label: t("swineReproduction.fatteningForecast"), render: formatDateCell },
        ],
        actions: [
          {
            label: t("swineReproduction.technicalSheet"),
            icon: <Eye size={16} />,
            variant: "secondary",
            type: 'technical_sheet',
          } as any
        ],
        rows: tab.crescimento?.rows || [],
        statusKey: "status",
        statusMap: {
          "Em crescimento": { label: t("swineReproduction.growth"), variant: "teal" },
          "Pronto p/ engorda": { label: t("swineReproduction.readyForFattening"), variant: "green" },
        },
      },
      {
        id: "engorda",
        icon: "⚖️",
        label: t("swineReproduction.fattening"),
        count: tab.engorda?.rows?.length,
        selectable: true,
        rowKey: "lote",
        batchActions: [
          { label: t("swineReproduction.registerSale"), icon: "💰", variant: "primary", onClick: () => router.push("/home/seguimento/suinos/vendas") },
        ],
        kpis: [
          { label: t("swineReproduction.totalBatches"), value: eng.total ?? 0, icon: "📦", color: "oklch(0.94 0.04 230)", trend: "neutral" },
          { label: t("swineReproduction.housed"), value: eng.animais_alojados ?? 0, icon: "🐷", color: "oklch(0.95 0.05 145)", trend: "up" },
          { label: t("swineReproduction.averageWeight"), value: eng.peso_medio ? `${eng.peso_medio} kg` : "—", icon: "⚖️", color: "oklch(0.97 0.04 80)", trend: "up" },
          { label: t("swineReproduction.averageDailyGain"), value: eng.gpd_medio ? `${eng.gpd_medio} kg` : "—", icon: "📊", color: "oklch(0.96 0.04 290)", trend: "neutral" },
          { label: t("swineReproduction.readyForSale"), value: eng.prontos ?? 0, icon: "💰", color: "oklch(0.55 0.16 145)", trend: "up" },
          { label: t("swineReproduction.estimatedValue"), value: eng.valor_estimado ? new Intl.NumberFormat(language, { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(Number(eng.valor_estimado)) : "—", icon: "💲", color: "oklch(0.55 0.12 230)", trend: "neutral" },
        ],
        tabActions: [
          { label: t("swineReproduction.registerSale"), icon: "💰", color: "oklch(0.55 0.16 145)", desc: t("swineReproduction.goToAnimalSales"), type: 'sale_redirect' },
          { label: t("swineReproduction.registerMortality"), icon: "⚠️", color: "oklch(0.58 0.2 25)", desc: t("swineReproduction.writeOffBatch"), type: 'batch_mortality' },
          { label: t("swineReproduction.financialSummary"), icon: "📊", color: "oklch(0.78 0.15 85)", desc: t("swineReproduction.viewBatchReports"), onClick: () => router.push("/home/relatorios/rebanho?tab=batches") },
        ],
        tabAlerts: tab.engorda?.alerts || [],
        tabAiSuggestions: tab.engorda?.aiSuggestions || [],
        columns: [
          { key: "lote", label: t("swineReproduction.batch") },
          { key: "qtd", label: t("swineReproduction.quantity") },
          { key: "dias", label: t("swineReproduction.days") },
          { key: "peso", label: t("swineReproduction.weightKg"), render: (v: any) => v != null ? `${v} kg` : "—" },
          { key: "idade", label: t("swineReproduction.batchAge"), render: (value: number | null) => value == null ? "—" : `${value} ${t("swineReproduction.days")}` },
          { key: "previsao", label: t("swineReproduction.saleForecast"), render: formatDateCell },
        ],
        actions: [
          {
            label: t("swineReproduction.technicalSheet"),
            icon: <Eye size={16} />,
            variant: "secondary",
            type: 'technical_sheet',
          } as any
        ],
        rows: tab.engorda?.rows || [],
        statusKey: "status",
        statusMap: {
          "Pronto para venda": { label: t("swineReproduction.readyForSale"), variant: "green" },
          "Em engorda": { label: t("swineReproduction.inFattening"), variant: "blue" },
        },
      } as any,
    ],
  }), [tab, d, m, mat, g, matn, cr, cresc, eng, tabLoadingStates, reproducers, activeTab, showToast, refetchTabs, router, setActiveTab, formatDateCell, t, language]);

  const handleSuccess = () => {
    refetchTabs(["dashboard", "marras", "matrizes", "gestacao", "maternidade", "creche", "crescimento", "engorda"], false, true);
  };

  return (
    <>
    {Object.keys(loadErrors).length > 0 && <div className="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
      <span>{t("swineReproduction.loadAllError")}</span>
      <button type="button" className="btn btn-outline-danger btn-sm" disabled={initialLoading} onClick={() => { void refetchTabs(Object.keys(loadErrors) as TabId[], true, true); }}>{t("swineReproduction.retry")}</button>
    </div>}
    <ReproducaoDashboard
      config={config}
      initialLoading={initialLoading}
      tabLoading={tabLoadingStates}
      onSuccess={handleSuccess}
      reproducerOptions={reproducers}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    />
    </>
  );
}

export default function SuinosReproducaoPage() {
  const { t } = useOrganizationLocale();
  return (
    <Suspense fallback={
      <div className="d-flex align-items-center justify-content-center p-5">
        <Loader2 className="spin-animation text-muted" />
        <span className="ms-2 text-muted">{t("swineReproduction.loadingModule")}</span>
      </div>
    }>
      <ReproducaoPageContent />
    </Suspense>
  );
}
