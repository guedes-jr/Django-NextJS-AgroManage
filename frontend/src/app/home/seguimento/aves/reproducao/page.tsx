"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Eye } from "lucide-react";
import { ReproducaoDashboard, ReproducaoConfig } from "@/components/reproducao/ReproducaoDashboard";
import { getReproductionDashboard } from "@/services/livestockService";
import { useOrganizationLocale } from "@/lib/locale";

export default function AvesReproducaoPage() {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const { language, t } = useOrganizationLocale();
  const number = useMemo(() => new Intl.NumberFormat(language), [language]);
  const formatDate = useCallback((value: unknown) => {
    if (typeof value !== "string") return "—";
    const [day, month, year] = value.split("/").map(Number);
    if (!day || !month || !year) return value;
    return new Date(year, month - 1, day).toLocaleDateString(language);
  }, [language]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await getReproductionDashboard('aves');
        setDashboardData(data);
      } catch (error) {
        console.error("Failed to load reproduction dashboard", error);
      }
    };
    fetchData();
  }, []);

  const kpis = dashboardData?.kpis || {};
  const alerts = dashboardData?.alerts || [];
  const aiSuggestions = dashboardData?.aiSuggestions || [];

  const config: ReproducaoConfig = {
    especie: "aves",
    emoji: "🐔",
    titulo: t("sidebar.birds"),
    subtitulo: t("poultryReproduction.subtitle"),
    badgeColor: "oklch(0.97 0.04 80)",
    badgeTextColor: "oklch(0.5 0.14 75)",
    kpis: [
      { label: t("poultryReproduction.breederLots"), value: kpis.lotes !== undefined ? kpis.lotes : number.format(2500), icon: "🐔", color: "oklch(0.95 0.05 145)", trend: "neutral" },
      { label: t("poultryReproduction.dailyProduction"), value: number.format(1800), icon: "🥚", color: "oklch(0.97 0.04 80)", trend: "up" },
      { label: t("poultryReproduction.incubatedEggs"), value: kpis.ovos_incubados !== undefined ? kpis.ovos_incubados : number.format(4500), icon: "🌡️", color: "oklch(0.94 0.04 230)", trend: "up" },
      { label: t("poultryReproduction.averageHatch"), value: "88%", icon: "🐣", color: "oklch(0.96 0.04 290)", trend: "neutral" },
    ],
    flowSteps: [
      { icon: "🐔", label: t("poultryReproduction.breederLots"), count: 2500, color: "oklch(0.99 0.01 145)", borderColor: "oklch(0.95 0.05 145)" },
      { icon: "🥚", label: t("poultryReproduction.laying"), count: 1800, color: "oklch(0.99 0.01 80)", borderColor: "oklch(0.97 0.04 80)" },
      { icon: "🌡️", label: t("poultryReproduction.hatching"), count: 4500, color: "oklch(0.99 0.01 230)", borderColor: "oklch(0.94 0.04 230)" },
      { icon: "🐣", label: t("poultryReproduction.birth"), count: 3960, color: "oklch(0.99 0.01 290)", borderColor: "oklch(0.96 0.04 290)" },
      { icon: "🐥", label: t("poultryReproduction.growth"), count: 8000, color: "oklch(0.99 0.01 185)", borderColor: "oklch(0.95 0.04 185)" },
      { icon: "📦", label: t("poultryReproduction.slaughterSale"), count: 0, color: "var(--muted)", borderColor: "var(--border)" },
    ],
    alerts: alerts.length > 0 ? alerts : [
      { type: "warning", icon: "🌡️", text: t("poultryReproduction.incubationAlert"), time: t("poultryReproduction.today") },
      { type: "danger", icon: "📉", text: t("poultryReproduction.layingAlert"), time: t("poultryReproduction.hoursAgo", { count: 4 }) },
    ],
    activities: [
      { icon: "🥚", text: t("poultryReproduction.dailyCollection"), time: t("poultryReproduction.oneHourAgo"), type: "success" },
      { icon: "🌡️", text: t("poultryReproduction.hatcherTransfer"), time: t("poultryReproduction.hoursAgo", { count: 3 }), type: "info" },
      { icon: "🐣", text: t("poultryReproduction.hatchCompleted"), time: t("poultryReproduction.hoursAgo", { count: 6 }), type: "success" },
      { icon: "📉", text: t("poultryReproduction.layingAlert"), time: t("poultryReproduction.hoursAgo", { count: 8 }), type: "warning" },
      { icon: "🐔", text: t("poultryReproduction.newBreederLot"), time: t("poultryReproduction.yesterday"), type: "system" },
      { icon: "💉", text: t("poultryReproduction.vaccinationCompleted"), time: t("poultryReproduction.yesterday"), type: "info" },
    ],
    aiSuggestions: aiSuggestions.length > 0 ? aiSuggestions : [
      { text: t("poultryReproduction.aiSuggestion") },
    ],
    tabs: [
      {
        id: "matrizes",
        icon: "🐔",
        label: t("poultryReproduction.breederLots"),
        count: 2500,
        primaryActionLabel: t("poultryReproduction.housing"),
        primaryActionModalFields: [
          { name: "galpao", label: t("poultryReproduction.shed"), type: "text", required: true },
          { name: "data", label: t("poultryReproduction.housingDate"), type: "date", required: true },
          { name: "qtd", label: t("poultryReproduction.quantity"), type: "number" },
          { name: "linhagem", label: t("poultryReproduction.lineage"), type: "text" },
        ],
        columns: [
          { key: "lote", label: t("poultryReproduction.shedBatch"), render: (v) => <span className="repro-table-id">{String(v)}</span> },
          { key: "idade", label: t("poultryReproduction.ageWeeks") },
          { key: "qtd", label: t("poultryReproduction.quantity") },
          { key: "mortalidade", label: t("poultryReproduction.mortality") },
        ],
        actions: [
          {
            label: t("poultryReproduction.technicalSheet"),
            icon: <Eye size={16} />,
            variant: "secondary",
            type: 'technical_sheet',
          } as any
        ],
        rows: [
          { lote: "Galpão 1", idade: 45, qtd: 1200, mortalidade: "2%", status: "Produção" },
          { lote: "Galpão 2", idade: 28, qtd: 1300, mortalidade: "1.5%", status: "Produção" },
        ],
        statusKey: "status",
        statusMap: {
          "Produção": { label: t("poultryReproduction.layingStatus"), variant: "green" },
        },
      },
      {
        id: "postura",
        icon: "🥚",
        label: t("poultryReproduction.dailyCollectionTab"),
        primaryActionLabel: t("poultryReproduction.registerCollection"),
        primaryActionModalFields: [
          { name: "galpao", label: t("poultryReproduction.shed"), type: "text", required: true },
          { name: "data", label: t("poultryReproduction.date"), type: "date", required: true },
          { name: "incubaveis", label: t("poultryReproduction.incubatableEggs"), type: "number" },
          { name: "comerciais", label: t("poultryReproduction.commercialEggs"), type: "number" },
          { name: "descarte", label: t("poultryReproduction.discard"), type: "number" },
        ],
        columns: [
          { key: "data", label: t("poultryReproduction.date"), render: formatDate },
          { key: "galpao", label: t("poultryReproduction.shed") },
          { key: "total", label: t("poultryReproduction.totalEggs") },
          { key: "incubaveis", label: t("poultryReproduction.incubatablePercent") },
        ],
        actions: [
          {
            label: t("poultryReproduction.technicalSheet"),
            icon: <Eye size={16} />,
            variant: "secondary",
            type: 'technical_sheet',
          } as any
        ],
        rows: [
          { data: "12/05/2026", galpao: "Galpão 1", total: 1080, incubaveis: "95%", status: "Coletado" },
          { data: "12/05/2026", galpao: "Galpão 2", total: 1220, incubaveis: "96%", status: "Coletado" },
        ],
        statusKey: "status",
        statusMap: {
          "Coletado": { label: t("poultryReproduction.completed"), variant: "gray" },
        },
      },
      {
        id: "incubacao",
        icon: "🌡️",
        label: t("poultryReproduction.hatching"),
        count: 4500,
        primaryActionLabel: t("poultryReproduction.newLoad"),
        primaryActionModalFields: [
          { name: "maquina", label: t("poultryReproduction.incubator"), type: "text", required: true },
          { name: "data", label: t("poultryReproduction.loadingDate"), type: "date", required: true },
          { name: "qtd", label: t("poultryReproduction.eggQuantity"), type: "number" },
        ],
        columns: [
          { key: "lote", label: t("poultryReproduction.incubatorBatch"), render: (v) => <span className="repro-table-id">{String(v)}</span> },
          { key: "data", label: t("poultryReproduction.loading"), render: formatDate },
          { key: "qtd", label: t("poultryReproduction.eggQuantity") },
          { key: "dias", label: t("poultryReproduction.days") },
          { key: "previsao", label: t("poultryReproduction.expectedHatch"), render: formatDate },
        ],
        actions: [
          {
            label: t("poultryReproduction.technicalSheet"),
            icon: <Eye size={16} />,
            variant: "secondary",
            type: 'technical_sheet',
          } as any
        ],
        rows: [
          { lote: "I-45", data: "22/04/2026", qtd: 2000, dias: 20, previsao: "13/05/2026", status: "Transferência" },
          { lote: "I-46", data: "29/04/2026", qtd: 2500, dias: 13, previsao: "20/05/2026", status: "Incubadora" },
        ],
        statusKey: "status",
        statusMap: {
          "Transferência": { label: t("poultryReproduction.hatcher"), variant: "amber" },
          "Incubadora": { label: t("poultryReproduction.incubator"), variant: "blue" },
        },
      },
      {
        id: "nascimento",
        icon: "🐣",
        label: t("poultryReproduction.birth"),
        columns: [
          { key: "lote", label: t("poultryReproduction.sourceBatch") },
          { key: "data", label: t("poultryReproduction.hatchDate"), render: formatDate },
          { key: "pintos", label: t("poultryReproduction.liveChicks") },
          { key: "eclosao", label: t("poultryReproduction.hatchRate") },
        ],
        actions: [
          {
            label: t("poultryReproduction.technicalSheet"),
            icon: <Eye size={16} />,
            variant: "secondary",
            type: 'technical_sheet',
          } as any
        ],
        rows: [
          { lote: "I-44", data: "06/05/2026", pintos: 1780, eclosao: "89%", status: "Alojado" },
        ],
        statusKey: "status",
        statusMap: {
          "Alojado": { label: t("poultryReproduction.sentToGrowth"), variant: "green" },
        },
      },
      {
        id: "crescimento",
        icon: "🐥",
        label: t("poultryReproduction.growth"),
        count: 8000,
        columns: [
          { key: "galpao", label: t("poultryReproduction.shed") },
          { key: "idade", label: t("poultryReproduction.days") },
          { key: "qtd", label: t("poultryReproduction.currentQuantity") },
          { key: "peso", label: t("poultryReproduction.averageWeight") },
        ],
        actions: [
          {
            label: t("poultryReproduction.technicalSheet"),
            icon: <Eye size={16} />,
            variant: "secondary",
            type: 'technical_sheet',
          } as any
        ],
        rows: [
          { galpao: "G-Cresc 1", idade: 21, qtd: 4000, peso: "850g", status: "Dentro da Curva" },
          { galpao: "G-Cresc 2", idade: 7, qtd: 4000, peso: "180g", status: "Dentro da Curva" },
        ],
        statusKey: "status",
        statusMap: {
          "Dentro da Curva": { label: t("poultryReproduction.onTrack"), variant: "green" },
        },
      },
    ]
  };

  return <ReproducaoDashboard config={config} />;
}
