"use client";

import { useEffect, useState, useCallback, useRef, Suspense, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Plus, Loader2, Eye } from "lucide-react";
import { ReproducaoDashboard, ReproducaoConfig } from "@/components/reproducao/ReproducaoDashboard";
import { useToast } from "@/components/ui/Toast";
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
  updateAnimalBatch,
  updateAnimal,
  updateLitter,
  batchWean,
  getReproducers,
  diagnosePregnancy,
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

const formatDateCell = (v: any) => {
  if (!v) return "—";
  const str = String(v);
  if (str.includes("T")) return new Date(str).toLocaleDateString("pt-BR");
  const parts = str.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : str;
};

function ReproducaoPageContent() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  
  const [initialLoading, setInitialLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [tabData, setTabData] = useState<Record<string, any>>({});
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({});
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
    return () => { mountedRef.current = false; };
  }, []);

  const fetchTabData = useCallback(async (tabId: TabId, fetchFn: () => Promise<any>) => {
    lastFetchRef.current[tabId] = Date.now();
    setTabLoading(prev => ({ ...prev, [tabId]: true }));
    try {
      const data = await fetchFn();
      if (mountedRef.current) {
        setTabData(prev => ({ ...prev, [tabId]: data }));
      }
    } finally {
      if (mountedRef.current) {
        setTabLoading(prev => ({ ...prev, [tabId]: false }));
      }
    }
  }, []);

  const refetchTabs = useCallback(async (tabIds: TabId[], showLoader = false, force = false) => {
    const toFetch = tabIds.filter(id => {
      if (force) return true;
      const elapsed = Date.now() - (lastFetchRef.current[id] || 0);
      return elapsed > CACHE_TTL_MS;
    });
    if (toFetch.length === 0) return;
    if (showLoader) setInitialLoading(true);
    await Promise.all(toFetch.map(id => fetchTabData(id, TAB_FETCH_MAP[id])));
    if (showLoader && mountedRef.current) setInitialLoading(false);
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

  const config: ReproducaoConfig = useMemo(() => ({
    especie: "suinos",
    emoji: "🐷",
    titulo: "Rebanho Suíno",
    subtitulo: "Gestão do ciclo reprodutivo e maternidade",
    badgeColor: "oklch(0.65 0.15 230)",
    badgeTextColor: "oklch(0.45 0.15 145)",
    kpis: [
      { label: "Marrãs", value: d.marras ?? "—", icon: "🐖", color: "oklch(0.95 0.05 145)", trend: "up" },
      { label: "Aguar. Cob.", value: d.aguardando_cobertura ?? "—", icon: "🔄", color: "oklch(0.94 0.04 230)", trend: "neutral" },
      { label: "Gestantes", value: d.gestantes ?? "—", icon: "🤰", color: "oklch(0.97 0.04 80)", trend: "up" },
      { label: "Leitões (mês)", value: d.nascidos_mes ?? "—", icon: "🍼", color: "oklch(0.96 0.04 290)", trend: "up" },
      { label: "Tx. Prenhez", value: d.tx_prenhez ?? "—", icon: "🎯", color: "var(--muted)", trend: "neutral" },
    ],
    flowSteps: [
      { icon: "🐖", label: "Marrãs", count: tab.marras?.rows?.length ?? 0, color: "oklch(0.99 0.01 145)", borderColor: "oklch(0.95 0.05 145)" },
      { icon: "🤰", label: "Gestação", count: tab.gestacao?.rows?.length ?? 0, color: "oklch(0.99 0.01 80)", borderColor: "oklch(0.97 0.04 80)" },
      { icon: "🍼", label: "Maternidade", count: tab.maternidade?.rows?.length ?? 0, color: "oklch(0.99 0.01 290)", borderColor: "oklch(0.96 0.04 290)" },
      { icon: "👩‍🍼", label: "Matrizes", count: tab.matrizes?.rows?.length ?? 0, color: "oklch(0.99 0.01 230)", borderColor: "oklch(0.94 0.04 230)" },
      { icon: "🐷", label: "Creche", count: tab.creche?.rows?.length ?? 0, color: "oklch(0.99 0.01 185)", borderColor: "oklch(0.95 0.04 185)" },
    ],
    alerts: tab.dashboard?.alerts?.length > 0 ? tab.dashboard.alerts : [],
    activities: [],
    aiSuggestions: tab.dashboard?.aiSuggestions?.length > 0 ? tab.dashboard.aiSuggestions : [],
    tabs: [
      {
        id: "marras",
        icon: "🐖",
        label: "Marrãs",
        count: tab.marras?.rows?.length,
        selectable: true,
        rowKey: "id",
        batchActions: [
          { 
            label: "Registrar Cobertura", 
            icon: "🤰", 
            variant: "primary", 
            type: "mating_marra"
          },
        ],
        kpis: [
          { label: "Total Marrãs", value: m.total ?? 0, icon: "🐖", color: "oklch(0.95 0.05 145)", trend: "up" },
          { label: "Disponíveis", value: m.disponiveis ?? 0, icon: "✅", color: "oklch(0.94 0.04 230)", trend: "neutral" },
          { label: "Em Preparação", value: m.em_preparo ?? 0, icon: "⏳", color: "oklch(0.97 0.04 80)", trend: "neutral" },
          { label: "Prontas", value: m.prontas ?? 0, icon: "🎯", color: "oklch(0.96 0.04 290)", trend: "up" },
        ],
        tabActions: [
          { label: "Registrar Pesagem", icon: "⚖️", color: "oklch(0.55 0.16 230)", desc: "Atualizar peso", type: 'weight' },
          { label: "Registrar Vacina", icon: "💉", color: "oklch(0.6 0.22 27)", desc: "Vacinação", type: 'vaccine' },
          { label: "Registrar Cobertura", icon: "🔄", color: "oklch(0.78 0.15 85)", desc: "Primeira cobertura", type: 'mating_marra' },
        ],
        tabAlerts: tab.marras?.alerts || [],
        tabAiSuggestions: tab.marras?.aiSuggestions || [],
        columns: [
          { key: "identifier", label: "Brinco", render: (v: any) => <span className="repro-table-id">{String(v)}</span> },
          { key: "idade", label: "Idade (dias)" },
          { key: "peso", label: "Peso (kg)" },
          { key: "entrada", label: "Entrada", render: formatDateCell },
        ],
        actions: [
          {
            label: "Ver Ficha Técnica",
            icon: <Eye size={16} />,
            variant: "secondary",
            type: 'technical_sheet',
          } as any
        ],
        rows: tab.marras?.rows || [],
        statusKey: "status",
        statusMap: {
          "aguardando_cobertura": { label: "Aguardando Cobertura", variant: "amber" },
          "pronta": { label: "Pronta para Cobertura", variant: "green" },
          "em_preparo": { label: "Em Preparo", variant: "amber" },
          "vazia": { label: "Disponível", variant: "gray" },
          "coberta": { label: "Coberta (Aguard. DG)", variant: "blue" },
        },
      },
      {
        id: "matrizes",
        icon: "👩‍🍼",
        label: "Matrizes",
        count: tab.matrizes?.rows?.length,
        selectable: true,
        rowKey: "id",
        batchActions: [
          { 
            label: "Registrar Cobertura", 
            icon: "🤰", 
            variant: "primary", 
            type: "mating_marra"
          },
          { label: "Descartar", icon: "🚫", variant: "danger", type: "discard" },
        ],
        primaryActionLabel: "Registrar Cobertura",
        primaryActionModalFields: [
          { name: "matriz", label: "Matriz (Brinco)", type: "text", required: true },
          { name: "data_cobertura", label: "Data da Cobertura", type: "date", required: true },
          { name: "mating_type", label: "Tipo de Cobertura", type: "select", options: [
            { value: "natural", label: "Monta Natural" },
            { value: "ai", label: "Inseminação Artificial" },
            { value: "iatf", label: "IATF" },
          ], initialValue: "natural" },
          { name: "sire_info", label: "Reprodutor / Dose", type: "text" },
        ],
        onSave: async (data: any) => {
          await createMating({
            female_identifier: data.matriz,
            mating_date: data.data_cobertura,
            mating_type: data.mating_type,
            sire_info: data.sire_info || "",
          });
          showToast("Cobertura registrada com sucesso!", "success");
          refetchTabs(["matrizes", "gestacao", "dashboard"], false, true);
        },
        kpis: [
          { label: "Total Matrizes", value: mat.total ?? 0, icon: "👩‍🍼", color: "oklch(0.94 0.04 230)", trend: "neutral" },
          { label: "Vazias", value: mat.vazias ?? 0, icon: "🟢", color: "oklch(0.95 0.05 145)", trend: "down" },
          { label: "Cobertas", value: mat.cobertas ?? 0, icon: "🔵", color: "oklch(0.55 0.16 230)", trend: "up" },
          { label: "Lactantes", value: mat.lactantes ?? 0, icon: "🍼", color: "oklch(0.96 0.04 290)", trend: "up" },
        ],
        tabActions: [
          { label: "Registrar Cobertura", icon: "🤰", color: "oklch(0.55 0.16 230)", desc: "Nova cobertura", type: 'primary' },
          { label: "Diagnóstico Prenhez", icon: "🔬", color: "oklch(0.55 0.16 145)", desc: "Confirmar gestação", type: 'diagnosis' },
          { label: "Descartar Matriz", icon: "🚫", color: "oklch(0.6 0.22 27)", desc: "Remover do plantel", type: 'discard' },
          { label: "Histórico", icon: "📋", color: "oklch(0.78 0.15 85)", desc: "Ver histórico", type: 'history' },
        ],
        tabAlerts: tab.matrizes?.alerts || [],
        tabAiSuggestions: tab.matrizes?.aiSuggestions || [],
        columns: [
          { key: "identifier", label: "Brinco", render: (v: any) => <span className="repro-table-id">{String(v)}</span> },
          { key: "op", label: "Ordem de Parto" },
          { key: "dias_abertos", label: "Dias Abertos" },
          { key: "ultima_cobertura", label: "Última Cobertura", render: formatDateCell },
        ],
        actions: [
          {
            label: "Ver Ficha Técnica",
            icon: <Eye size={16} />,
            variant: "secondary",
            type: 'technical_sheet',
          } as any
        ],
        rows: tab.matrizes?.rows || [],
        statusKey: "status",
        statusMap: {
          "vazia": { label: "Vazia", variant: "gray" },
          "aguardando_cobertura": { label: "Aguardando Cobertura", variant: "amber" },
          "coberta": { label: "Coberta", variant: "blue" },
          "gestante": { label: "Gestante", variant: "green" },
          "lactante": { label: "Lactante", variant: "purple" },
          "descanso": { label: "Em Descanso", variant: "amber" },
        },
      },
      {
        id: "gestacao",
        icon: "🤰",
        label: "Gestação",
        count: tab.gestacao?.rows?.length,
        selectable: true,
        rowKey: "id",
        batchActions: [
          { 
            label: "Confirmar Parto (Lote)", 
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
                showToast(`Prenhez confirmada para ${rows.length}!`, "success");
                refetchTabs(["gestacao", "maternidade", "dashboard", "matrizes"], false, true);
              } catch (err) {
                showToast("Erro ao confirmar prenhez", "error");
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
          { label: "Total em Gestação", value: g.total ?? 0, icon: "🤰", color: "oklch(0.97 0.04 80)", trend: "up" },
          { label: "Aguar. Diagnóstico", value: g.aguardando_dg ?? 0, icon: "🔬", color: "oklch(0.94 0.04 230)", trend: "neutral" },
          { label: "Prenhez Confirmada", value: g.confirmadas ?? 0, icon: "✅", color: "oklch(0.95 0.05 145)", trend: "up" },
          { label: "Parto Próximo", value: g.parto_proximo ?? 0, icon: "⏰", color: "oklch(0.6 0.22 27)", trend: "neutral" },
        ],
        tabActions: [
          { label: "Confirmar Parto", icon: "🍼", color: "oklch(0.55 0.16 145)", desc: "Registrar nascimento", type: 'birth' },
          { label: "Registrar Perda", icon: "❌", color: "oklch(0.6 0.22 27)", desc: "Aborto / Reabsorção", type: 'loss' },
          { label: "Registrar Vacina", icon: "💉", color: "oklch(0.55 0.16 230)", desc: "Vacinação pré-parto", type: 'vaccine' },
        ],
        tabAlerts: tab.gestacao?.alerts || [],
        tabAiSuggestions: tab.gestacao?.aiSuggestions || [],
        columns: [
          { key: "identifier", label: "Brinco", render: (v: any) => <span className="repro-table-id">{String(v)}</span> },
          { key: "cobertura", label: "Data Cobertura", render: formatDateCell },
          { key: "dias", label: "Dias Gestação" },
          { key: "previsao", label: "Previsão DG/Parto", render: formatDateCell },
          { key: "dias_faltantes", label: "Prazo Próximo Evento" },
        ],
        actions: [
          {
            label: "Registrar Parto",
            icon: <Plus size={16} />,
            variant: "primary",
            type: 'birth',
            onClick: () => {},
          } as any,
          {
            label: "Ver Ficha Técnica",
            icon: <Eye size={16} />,
            variant: "secondary",
            type: 'technical_sheet',
          } as any
        ],
        rows: tab.gestacao?.rows || [],
        statusKey: "status",
        statusMap: {
          "Gestante": { label: "Prenhez Confirmada", variant: "green" },
          "Parto próximo": { label: "Parto Próximo", variant: "amber" },
          "Confirmar Prenhez": { label: "Aguardando DG (21d)", variant: "blue" },
        },
      },
      {
        id: "maternidade",
        icon: "🍼",
        label: "Maternidade",
        count: tab.maternidade?.rows?.length,
        selectable: true,
        rowKey: "id",
        batchActions: [
          { label: "Confirmar Desmame", icon: "🔄", variant: "primary", type: 'wean' as any },
        ],
        kpis: [
          { label: "Em Lactação", value: matn.em_lactacao ?? 0, icon: "🍼", color: "oklch(0.96 0.04 290)", trend: "up" },
          { label: "Nascidos (mês)", value: matn.nascidos_mes ?? 0, icon: "🐷", color: "oklch(0.95 0.05 145)", trend: "up" },
          { label: "Desmamados (mês)", value: matn.desmamados_mes ?? 0, icon: "✅", color: "oklch(0.55 0.16 230)", trend: "up" },
          { label: "Mortalidade", value: matn.mortalidade ?? "—", icon: "📉", color: "oklch(0.6 0.22 27)", trend: "down" },
          { label: "Média Nascidos", value: matn.media_nascidos ?? "—", icon: "📊", color: "oklch(0.55 0.16 145)", trend: "neutral" },
        ],
        tabActions: [
          { label: "Registrar Procedimento / Manejo", icon: "📝", color: "oklch(0.55 0.16 145)", desc: "Registrar procedimento", type: 'procedure' },
          { label: "Registrar Mortalidade", icon: "⚠️", color: "oklch(0.6 0.22 27)", desc: "Registrar óbito", type: 'mortality' },
          { label: "Registrar Pesagem", icon: "⚖️", color: "oklch(0.55 0.16 230)", desc: "Pesar leitões", type: 'weight' },
          { label: "Confirmar Desmame", icon: "🔄", color: "oklch(0.78 0.15 85)", desc: "Avançar para creche", type: 'wean' },
        ],
        tabAlerts: tab.maternidade?.alerts || [],
        tabAiSuggestions: tab.maternidade?.aiSuggestions || [],
        columns: [
          { key: "identifier", label: "Matriz", render: (v: any) => <span className="repro-table-id">{String(v)}</span> },
          { key: "data_parto", label: "Data Parto", render: formatDateCell },
          { key: "vivos", label: "Nascidos Vivos" },
          { key: "obitos", label: "Óbitos" },
          { key: "mortalidade_pos", label: "Mortalidade" },
          { key: "mumificados", label: "Mumificados" },
          { key: "vivos_atual", label: "Vivos Atual" },
          { key: "idade", label: "Dias (Idade)" },
          { key: "previsao_desmame", label: "Prev. Desmame", render: formatDateCell },
        ],
        actions: [
          {
            label: "Ver Ficha Técnica",
            icon: <Eye size={16} />,
            variant: "secondary",
            type: 'technical_sheet',
          } as any
        ],
        rows: tab.maternidade?.rows || [],
        statusKey: "status",
        statusMap: {
          "Lactação": { label: "Em Lactação", variant: "purple" },
          "Pronto p/ Desmame": { label: "Pronto p/ Desmame", variant: "amber" },
          "Desmamado": { label: "Desmamado", variant: "green" },
        },
      },
      {
        id: "creche",
        icon: "🐷",
        label: "Creche",
        count: tab.creche?.rows?.length,
        selectable: true,
        rowKey: "lote",
        batchActions: [
          { label: "Transferir p/ Crescimento", icon: "🔄", variant: "primary", type: "transfer_crescimento" },
        ],
        kpis: [
          { label: "Total Lotes", value: cr.total ?? 0, icon: "📦", color: "oklch(0.95 0.04 185)", trend: "up" },
          { label: "Animais Alojados", value: cr.animais_alojados ?? 0, icon: "🐷", color: "oklch(0.94 0.04 230)", trend: "up" },
          { label: "Peso Médio", value: cr.peso_medio ?? "—", icon: "⚖️", color: "oklch(0.97 0.04 80)", trend: "neutral" },
        ],
        tabActions: [
          { label: "Registrar Pesagem", icon: "⚖️", color: "oklch(0.55 0.16 230)", desc: "Atualizar peso do lote", type: 'weight' },
          { label: "Registrar Consumo", icon: "🍽️", color: "oklch(0.55 0.16 145)", desc: "Consumo de ração" },
          { label: "Registrar Vacina", icon: "💉", color: "oklch(0.6 0.22 27)", desc: "Vacinação", type: 'vaccine' },
          { label: "Transferir", icon: "🔄", color: "oklch(0.78 0.15 85)", desc: "Para crescimento", type: "transfer_crescimento" },
        ],
        tabAlerts: tab.creche?.alerts || [],
        tabAiSuggestions: tab.creche?.aiSuggestions || [],
        columns: [
          { key: "lote", label: "Lote" },
          { key: "entrada", label: "Entrada", render: formatDateCell },
          { key: "qtd", label: "Qtd. Atual" },
          { key: "peso", label: "Peso Médio" },
        ],
        actions: [
          {
            label: "Ver Ficha Técnica",
            icon: <Eye size={16} />,
            variant: "secondary",
            type: 'technical_sheet',
          } as any
        ],
        rows: tab.creche?.rows || [],
        statusKey: "status",
        statusMap: {
          "active": { label: "Alojado", variant: "blue" },
        },
      },
      {
        id: "crescimento",
        icon: "📈",
        label: "Crescimento",
        count: tab.crescimento?.rows?.length,
        selectable: true,
        rowKey: "lote",
        batchActions: [
          { label: "Transferir p/ Engorda", icon: "🔄", variant: "primary", type: "transfer_engorda" },
        ],
        kpis: [
          { label: "Total Lotes", value: cresc.total ?? 0, icon: "📦", color: "oklch(0.94 0.04 230)", trend: "neutral" },
          { label: "Animais Alojados", value: cresc.animais_alojados ?? 0, icon: "🐷", color: "oklch(0.95 0.05 145)", trend: "up" },
          { label: "Peso Médio", value: cresc.peso_medio ? `${cresc.peso_medio} kg` : "—", icon: "⚖️", color: "oklch(0.97 0.04 80)", trend: "neutral" },
          { label: "GPD Médio", value: cresc.gpd_medio ? `${cresc.gpd_medio} kg` : "—", icon: "📊", color: "oklch(0.96 0.04 290)", trend: "up" },
          { label: "Próximos Engorda", value: cresc.proximos_engorda ?? 0, icon: "📈", color: "oklch(0.6 0.22 27)", trend: "up" },
        ],
        tabActions: [
          { label: "Registrar Pesagem", icon: "⚖️", color: "oklch(0.55 0.16 230)", desc: "Atualizar peso", type: 'weight' },
          { label: "Registrar Consumo", icon: "🍽️", color: "oklch(0.55 0.16 145)", desc: "Consumo de ração" },
          { label: "Lançar Medicação", icon: "💊", color: "oklch(0.6 0.22 27)", desc: "Medicação", type: 'vaccine' },
          { label: "Transferir", icon: "🔄", color: "oklch(0.78 0.15 85)", desc: "Para engorda", type: "transfer_engorda" },
        ],
        tabAlerts: tab.crescimento?.alerts || [],
        tabAiSuggestions: tab.crescimento?.aiSuggestions || [],
        columns: [
          { key: "lote", label: "Lote" },
          { key: "entrada", label: "Entrada", render: formatDateCell },
          { key: "dias", label: "Dias" },
          { key: "qtd", label: "Qtd." },
          { key: "peso", label: "Peso (kg)", render: (v: any) => v != null ? `${v} kg` : "—" },
          { key: "gpd", label: "GPD (kg)", render: (v: any) => v != null ? `${v} kg` : "—" },
          { key: "previsao", label: "Prev. Engorda", render: formatDateCell },
        ],
        actions: [
          {
            label: "Ver Ficha Técnica",
            icon: <Eye size={16} />,
            variant: "secondary",
            type: 'technical_sheet',
          } as any
        ],
        rows: tab.crescimento?.rows || [],
        statusKey: "status",
        statusMap: {
          "Em crescimento": { label: "Em Crescimento", variant: "teal" },
          "Pronto p/ engorda": { label: "Pronto p/ Engorda", variant: "green" },
        },
      },
      {
        id: "engorda",
        icon: "⚖️",
        label: "Engorda",
        count: tab.engorda?.rows?.length,
        selectable: true,
        rowKey: "lote",
        batchActions: [
          { label: "Registrar Venda", icon: "💰", variant: "primary", onClick: async (rows: any[]) => { await Promise.all(rows.map(r => updateAnimalBatch(r.id as number, { status: "sold" }))); refetchTabs(["engorda", "dashboard"], false, true); showToast(`Venda registrada para ${rows.length} lotes!`, "success"); } },
          { label: "Encerrar Lotes", icon: "🔒", variant: "danger", onClick: async (rows: any[]) => { await Promise.all(rows.map(r => updateAnimalBatch(r.id as number, { status: "finished" }))); refetchTabs(["engorda", "dashboard"], false, true); showToast(`${rows.length} lotes encerrados.`, "success"); } },
        ],
        kpis: [
          { label: "Total Lotes", value: eng.total ?? 0, icon: "📦", color: "oklch(0.94 0.04 230)", trend: "neutral" },
          { label: "Animais Alojados", value: eng.animais_alojados ?? 0, icon: "🐷", color: "oklch(0.95 0.05 145)", trend: "up" },
          { label: "Peso Médio", value: eng.peso_medio ? `${eng.peso_medio} kg` : "—", icon: "⚖️", color: "oklch(0.97 0.04 80)", trend: "up" },
          { label: "GPD Médio", value: eng.gpd_medio ? `${eng.gpd_medio} kg` : "—", icon: "📊", color: "oklch(0.96 0.04 290)", trend: "neutral" },
          { label: "Prontos p/ Venda", value: eng.prontos ?? 0, icon: "💰", color: "oklch(0.55 0.16 145)", trend: "up" },
          { label: "Valor Estimado", value: eng.valor_estimado ? `R$ ${Number(eng.valor_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "—", icon: "💲", color: "oklch(0.55 0.12 230)", trend: "neutral" },
        ],
        tabActions: [
          { label: "Registrar Venda", icon: "💰", color: "oklch(0.55 0.16 145)", desc: "Registrar venda" },
          { label: "Atualizar Preço", icon: "💲", color: "oklch(0.55 0.16 230)", desc: "Preço por kg" },
          { label: "Encerrar Lote", icon: "🔒", color: "oklch(0.6 0.22 27)", desc: "Finalizar lote" },
          { label: "Resumo Financeiro", icon: "📊", color: "oklch(0.78 0.15 85)", desc: "Ver resultados" },
        ],
        tabAlerts: tab.engorda?.alerts || [],
        tabAiSuggestions: tab.engorda?.aiSuggestions || [],
        columns: [
          { key: "lote", label: "Lote" },
          { key: "qtd", label: "Qtd." },
          { key: "dias", label: "Dias" },
          { key: "peso", label: "Peso (kg)", render: (v: any) => v != null ? `${v} kg` : "—" },
          { key: "gpd", label: "GPD (kg)", render: (v: any) => v != null ? `${v} kg` : "—" },
          { key: "previsao", label: "Prev. Venda", render: formatDateCell },
        ],
        actions: [
          {
            label: "Ver Ficha Técnica",
            icon: <Eye size={16} />,
            variant: "secondary",
            type: 'technical_sheet',
          } as any
        ],
        rows: tab.engorda?.rows || [],
        statusKey: "status",
        statusMap: {
          "Pronto para venda": { label: "Pronto para Venda", variant: "green" },
          "Em engorda": { label: "Em Engorda", variant: "blue" },
        },
      } as any,
    ],
  }), [tab, d, m, mat, g, matn, cr, cresc, eng, tabLoadingStates, reproducers, activeTab, showToast, refetchTabs, setActiveTab]);

  const handleSuccess = () => {
    refetchTabs(["dashboard", "marras", "matrizes", "gestacao", "maternidade", "creche", "crescimento", "engorda"], false, true);
  };

  return (
    <ReproducaoDashboard
      config={config}
      initialLoading={initialLoading}
      tabLoading={tabLoadingStates}
      onSuccess={handleSuccess}
      reproducerOptions={reproducers}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    />
  );
}

export default function SuinosReproducaoPage() {
  return (
    <Suspense fallback={
      <div className="d-flex align-items-center justify-content-center p-5">
        <Loader2 className="spin-animation text-muted" />
        <span className="ms-2 text-muted">Carregando módulo...</span>
      </div>
    }>
      <ReproducaoPageContent />
    </Suspense>
  );
}
