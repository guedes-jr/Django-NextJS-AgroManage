"use client";

import { useEffect, useState } from "react";
import { ReproducaoDashboard, ReproducaoConfig } from "@/components/reproducao/ReproducaoDashboard";
import { getReproductionDashboard } from "@/services/livestockService";

export default function AvesReproducaoPage() {
  const [dashboardData, setDashboardData] = useState<any>(null);

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
    titulo: "Aves",
    subtitulo: "Módulo de gestão de postura e incubação de aves.",
    badgeColor: "oklch(0.97 0.04 80)",
    badgeTextColor: "oklch(0.5 0.14 75)",
    kpis: [
      { label: "Matrizes (Lotes)", value: kpis.lotes !== undefined ? kpis.lotes : "2.5k", icon: "🐔", color: "oklch(0.95 0.05 145)", trend: "neutral" },
      { label: "Produção Diária", value: "1.8k", icon: "🥚", color: "oklch(0.97 0.04 80)", trend: "up" },
      { label: "Ovos Incubados", value: kpis.ovos_incubados !== undefined ? kpis.ovos_incubados : "4.5k", icon: "🌡️", color: "oklch(0.94 0.04 230)", trend: "up" },
      { label: "Eclosão Média", value: "88%", icon: "🐣", color: "oklch(0.96 0.04 290)", trend: "neutral" },
    ],
    flowSteps: [
      { icon: "🐔", label: "Matrizes", count: 2500, color: "oklch(0.99 0.01 145)", borderColor: "oklch(0.95 0.05 145)" },
      { icon: "🥚", label: "Postura", count: 1800, color: "oklch(0.99 0.01 80)", borderColor: "oklch(0.97 0.04 80)" },
      { icon: "🌡️", label: "Incubação", count: 4500, color: "oklch(0.99 0.01 230)", borderColor: "oklch(0.94 0.04 230)" },
      { icon: "🐣", label: "Nascimento", count: 3960, color: "oklch(0.99 0.01 290)", borderColor: "oklch(0.96 0.04 290)" },
      { icon: "🐥", label: "Crescimento", count: 8000, color: "oklch(0.99 0.01 185)", borderColor: "oklch(0.95 0.04 185)" },
      { icon: "📦", label: "Abate/Venda", count: 0, color: "var(--muted)", borderColor: "var(--border)" },
    ],
    alerts: alerts.length > 0 ? alerts : [
      { type: "warning", icon: "🌡️", text: "Lote de incubação I-45 atinge 21 dias amanhã.", time: "Hoje" },
      { type: "danger", icon: "📉", text: "Queda de postura no galpão 2 detectada (-5%).", time: "Há 4 horas" },
    ],
    activities: [
      { icon: "🥚", text: "Coleta diária Galpão 1 — 1.080 ovos (95% incubáveis)", time: "Há 1 h", type: "success" },
      { icon: "🌡️", text: "Incubadora I-45 — transferência para nacedouro", time: "Há 3 h", type: "info" },
      { icon: "🐣", text: "Eclosão I-44 concluída — 1.780 pintos alojados", time: "Há 6 h", type: "success" },
      { icon: "📉", text: "Queda de postura no Galpão 2 detectada (-5%)", time: "Há 8 h", type: "warning" },
      { icon: "🐔", text: "Novo lote de matrizes alojado no Galpão 3", time: "Ontem", type: "system" },
      { icon: "💉", text: "Vacinação do lote Crescimento 1 concluída", time: "Ontem", type: "info" },
    ],
    aiSuggestions: aiSuggestions.length > 0 ? aiSuggestions : [
      { text: "A taxa de eclosão do lote I-42 foi de 84%. Analisar temperatura das incubadoras na semana 2." },
    ],
    tabs: [
      {
        id: "matrizes",
        icon: "🐔",
        label: "Matrizes",
        count: 2500,
        primaryActionLabel: "Alojamento",
        primaryActionModalFields: [
          { name: "galpao", label: "Galpão", type: "text", required: true },
          { name: "data", label: "Data Alojamento", type: "date", required: true },
          { name: "qtd", label: "Quantidade", type: "number" },
          { name: "linhagem", label: "Linhagem", type: "text" },
        ],
        columns: [
          { key: "lote", label: "Galpão/Lote", render: (v) => <span className="repro-table-id">{String(v)}</span> },
          { key: "idade", label: "Idade (semanas)" },
          { key: "qtd", label: "Quantidade" },
          { key: "mortalidade", label: "Mortalidade" },
        ],
        rows: [
          { lote: "Galpão 1", idade: 45, qtd: 1200, mortalidade: "2%", status: "Produção" },
          { lote: "Galpão 2", idade: 28, qtd: 1300, mortalidade: "1.5%", status: "Produção" },
        ],
        statusKey: "status",
        statusMap: {
          "Produção": { label: "Em Postura", variant: "green" },
        },
      },
      {
        id: "postura",
        icon: "🥚",
        label: "Coleta Diária",
        primaryActionLabel: "Registrar Coleta",
        primaryActionModalFields: [
          { name: "galpao", label: "Galpão", type: "text", required: true },
          { name: "data", label: "Data", type: "date", required: true },
          { name: "incubaveis", label: "Ovos Incubáveis", type: "number" },
          { name: "comerciais", label: "Ovos Comerciais", type: "number" },
          { name: "descarte", label: "Descarte", type: "number" },
        ],
        columns: [
          { key: "data", label: "Data" },
          { key: "galpao", label: "Galpão" },
          { key: "total", label: "Total Ovos" },
          { key: "incubaveis", label: "Incubáveis (%)" },
        ],
        rows: [
          { data: "12/05/2026", galpao: "Galpão 1", total: 1080, incubaveis: "95%", status: "Coletado" },
          { data: "12/05/2026", galpao: "Galpão 2", total: 1220, incubaveis: "96%", status: "Coletado" },
        ],
        statusKey: "status",
        statusMap: {
          "Coletado": { label: "Finalizado", variant: "gray" },
        },
      },
      {
        id: "incubacao",
        icon: "🌡️",
        label: "Incubação",
        count: 4500,
        primaryActionLabel: "Nova Carga",
        primaryActionModalFields: [
          { name: "maquina", label: "Incubadora", type: "text", required: true },
          { name: "data", label: "Data Carregamento", type: "date", required: true },
          { name: "qtd", label: "Qtd. Ovos", type: "number" },
        ],
        columns: [
          { key: "lote", label: "Lote Inc.", render: (v) => <span className="repro-table-id">{String(v)}</span> },
          { key: "data", label: "Data Carga" },
          { key: "qtd", label: "Qtd. Ovos" },
          { key: "dias", label: "Dias" },
          { key: "previsao", label: "Prev. Eclosão" },
        ],
        rows: [
          { lote: "I-45", data: "22/04/2026", qtd: 2000, dias: 20, previsao: "13/05/2026", status: "Transferência" },
          { lote: "I-46", data: "29/04/2026", qtd: 2500, dias: 13, previsao: "20/05/2026", status: "Incubadora" },
        ],
        statusKey: "status",
        statusMap: {
          "Transferência": { label: "Nacedouro", variant: "amber" },
          "Incubadora": { label: "Incubadora", variant: "blue" },
        },
      },
      {
        id: "nascimento",
        icon: "🐣",
        label: "Nascimento",
        columns: [
          { key: "lote", label: "Lote Origem" },
          { key: "data", label: "Data Eclosão" },
          { key: "pintos", label: "Pintinhos (vivos)" },
          { key: "eclosao", label: "Eclosão (%)" },
        ],
        rows: [
          { lote: "I-44", data: "06/05/2026", pintos: 1780, eclosao: "89%", status: "Alojado" },
        ],
        statusKey: "status",
        statusMap: {
          "Alojado": { label: "Enviado Crescimento", variant: "green" },
        },
      },
      {
        id: "crescimento",
        icon: "🐥",
        label: "Crescimento",
        count: 8000,
        columns: [
          { key: "galpao", label: "Galpão" },
          { key: "idade", label: "Idade (dias)" },
          { key: "qtd", label: "Qtd. Atual" },
          { key: "peso", label: "Peso Médio" },
        ],
        rows: [
          { galpao: "G-Cresc 1", idade: 21, qtd: 4000, peso: "850g", status: "Dentro da Curva" },
          { galpao: "G-Cresc 2", idade: 7, qtd: 4000, peso: "180g", status: "Dentro da Curva" },
        ],
        statusKey: "status",
        statusMap: {
          "Dentro da Curva": { label: "OK", variant: "green" },
        },
      },
    ]
  };

  return <ReproducaoDashboard config={config} />;
}
