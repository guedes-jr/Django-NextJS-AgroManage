"use client";

import { useEffect, useState } from "react";
import { ReproducaoDashboard, ReproducaoConfig } from "@/components/reproducao/ReproducaoDashboard";
import { Package } from "lucide-react";
import { getReproductionDashboard } from "@/services/livestockService";

export default function SuinosReproducaoPage() {
  const [dashboardData, setDashboardData] = useState<any>(null);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await getReproductionDashboard('suinos');
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
    especie: "suinos",
    emoji: "🐷",
    titulo: "Suínos",
    subtitulo: "Módulo de gestão reprodutiva do plantel suíno.",
    badgeColor: "oklch(0.95 0.05 145)",
    badgeTextColor: "oklch(0.45 0.15 145)",
    kpis: [
      { label: "Marrãs", value: kpis.marras !== undefined ? kpis.marras : 12, icon: "🐖", color: "oklch(0.95 0.05 145)", trend: "up" },
      { label: "Matrizes ativas", value: kpis.matrizes_ativas !== undefined ? kpis.matrizes_ativas : 45, icon: "👩‍🍼", color: "oklch(0.94 0.04 230)", trend: "neutral" },
      { label: "Gestantes", value: kpis.gestantes !== undefined ? kpis.gestantes : 28, icon: "🤰", color: "oklch(0.97 0.04 80)", trend: "up" },
      { label: "Leitões (mês)", value: kpis.nascidos_mes !== undefined ? kpis.nascidos_mes : 156, icon: "🍼", color: "oklch(0.96 0.04 290)", trend: "up" },
      { label: "Tx. Prenhez", value: kpis.tx_prenhez !== undefined ? kpis.tx_prenhez : "92%", icon: "🎯", color: "var(--muted)", trend: "neutral" },
    ],
    flowSteps: [
      { icon: "🐖", label: "Marrãs", count: 12, color: "oklch(0.99 0.01 145)", borderColor: "oklch(0.95 0.05 145)" },
      { icon: "👩‍🍼", label: "Matrizes", count: 45, color: "oklch(0.99 0.01 230)", borderColor: "oklch(0.94 0.04 230)" },
      { icon: "🤰", label: "Gestação", count: 28, color: "oklch(0.99 0.01 80)", borderColor: "oklch(0.97 0.04 80)" },
      { icon: "🍼", label: "Maternidade", count: 156, color: "oklch(0.99 0.01 290)", borderColor: "oklch(0.96 0.04 290)" },
      { icon: "🐷", label: "Creche", count: 210, color: "oklch(0.99 0.01 185)", borderColor: "oklch(0.95 0.04 185)" },
      { icon: "📈", label: "Crescimento", count: 185, color: "var(--muted)", borderColor: "var(--border)" },
      { icon: "⚖️", label: "Engorda", count: 140, color: "var(--muted)", borderColor: "var(--border)" },
    ],
    alerts: alerts.length > 0 ? alerts : [
      { type: "danger", icon: "⚠️", text: "Matriz M-045 com dias abertos acima do limite (32 dias).", time: "Há 2 horas" },
      { type: "warning", icon: "⏰", text: "Previsão de 5 partos para os próximos 3 dias.", time: "Hoje" },
      { type: "info", icon: "💉", text: "Vacinação do lote L-102 (Creche) pendente.", time: "Ontem" },
    ],
    aiSuggestions: aiSuggestions.length > 0 ? aiSuggestions : [
      { text: "A matriz M-012 apresentou repetição de cio. Sugere-se avaliação veterinária." },
      { text: "O lote de engorda L-088 atingiu o peso alvo (115kg). Considere planejar a venda." },
    ],
    tabs: [
      {
        id: "marras",
        icon: "🐖",
        label: "Marrãs",
        count: 12,
        primaryActionLabel: "Nova Marrã",
        primaryActionModalFields: [
          { name: "brinco", label: "Brinco/ID", type: "text", required: true },
          { name: "data_entrada", label: "Data de Entrada", type: "date", required: true },
          { name: "peso", label: "Peso Inicial (kg)", type: "number" },
          { name: "linhagem", label: "Linhagem", type: "text" },
        ],
        columns: [
          { key: "id", label: "Brinco", render: (v) => <span className="repro-table-id">{String(v)}</span> },
          { key: "idade", label: "Idade (dias)" },
          { key: "peso", label: "Peso (kg)" },
          { key: "entrada", label: "Entrada" },
        ],
        rows: [
          { id: "M-101", idade: 150, peso: 90, entrada: "10/04/2026", status: "Em preparo" },
          { id: "M-102", idade: 165, peso: 105, entrada: "25/03/2026", status: "Pronta" },
          { id: "M-103", idade: 140, peso: 85, entrada: "20/04/2026", status: "Em preparo" },
        ],
        statusKey: "status",
        statusMap: {
          "Pronta": { label: "Pronta para Cobertura", variant: "green" },
          "Em preparo": { label: "Em Preparo", variant: "amber" },
        },
      },
      {
        id: "matrizes",
        icon: "👩‍🍼",
        label: "Matrizes",
        count: 45,
        primaryActionLabel: "Registrar Cobertura",
        primaryActionModalFields: [
          { name: "matriz", label: "Matriz (Brinco)", type: "text", required: true },
          { name: "data_cobertura", label: "Data da Cobertura", type: "date", required: true },
          { name: "tipo", label: "Tipo", type: "select", options: [{ value: "IA", label: "Inseminação Artificial" }, { value: "MN", label: "Monta Natural" }] },
          { name: "reprodutor", label: "Reprodutor / Dose", type: "text" },
        ],
        columns: [
          { key: "id", label: "Brinco", render: (v) => <span className="repro-table-id">{String(v)}</span> },
          { key: "op", label: "Ordem de Parto" },
          { key: "dias_abertos", label: "Dias Abertos" },
          { key: "ultima_cobertura", label: "Última Cobertura" },
        ],
        rows: [
          { id: "F-045", op: 3, dias_abertos: 32, ultima_cobertura: "—", status: "Vazia" },
          { id: "F-012", op: 5, dias_abertos: 15, ultima_cobertura: "28/04/2026", status: "Coberta" },
          { id: "F-077", op: 1, dias_abertos: 5, ultima_cobertura: "—", status: "Vazia" },
        ],
        statusKey: "status",
        statusMap: {
          "Vazia": { label: "Vazia", variant: "gray" },
          "Coberta": { label: "Coberta", variant: "blue" },
        },
      },
      {
        id: "gestacao",
        icon: "🤰",
        label: "Gestação",
        count: 28,
        columns: [
          { key: "id", label: "Brinco", render: (v) => <span className="repro-table-id">{String(v)}</span> },
          { key: "cobertura", label: "Data Cobertura" },
          { key: "dias", label: "Dias Gestação" },
          { key: "previsao", label: "Previsão Parto" },
        ],
        rows: [
          { id: "F-022", cobertura: "15/01/2026", dias: 112, previsao: "10/05/2026", status: "Parto próximo" },
          { id: "F-034", cobertura: "10/02/2026", dias: 86, previsao: "05/06/2026", status: "Confirmada" },
        ],
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
        count: 14,
        columns: [
          { key: "matriz", label: "Matriz" },
          { key: "parto", label: "Data Parto" },
          { key: "nascidos", label: "Vivos" },
          { key: "mortos", label: "Mortos" },
          { key: "idade", label: "Idade (dias)" },
        ],
        rows: [
          { matriz: "F-088", parto: "28/04/2026", nascidos: 12, mortos: 1, idade: 14, status: "Lactação" },
          { matriz: "F-091", parto: "05/05/2026", nascidos: 14, mortos: 0, idade: 7, status: "Lactação" },
        ],
        statusKey: "status",
        statusMap: {
          "Lactação": { label: "Em Lactação", variant: "purple" },
        },
      },
      {
        id: "creche",
        icon: "🐷",
        label: "Creche",
        count: 5,
        columns: [
          { key: "lote", label: "Lote" },
          { key: "entrada", label: "Entrada" },
          { key: "qtd", label: "Qtd. Atual" },
          { key: "peso", label: "Peso Médio" },
        ],
        rows: [
          { lote: "L-101", entrada: "10/04/2026", qtd: 45, peso: "15 kg", status: "Alojado" },
          { lote: "L-102", entrada: "25/04/2026", qtd: 52, peso: "8 kg", status: "Alojado" },
        ],
        statusKey: "status",
        statusMap: {
          "Alojado": { label: "Alojado", variant: "blue" },
        },
      },
      {
        id: "crescimento",
        icon: "📈",
        label: "Crescimento",
        count: 4,
        columns: [
          { key: "lote", label: "Lote" },
          { key: "entrada", label: "Entrada" },
          { key: "qtd", label: "Qtd. Atual" },
          { key: "ca", label: "C.A." },
        ],
        rows: [
          { lote: "L-095", entrada: "01/03/2026", qtd: 42, ca: "2.1", status: "Em ganho" },
        ],
        statusKey: "status",
        statusMap: {
          "Em ganho": { label: "Em Crescimento", variant: "teal" },
        },
      },
      {
        id: "engorda",
        icon: "⚖️",
        label: "Engorda",
        count: 3,
        columns: [
          { key: "lote", label: "Lote" },
          { key: "qtd", label: "Qtd." },
          { key: "peso", label: "Peso Atual" },
          { key: "previsao", label: "Prev. Venda" },
        ],
        rows: [
          { lote: "L-088", qtd: 40, peso: "115 kg", previsao: "20/05/2026", status: "Pronto" },
        ],
        statusKey: "status",
        statusMap: {
          "Pronto": { label: "Pronto para Venda", variant: "green" },
        },
      },
    ]
  };

  return <ReproducaoDashboard config={config} />;
}
