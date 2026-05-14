"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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

export default function SuinosReproducaoPage() {
  const { showToast } = useToast();
  const [initialLoading, setInitialLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [tabData, setTabData] = useState<Record<string, any>>({});
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({});
  const mountedRef = useRef(true);
  const lastFetchRef = useRef<Record<string, number>>({});

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

  const refetchTabs = useCallback(async (tabIds: TabId[], showLoader = false) => {
    const toFetch = tabIds.filter(id => {
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

  const d = dashboardData?.kpis || {};
  const tab = tabData;

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
  const g = tab.gestacoes?.kpis || {};
  const matn = tab.maternidades?.kpis || {};
  const cr = tab.creches?.kpis || {};
  const cresc = tab.crescimentos?.kpis || {};
  const eng = tab.engordas?.kpis || {};

  const config: ReproducaoConfig = {
    especie: "suinos",
    emoji: "🐷",
    titulo: "Suínos",
    subtitulo: "Módulo de gestão reprodutiva do plantel suíno.",
    badgeColor: "oklch(0.95 0.05 145)",
    badgeTextColor: "oklch(0.45 0.15 145)",
    kpis: [
      { label: "Marrãs", value: d.marras ?? "—", icon: "🐖", color: "oklch(0.95 0.05 145)", trend: "up" },
      { label: "Matrizes ativas", value: d.matrizes_ativas ?? "—", icon: "👩‍🍼", color: "oklch(0.94 0.04 230)", trend: "neutral" },
      { label: "Gestantes", value: d.gestantes ?? "—", icon: "🤰", color: "oklch(0.97 0.04 80)", trend: "up" },
      { label: "Leitões (mês)", value: d.nascidos_mes ?? "—", icon: "🍼", color: "oklch(0.96 0.04 290)", trend: "up" },
      { label: "Tx. Prenhez", value: d.tx_prenhez ?? "—", icon: "🎯", color: "var(--muted)", trend: "neutral" },
    ],
    flowSteps: [
      { icon: "🐖", label: "Marrãs", count: tab.marras?.rows?.length ?? 0, color: "oklch(0.99 0.01 145)", borderColor: "oklch(0.95 0.05 145)" },
      { icon: "👩‍🍼", label: "Matrizes", count: tab.matrizes?.rows?.length ?? 0, color: "oklch(0.99 0.01 230)", borderColor: "oklch(0.94 0.04 230)" },
      { icon: "🤰", label: "Gestação", count: tab.gestacoes?.rows?.length ?? 0, color: "oklch(0.99 0.01 80)", borderColor: "oklch(0.97 0.04 80)" },
      { icon: "🍼", label: "Maternidade", count: tab.maternidades?.rows?.length ?? 0, color: "oklch(0.99 0.01 290)", borderColor: "oklch(0.96 0.04 290)" },
      { icon: "🐷", label: "Creche", count: tab.creches?.rows?.length ?? 0, color: "oklch(0.99 0.01 185)", borderColor: "oklch(0.95 0.04 185)" },
      { icon: "📈", label: "Crescimento", count: tab.crescimentos?.rows?.length ?? 0, color: "var(--muted)", borderColor: "var(--border)" },
      { icon: "⚖️", label: "Engorda", count: tab.engordas?.rows?.length ?? 0, color: "var(--muted)", borderColor: "var(--border)" },
    ],
    alerts: dashboardData?.alerts?.length > 0 ? dashboardData.alerts : [],
    activities: [],
    aiSuggestions: dashboardData?.aiSuggestions?.length > 0 ? dashboardData.aiSuggestions : [],
    tabs: [
      {
        id: "marras",
        icon: "🐖",
        label: "Marrãs",
        count: tab.marras?.rows?.length,
        selectable: true,
        rowKey: "id",
        batchActions: [
          { label: "Promover p/ Cobertura", icon: "🔄", variant: "primary", onClick: async (rows) => { showToast(`${rows.length} marrãs promovidas!`, "success"); refetchTabs(["marras", "matrizes", "dashboard"]); } },
        ],
        primaryActionLabel: "Nova Marrã",
        primaryActionModalFields: [
          { name: "brinco", label: "Brinco/ID", type: "text", required: true },
          { name: "data_entrada", label: "Data de Entrada", type: "date", required: true },
          { name: "peso", label: "Peso Inicial (kg)", type: "number" },
          { name: "linhagem", label: "Linhagem", type: "text" },
        ],
        onSave: async (data) => {
          await createAnimal({
            identifier: data.brinco,
            entry_date: data.data_entrada,
            initial_weight_kg: data.peso ? parseFloat(data.peso) : null,
            gender: "F",
            species_code_input: "suinos",
            notes: data.linhagem ? `Linhagem: ${data.linhagem}` : "",
          });
          showToast("Marrã cadastrada com sucesso!", "success");
          refetchTabs(["marras", "matrizes", "dashboard"]);
        },
        kpis: [
          { label: "Total Marrãs", value: m.total ?? 0, icon: "🐖", color: "oklch(0.95 0.05 145)", trend: "up" },
          { label: "Disponíveis", value: m.disponiveis ?? 0, icon: "✅", color: "oklch(0.94 0.04 230)", trend: "neutral" },
          { label: "Em Preparação", value: m.em_preparo ?? 0, icon: "⏳", color: "oklch(0.97 0.04 80)", trend: "neutral" },
          { label: "Prontas", value: m.prontas ?? 0, icon: "🎯", color: "oklch(0.96 0.04 290)", trend: "up" },
        ],
        tabActions: [
          { label: "Nova Marrã", icon: "➕", color: "oklch(0.55 0.16 145)", desc: "Cadastrar nova marrã" },
          { label: "Registrar Pesagem", icon: "⚖️", color: "oklch(0.55 0.16 230)", desc: "Atualizar peso" },
          { label: "Registrar Vacina", icon: "💉", color: "oklch(0.6 0.22 27)", desc: "Vacinação" },
          { label: "Promover para Cobertura", icon: "🔄", color: "oklch(0.78 0.15 85)", desc: "Avançar fase" },
        ],
        tabAlerts: tab.marras?.alerts || [],
        tabAiSuggestions: tab.marras?.aiSuggestions || [],
        columns: [
          { key: "id", label: "Brinco", render: (v) => <span className="repro-table-id">{String(v)}</span> },
          { key: "idade", label: "Idade (dias)" },
          { key: "peso", label: "Peso (kg)" },
          { key: "entrada", label: "Entrada" },
        ],
        rows: tab.marras?.rows || [],
        statusKey: "status",
        statusMap: {
          "pronta": { label: "Pronta para Cobertura", variant: "green" },
          "em_preparo": { label: "Em Preparo", variant: "amber" },
          "vazia": { label: "Disponível", variant: "gray" },
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
          { label: "Registrar Cobertura", icon: "🤰", variant: "primary", onClick: async (rows) => { showToast(`Cobertura registrada para ${rows.length} matrizes!`, "success"); refetchTabs(["matrizes", "gestacao", "dashboard"]); } },
          { label: "Descartar", icon: "🚫", variant: "danger", onClick: async (rows) => { await Promise.all(rows.map(r => updateAnimal(r.pk as number, { status: "finished" }))); showToast(`${rows.length} matrizes descartadas.`, "success"); refetchTabs(["matrizes", "dashboard"]); } },
        ],
        primaryActionLabel: "Registrar Cobertura",
        primaryActionModalFields: [
          { name: "matriz", label: "Matriz (Brinco)", type: "text", required: true },
          { name: "data_cobertura", label: "Data da Cobertura", type: "date", required: true },
          { name: "tipo", label: "Tipo", type: "select", options: [{ value: "IA", label: "Inseminação Artificial" }, { value: "MN", label: "Monta Natural" }] },
          { name: "reprodutor", label: "Reprodutor / Dose", type: "text" },
        ],
        onSave: async (data) => {
          await createMating({
            female_identifier: data.matriz,
            mating_date: data.data_cobertura,
            mating_type: data.tipo === "IA" ? "ai" : "natural",
            sire_info: data.reprodutor || "",
          });
          showToast("Cobertura registrada com sucesso!", "success");
          refetchTabs(["matrizes", "gestacao", "dashboard"]);
        },
        kpis: [
          { label: "Total Matrizes", value: mat.total ?? 0, icon: "👩‍🍼", color: "oklch(0.94 0.04 230)", trend: "neutral" },
          { label: "Vazias", value: mat.vazias ?? 0, icon: "🟢", color: "oklch(0.95 0.05 145)", trend: "down" },
          { label: "Cobertas", value: mat.cobertas ?? 0, icon: "🔵", color: "oklch(0.55 0.16 230)", trend: "up" },
          { label: "Lactantes", value: mat.lactantes ?? 0, icon: "🍼", color: "oklch(0.96 0.04 290)", trend: "up" },
        ],
        tabActions: [
          { label: "Registrar Cobertura", icon: "🤰", color: "oklch(0.55 0.16 230)", desc: "Nova cobertura" },
          { label: "Diagnóstico Prenhez", icon: "🔬", color: "oklch(0.55 0.16 145)", desc: "Confirmar gestação" },
          { label: "Descartar Matriz", icon: "🚫", color: "oklch(0.6 0.22 27)", desc: "Remover do plantel" },
          { label: "Histórico", icon: "📋", color: "oklch(0.78 0.15 85)", desc: "Ver histórico" },
        ],
        tabAlerts: tab.matrizes?.alerts || [],
        tabAiSuggestions: tab.matrizes?.aiSuggestions || [],
        columns: [
          { key: "id", label: "Brinco", render: (v) => <span className="repro-table-id">{String(v)}</span> },
          { key: "op", label: "Ordem de Parto" },
          { key: "dias_abertos", label: "Dias Abertos" },
          { key: "ultima_cobertura", label: "Última Cobertura" },
        ],
        rows: tab.matrizes?.rows || [],
        statusKey: "status",
        statusMap: {
          "vazia": { label: "Vazia", variant: "gray" },
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
        count: tab.gestacoes?.rows?.length,
        selectable: true,
        rowKey: "id",
        batchActions: [
          { label: "Confirmar Prenhez", icon: "✅", variant: "primary", onClick: async (rows) => { showToast(`Prenhez confirmada para ${rows.length}!`, "success"); refetchTabs(["gestacao", "maternidade", "dashboard"]); } },
          { label: "Registrar Perda", icon: "⚠️", variant: "danger", onClick: async (rows) => { showToast(`Perda registrada para ${rows.length}.`, "success"); refetchTabs(["gestacao", "dashboard"]); } },
        ],
        kpis: [
          { label: "Total Gestantes", value: g.total ?? 0, icon: "🤰", color: "oklch(0.97 0.04 80)", trend: "up" },
          { label: "Aguardando Diagnóstico", value: g.aguardando ?? 0, icon: "🔬", color: "oklch(0.94 0.04 230)", trend: "neutral" },
          { label: "Prenhez Confirmada", value: g.confirmadas ?? 0, icon: "✅", color: "oklch(0.95 0.05 145)", trend: "up" },
          { label: "Parto Próximo", value: g.parto_proximo ?? 0, icon: "⏰", color: "oklch(0.6 0.22 27)", trend: "neutral" },
        ],
        tabActions: [
          { label: "Confirmar Prenhez", icon: "✅", color: "oklch(0.55 0.16 145)", desc: "Diagnóstico positivo" },
          { label: "Registrar Perda", icon: "⚠️", color: "oklch(0.6 0.22 27)", desc: "Perda gestacional" },
          { label: "Registrar Vacina", icon: "💉", color: "oklch(0.55 0.16 230)", desc: "Vacinação" },
          { label: "Confirmar Parto", icon: "🍼", color: "oklch(0.78 0.15 85)", desc: "Registrar nascimento" },
        ],
        tabAlerts: tab.gestacoes?.alerts || [],
        tabAiSuggestions: tab.gestacoes?.aiSuggestions || [],
        columns: [
          { key: "id", label: "Brinco", render: (v) => <span className="repro-table-id">{String(v)}</span> },
          { key: "cobertura", label: "Data Cobertura" },
          { key: "dias", label: "Dias Gestação" },
          { key: "previsao", label: "Previsão Parto" },
        ],
        rows: tab.gestacoes?.rows || [],
        statusKey: "status",
        statusMap: {
          "Confirmada": { label: "Prenhez Confirmada", variant: "green" },
          "Parto próximo": { label: "Parto Próximo", variant: "amber" },
        },
      },
      {
        id: "maternidade",
        icon: "🍼",
        label: "Maternidade",
        count: tab.maternidades?.rows?.length,
        selectable: true,
        rowKey: "id",
        batchActions: [
          { label: "Confirmar Desmame", icon: "🔄", variant: "primary", onClick: async (rows) => { await batchWean(rows.map(r => r.id as number)); refetchTabs(["maternidade", "creche", "dashboard"]); } },
        ],
        kpis: [
          { label: "Em Lactação", value: matn.em_lactacao ?? 0, icon: "🍼", color: "oklch(0.96 0.04 290)", trend: "up" },
          { label: "Nascidos (mês)", value: matn.nascidos_mes ?? 0, icon: "🐷", color: "oklch(0.95 0.05 145)", trend: "up" },
          { label: "Desmamados (mês)", value: matn.desmamados_mes ?? 0, icon: "✅", color: "oklch(0.55 0.16 230)", trend: "up" },
          { label: "Mortalidade", value: matn.mortalidade ?? "—", icon: "📉", color: "oklch(0.6 0.22 27)", trend: "down" },
          { label: "Média Nascidos", value: matn.media_nascidos ?? "—", icon: "📊", color: "oklch(0.55 0.16 145)", trend: "neutral" },
        ],
        tabActions: [
          { label: "Registrar Manejo", icon: "📝", color: "oklch(0.55 0.16 145)", desc: "Registrar procedimento" },
          { label: "Registrar Mortalidade", icon: "⚠️", color: "oklch(0.6 0.22 27)", desc: "Registrar óbito" },
          { label: "Registrar Pesagem", icon: "⚖️", color: "oklch(0.55 0.16 230)", desc: "Pesar leitões" },
          { label: "Confirmar Desmame", icon: "🔄", color: "oklch(0.78 0.15 85)", desc: "Avançar para creche" },
        ],
        tabAlerts: tab.maternidades?.alerts || [],
        tabAiSuggestions: tab.maternidades?.aiSuggestions || [],
        columns: [
          { key: "matriz", label: "Matriz" },
          { key: "parto", label: "Data Parto" },
          { key: "nascidos", label: "Vivos" },
          { key: "natimortos", label: "Natimortos" },
          { key: "mumificados", label: "Mumif." },
          { key: "vivos_atual", label: "Vivos Atual" },
          { key: "idade", label: "Dias" },
          { key: "previsao_desmame", label: "Prev. Desmame" },
          { key: "peso_desmame", label: "Peso Desmame" },
        ],
        rows: tab.maternidades?.rows || [],
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
        count: tab.creches?.rows?.length,
        selectable: true,
        rowKey: "lote",
        batchActions: [
          { label: "Transferir p/ Crescimento", icon: "🔄", variant: "primary", onClick: async (rows) => { await Promise.all(rows.map(r => updateAnimalBatch(r.id as number, { phase: "crescimento" }))); refetchTabs(["creche", "crescimento", "dashboard"]); showToast(`${rows.length} lotes transferidos!`, "success"); } },
        ],
        kpis: [
          { label: "Total Lotes", value: cr.total ?? 0, icon: "📦", color: "oklch(0.95 0.04 185)", trend: "up" },
          { label: "Animais Alojados", value: cr.animais_alojados ?? 0, icon: "🐷", color: "oklch(0.94 0.04 230)", trend: "up" },
          { label: "Peso Médio", value: cr.peso_medio ?? "—", icon: "⚖️", color: "oklch(0.97 0.04 80)", trend: "neutral" },
        ],
        tabActions: [
          { label: "Registrar Pesagem", icon: "⚖️", color: "oklch(0.55 0.16 230)", desc: "Atualizar peso do lote" },
          { label: "Registrar Consumo", icon: "🍽️", color: "oklch(0.55 0.16 145)", desc: "Consumo de ração" },
          { label: "Registrar Vacina", icon: "💉", color: "oklch(0.6 0.22 27)", desc: "Vacinação" },
          { label: "Transferir", icon: "🔄", color: "oklch(0.78 0.15 85)", desc: "Para crescimento" },
        ],
        tabAlerts: tab.creches?.alerts || [],
        tabAiSuggestions: tab.creches?.aiSuggestions || [],
        columns: [
          { key: "lote", label: "Lote" },
          { key: "entrada", label: "Entrada" },
          { key: "qtd", label: "Qtd. Atual" },
          { key: "peso", label: "Peso Médio" },
        ],
        rows: tab.creches?.rows || [],
        statusKey: "status",
        statusMap: {
          "active": { label: "Alojado", variant: "blue" },
        },
      },
      {
        id: "crescimento",
        icon: "📈",
        label: "Crescimento",
        count: tab.crescimentos?.rows?.length,
        selectable: true,
        rowKey: "lote",
        batchActions: [
          { label: "Transferir p/ Engorda", icon: "🔄", variant: "primary", onClick: async (rows) => { await Promise.all(rows.map(r => updateAnimalBatch(r.id as number, { phase: "engorda" }))); refetchTabs(["crescimento", "engorda", "dashboard"]); showToast(`${rows.length} lotes transferidos!`, "success"); } },
        ],
        kpis: [
          { label: "Total Lotes", value: cresc.total ?? 0, icon: "📦", color: "oklch(0.94 0.04 230)", trend: "neutral" },
          { label: "Animais Alojados", value: cresc.animais_alojados ?? 0, icon: "🐷", color: "oklch(0.95 0.05 145)", trend: "up" },
          { label: "Peso Médio", value: cresc.peso_medio ? `${cresc.peso_medio} kg` : "—", icon: "⚖️", color: "oklch(0.97 0.04 80)", trend: "neutral" },
          { label: "GPD Médio", value: cresc.gpd_medio ? `${cresc.gpd_medio} kg` : "—", icon: "📊", color: "oklch(0.96 0.04 290)", trend: "up" },
          { label: "Próximos Engorda", value: cresc.proximos_engorda ?? 0, icon: "📈", color: "oklch(0.6 0.22 27)", trend: "up" },
        ],
        tabActions: [
          { label: "Registrar Pesagem", icon: "⚖️", color: "oklch(0.55 0.16 230)", desc: "Atualizar peso" },
          { label: "Registrar Consumo", icon: "🍽️", color: "oklch(0.55 0.16 145)", desc: "Consumo de ração" },
          { label: "Lançar Medicação", icon: "💊", color: "oklch(0.6 0.22 27)", desc: "Medicação" },
          { label: "Transferir", icon: "🔄", color: "oklch(0.78 0.15 85)", desc: "Para engorda" },
        ],
        tabAlerts: tab.crescimentos?.alerts || [],
        tabAiSuggestions: tab.crescimentos?.aiSuggestions || [],
        columns: [
          { key: "lote", label: "Lote" },
          { key: "entrada", label: "Entrada" },
          { key: "dias", label: "Dias" },
          { key: "qtd", label: "Qtd." },
          { key: "peso", label: "Peso (kg)", render: (v) => v != null ? `${v} kg` : "—" },
          { key: "gpd", label: "GPD (kg)", render: (v) => v != null ? `${v} kg` : "—" },
          { key: "previsao", label: "Prev. Engorda" },
        ],
        rows: tab.crescimentos?.rows || [],
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
        count: tab.engordas?.rows?.length,
        selectable: true,
        rowKey: "lote",
        batchActions: [
          { label: "Registrar Venda", icon: "💰", variant: "primary", onClick: async (rows) => { await Promise.all(rows.map(r => updateAnimalBatch(r.id as number, { status: "sold" }))); refetchTabs(["engorda", "dashboard"]); showToast(`Venda registrada para ${rows.length} lotes!`, "success"); } },
          { label: "Encerrar Lotes", icon: "🔒", variant: "danger", onClick: async (rows) => { await Promise.all(rows.map(r => updateAnimalBatch(r.id as number, { status: "finished" }))); refetchTabs(["engorda", "dashboard"]); showToast(`${rows.length} lotes encerrados.`, "success"); } },
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
        tabAlerts: tab.engordas?.alerts || [],
        tabAiSuggestions: tab.engordas?.aiSuggestions || [],
        columns: [
          { key: "lote", label: "Lote" },
          { key: "qtd", label: "Qtd." },
          { key: "dias", label: "Dias" },
          { key: "peso", label: "Peso (kg)", render: (v) => v != null ? `${v} kg` : "—" },
          { key: "gpd", label: "GPD (kg)", render: (v) => v != null ? `${v} kg` : "—" },
          { key: "previsao", label: "Prev. Venda" },
        ],
        rows: tab.engordas?.rows || [],
        statusKey: "status",
        statusMap: {
          "Pronto para venda": { label: "Pronto para Venda", variant: "green" },
          "Em engorda": { label: "Em Engorda", variant: "blue" },
        },
      },
    ],
  };

  return (
    <ReproducaoDashboard
      config={config}
      initialLoading={initialLoading}
      tabLoading={tabLoadingStates}
    />
  );
}
