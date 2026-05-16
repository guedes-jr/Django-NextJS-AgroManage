"use client";

import { useEffect, useState } from "react";
import { ReproducaoDashboard, ReproducaoConfig } from "@/components/reproducao/ReproducaoDashboard";
import { getReproductionDashboard } from "@/services/livestockService";

export default function BovinosReproducaoPage() {
  const formatDateCell = (v: any) => {
    if (!v) return "—";
    const str = String(v);
    if (str.includes("T")) return new Date(str).toLocaleDateString("pt-BR");
    const parts = str.split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : str;
  };

  const [dashboardData, setDashboardData] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await getReproductionDashboard('bovinos');
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
    especie: "bovinos",
    emoji: "🐄",
    titulo: "Bovinos",
    subtitulo: "Módulo de gestão reprodutiva do rebanho bovino.",
    badgeColor: "oklch(0.95 0.04 230)",
    badgeTextColor: "oklch(0.45 0.15 230)",
    kpis: [
      { label: "Vacas / Novilhas", value: kpis.matrizes_ativas !== undefined ? (kpis.matrizes_ativas + (kpis.marras || 0)) : 120, icon: "🐄", color: "oklch(0.95 0.04 230)", trend: "neutral" },
      { label: "Gestantes", value: kpis.gestantes !== undefined ? kpis.gestantes : 65, icon: "🤰", color: "oklch(0.97 0.04 80)", trend: "up" },
      { label: "Bezerras/os (mês)", value: kpis.nascidos_mes !== undefined ? kpis.nascidos_mes : 48, icon: "🍼", color: "oklch(0.96 0.04 290)", trend: "up" },
      { label: "Tx. Prenhez", value: kpis.tx_prenhez !== undefined ? kpis.tx_prenhez : "85%", icon: "🎯", color: "var(--muted)", trend: "neutral" },
      { label: "Touros", value: 4, icon: "🐂", color: "oklch(0.95 0.05 145)", trend: "neutral" },
    ],
    flowSteps: [
      { icon: "🐄", label: "Vacas", count: 120, color: "oklch(0.99 0.01 230)", borderColor: "oklch(0.95 0.04 230)" },
      { icon: "💉", label: "Cobertura", count: 15, color: "oklch(0.99 0.01 145)", borderColor: "oklch(0.95 0.05 145)" },
      { icon: "🤰", label: "Gestação", count: 65, color: "oklch(0.99 0.01 80)", borderColor: "oklch(0.97 0.04 80)" },
      { icon: "🍼", label: "Cria", count: 48, color: "oklch(0.99 0.01 290)", borderColor: "oklch(0.96 0.04 290)" },
      { icon: "🐂", label: "Recria", count: 85, color: "oklch(0.99 0.01 185)", borderColor: "oklch(0.95 0.04 185)" },
      { icon: "⚖️", label: "Terminação", count: 40, color: "var(--muted)", borderColor: "var(--border)" },
    ],
    alerts: alerts.length > 0 ? alerts : [
      { type: "danger", icon: "⚠️", text: "Vaca V-210 com atraso de diagnóstico de prenhez.", time: "Há 1 dia" },
      { type: "warning", icon: "⏰", text: "Previsão de 3 partos na próxima semana.", time: "Hoje" },
    ],
    activities: [
      { icon: "🐄", text: "Nova novilha V-311 cadastrada no plantel", time: "Há 30 min", type: "success" },
      { icon: "💉", text: "IATF realizada no Lote IATF 02 — 45 vacas", time: "Há 3 h", type: "info" },
      { icon: "🍼", text: "Parto registrado — Vaca V-101, bezerro B-2603", time: "Há 5 h", type: "success" },
      { icon: "⚠️", text: "Vaca V-210 com atraso no diagnóstico de prenhez", time: "Há 8 h", type: "warning" },
      { icon: "⚖️", text: "Lote Confinamento pesado — média 495 kg", time: "Ontem", type: "system" },
      { icon: "📋", text: "Protocolo sanitário aplicado no lote Recria-25", time: "Ontem", type: "info" },
    ],
    aiSuggestions: aiSuggestions.length > 0 ? aiSuggestions : [
      { text: "A vaca V-055 está com mais de 90 dias abertos. Considere protocolo de IATF." },
      { text: "O lote de terminação T-01 atingiu peso médio de 18@. Boa janela para cotação." },
    ],
    tabs: [
      {
        id: "vacas",
        icon: "🐄",
        label: "Vacas / Novilhas",
        count: 120,
        primaryActionLabel: "Nova Fêmea",
        primaryActionModalFields: [
          { name: "brinco", label: "Brinco/ID", type: "text", required: true },
          { name: "categoria", label: "Categoria", type: "select", options: [{value: "Novilha", label: "Novilha"}, {value: "Vaca", label: "Vaca"}] },
          { name: "peso", label: "Peso Inicial", type: "number" },
        ],
        columns: [
          { key: "id", label: "Brinco", render: (v) => <span className="repro-table-id">{String(v)}</span> },
          { key: "categoria", label: "Categoria" },
          { key: "dias_lactacao", label: "Dias em Lactação" },
          { key: "dias_abertos", label: "Dias Abertos" },
        ],
        rows: [
          { id: "V-210", categoria: "Vaca", dias_lactacao: 150, dias_abertos: 95, status: "Vazia" },
          { id: "V-305", categoria: "Novilha", dias_lactacao: 0, dias_abertos: 0, status: "Pronta" },
          { id: "V-112", categoria: "Vaca", dias_lactacao: 210, dias_abertos: 0, status: "Gestante" },
        ],
        statusKey: "status",
        statusMap: {
          "Vazia": { label: "Vazia", variant: "gray" },
          "Pronta": { label: "Pronta para Serviço", variant: "green" },
          "Gestante": { label: "Gestante", variant: "blue" },
        },
      },
      {
        id: "cobertura",
        icon: "💉",
        label: "Cobertura / IATF",
        count: 15,
        primaryActionLabel: "Registrar IATF",
        primaryActionModalFields: [
          { name: "lote", label: "Lote de IATF", type: "text", required: true },
          { name: "data", label: "Data D0", type: "date", required: true },
          { name: "touro", label: "Touro / Sêmen", type: "text" },
        ],
        columns: [
          { key: "id", label: "Vaca/Lote", render: (v) => <span className="repro-table-id">{String(v)}</span> },
          { key: "data", label: "Data", render: formatDateCell },
          { key: "tipo", label: "Tipo" },
          { key: "touro", label: "Reprodutor" },
        ],
        rows: [
          { id: "Lote IATF 01", data: "05/05/2026", tipo: "IATF", touro: "Nelore XPTO", status: "Aguardando DG" },
          { id: "V-150", data: "10/05/2026", tipo: "Monta Natural", touro: "T-01", status: "Aguardando DG" },
        ],
        statusKey: "status",
        statusMap: {
          "Aguardando DG": { label: "Aguardando DG", variant: "amber" },
        },
      },
      {
        id: "gestacao",
        icon: "🤰",
        label: "Gestação",
        count: 65,
        columns: [
          { key: "id", label: "Vaca", render: (v) => <span className="repro-table-id">{String(v)}</span> },
          { key: "data", label: "Data Cobertura", render: formatDateCell },
          { key: "dias", label: "Dias Gestação" },
          { key: "previsao", label: "Previsão Parto", render: formatDateCell },
        ],
        rows: [
          { id: "V-112", data: "15/08/2025", dias: 270, previsao: "25/05/2026", status: "Seca / Parto Próximo" },
          { id: "V-090", data: "10/12/2025", dias: 153, previsao: "19/09/2026", status: "Lactante e Gestante" },
        ],
        statusKey: "status",
        statusMap: {
          "Seca / Parto Próximo": { label: "Pré-parto (Seca)", variant: "amber" },
          "Lactante e Gestante": { label: "Gestante e Lactante", variant: "purple" },
        },
      },
      {
        id: "maternidade",
        icon: "🍼",
        label: "Maternidade / Cria",
        count: 48,
        columns: [
          { key: "id", label: "Bezerro(a)", render: (v) => <span className="repro-table-id">{String(v)}</span> },
          { key: "mae", label: "Mãe" },
          { key: "nasc", label: "Nascimento", render: formatDateCell },
          { key: "peso", label: "Peso Nasc." },
        ],
        rows: [
          { id: "B-2601", mae: "V-101", nasc: "01/05/2026", peso: "32 kg", status: "Ao pé da vaca" },
          { id: "B-2602", mae: "V-088", nasc: "03/05/2026", peso: "35 kg", status: "Ao pé da vaca" },
        ],
        statusKey: "status",
        statusMap: {
          "Ao pé da vaca": { label: "Cria", variant: "blue" },
        },
      },
      {
        id: "recria",
        icon: "🐂",
        label: "Recria",
        count: 85,
        columns: [
          { key: "lote", label: "Lote" },
          { key: "idade", label: "Idade Média" },
          { key: "qtd", label: "Qtd. Atual" },
          { key: "peso", label: "Peso Médio" },
        ],
        rows: [
          { lote: "L-Recria-25", idade: "12 meses", qtd: 45, peso: "210 kg", status: "Pasto" },
        ],
        statusKey: "status",
        statusMap: {
          "Pasto": { label: "A Pasto", variant: "green" },
        },
      },
      {
        id: "terminacao",
        icon: "⚖️",
        label: "Terminação",
        count: 40,
        columns: [
          { key: "lote", label: "Lote" },
          { key: "sistema", label: "Sistema" },
          { key: "qtd", label: "Qtd." },
          { key: "peso", label: "Peso / Arroba" },
        ],
        rows: [
          { lote: "L-Confinamento", sistema: "Confinamento", qtd: 40, peso: "495 kg (16.5@)", status: "Engorda" },
        ],
        statusKey: "status",
        statusMap: {
          "Engorda": { label: "Em Terminação", variant: "amber" },
        },
      },
    ]
  };

  return <ReproducaoDashboard config={config} />;
}
