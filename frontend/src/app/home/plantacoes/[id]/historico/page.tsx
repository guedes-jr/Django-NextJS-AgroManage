"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { jsPDF } from "jspdf";
import {
  ArrowLeft,
  Beaker,
  Check,
  ClipboardCheck,
  Download,
  Droplets,
  Eye,
  FileText,
  FlaskConical,
  Info,
  Leaf,
  Link,
  Send,
  Settings,
  Sprout,
  Tractor,
  Users,
  Wheat,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cropService } from "@/services/cropService";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

type Plantation = {
  id: string;
  name?: string;
  crop_name?: string;
  field_name?: string;
  farm_name?: string;
  planting_date?: string;
  expected_harvest_date?: string | null;
  actual_harvest_date?: string | null;
  status_display?: string;
  planted_area_ha?: string | number | null;
  investment_total?: string | number | null;
  cost_per_ha?: string | number | null;
  real_profit?: string | number | null;
};

type ApiList<T> = T[] | { results?: T[] };
type BaseRecord = { id: string; created_at?: string; notes?: string | null };
type LandPreparation = BaseRecord & { date?: string | null; operation_type_display?: string | null; execution_type_display?: string | null; tractor_name?: string | null; hours_worked?: string | number | null; total_price?: string | number | null; total_amount?: string | number | null; operator?: string | null };
type Planting = BaseRecord & { planting_date?: string | null; item_name?: string | null; quantity?: string | number | null; unit?: string | null; total_price?: string | number | null; operator?: string | null };
type Application = BaseRecord & { application_date?: string | null; item_name?: string | null; quantity?: string | number | null; unit?: string | null; dose_per_ha?: string | number | null; total_price?: string | number | null; application_method_display?: string | null; pesticide_type_display?: string | null; target?: string | null; operator?: string | null };
type Irrigation = BaseRecord & { date?: string | null; start_date?: string | null; end_date?: string | null; irrigation_system_display?: string | null; pump_name?: string | null; operating_days?: number | null; hours?: string | number | null; liters_used?: string | number | null; energy_cost?: string | number | null; operator?: string | null };
type SoilAnalysis = BaseRecord & { original_name?: string | null; uploaded_by_name?: string | null };
type Recommendation = BaseRecord & { title?: string | null; objective?: string | null; recommendation_date?: string | null; suggested_application_date?: string | null; priority_display?: string | null; status_display?: string | null };
type LaborRecord = BaseRecord & { worker_name?: string | null; activity_type_display?: string | null; activity_date?: string | null; daily_quantity?: string | number | null; total_amount?: string | number | null };
type Harvest = BaseRecord & { harvest_date?: string | null; harvest_type_display?: string | null; yield_kg?: string | number | null; destination_display?: string | null; revenue_amount?: string | number | null; buyer_name?: string | null; buyer_name_display?: string | null };

type ReportType = "estrutura" | "preparo" | "plantio" | "irrigacao" | "adubacao" | "defensivos" | "mao_obra" | "colheita" | "agronomo" | "anexos";
type ReportEvent = {
  id: string;
  type: ReportType;
  date: string;
  title: string;
  subtitle: string;
  details: string[];
  amount?: number;
  notes?: string | null;
};

const moduleConfig: Record<ReportType, { label: string; description: string; icon: LucideIcon; color: string; bg: string; unit: string }> = {
  estrutura: { label: "Estrutura do setor", description: "Informações da área, talhão, cultura e ciclo produtivo.", icon: Sprout, color: "#059669", bg: "#ecfdf5", unit: "itens" },
  preparo: { label: "Serviços mecanizados", description: "Atividades mecanizadas realizadas no talhão.", icon: Tractor, color: "#ea580c", bg: "#fff7ed", unit: "eventos" },
  plantio: { label: "Plantio", description: "Sementes, operações de plantio, quantidades e custos.", icon: Leaf, color: "#16a34a", bg: "#f0fdf4", unit: "eventos" },
  irrigacao: { label: "Irrigação", description: "Manejo de água, bombas, horas, volume e energia.", icon: Droplets, color: "#0284c7", bg: "#eff6ff", unit: "eventos" },
  adubacao: { label: "Adubação", description: "Adubações de base, cobertura, foliar e fertirrigação.", icon: Beaker, color: "#7c3aed", bg: "#f5f3ff", unit: "eventos" },
  defensivos: { label: "Defensivos", description: "Controle de pragas, doenças e aplicações relacionadas.", icon: ClipboardCheck, color: "#dc2626", bg: "#fef2f2", unit: "eventos" },
  mao_obra: { label: "Mão de obra", description: "Registros de diárias, atividades e custos de pessoal.", icon: Users, color: "#7c3aed", bg: "#faf5ff", unit: "registros" },
  colheita: { label: "Colheita", description: "Produção, destino, compradores e receita realizada.", icon: Wheat, color: "#d97706", bg: "#fffbeb", unit: "eventos" },
  agronomo: { label: "Agrônomo", description: "Recomendações técnicas e orientações registradas.", icon: FileText, color: "#059669", bg: "#ecfdf5", unit: "registros" },
  anexos: { label: "Anexos e observações", description: "Análises de solo, documentos e observações do ciclo.", icon: FlaskConical, color: "#dc2626", bg: "#fef2f2", unit: "arquivos" },
};

const orderedModules = Object.keys(moduleConfig) as ReportType[];

const extractArray = <T,>(data: ApiList<T> | unknown): T[] => {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && "results" in data) {
    const results = (data as { results?: unknown }).results;
    return Array.isArray(results) ? (results as T[]) : [];
  }
  return [];
};

const parseNumber = (value?: string | number | null) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const dateOnly = value.includes("T") ? value.split("T")[0] : value;
  const [year, month, day] = dateOnly.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const isoDate = (value?: string | null) => {
  if (!value) return "";
  return value.includes("T") ? value.split("T")[0] : value;
};

const formatAmount = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatNumber = (value: number, decimals = 2) =>
  value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const compact = (values: Array<string | null | undefined | false>) =>
  values.filter(Boolean) as string[];

const numberText = (value?: string | number | null, suffix = "") => {
  const parsed = parseNumber(value);
  if (!parsed) return "";
  return `${formatNumber(parsed, parsed % 1 === 0 ? 0 : 2)}${suffix}`;
};

const fileNameText = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const normalizeOperationLabel = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return "-";
  const normalized = trimmed.toLowerCase();
  if (normalized === "aracao" || normalized === "aração") return "Colheita";
  return trimmed;
};

function buildEvents(plantation: Plantation, sources: {
  landPreparations: LandPreparation[];
  plantings: Planting[];
  fertilizations: Application[];
  fertigations: Application[];
  pesticides: Application[];
  irrigations: Irrigation[];
  soilAnalyses: SoilAnalysis[];
  recommendations: Recommendation[];
  laborRecords: LaborRecord[];
  harvests: Harvest[];
}): ReportEvent[] {
  const events: ReportEvent[] = [];

  events.push({
    id: `estrutura-${plantation.id}`,
    type: "estrutura",
    date: plantation.planting_date || "",
    title: plantation.name || plantation.crop_name || "Produção agrícola",
    subtitle: `${plantation.farm_name || "Fazenda"} / ${plantation.field_name || "Talhão"}`,
    details: compact([
      plantation.crop_name ? `Cultura: ${plantation.crop_name}` : undefined,
      plantation.planted_area_ha ? `Área: ${numberText(plantation.planted_area_ha, " ha")}` : undefined,
      plantation.status_display ? `Status: ${plantation.status_display}` : undefined,
      plantation.planting_date ? `Plantio: ${formatDate(plantation.planting_date)}` : undefined,
      plantation.expected_harvest_date ? `Colheita prevista: ${formatDate(plantation.expected_harvest_date)}` : undefined,
    ]),
  });

  sources.landPreparations.forEach((item) => {
    const amount = parseNumber(item.total_price || item.total_amount);
    events.push({
      id: `preparo-${item.id}`,
      type: "preparo",
      date: item.date || item.created_at || "",
      title: normalizeOperationLabel(item.operation_type_display) || "Serviços mecanizados",
      subtitle: item.execution_type_display || "Operação de preparo",
      details: compact([
        item.tractor_name ? `Trator: ${item.tractor_name}` : undefined,
        item.operator ? `Operador: ${item.operator}` : undefined,
        item.hours_worked ? `Horas: ${numberText(item.hours_worked, " h")}` : undefined,
        amount ? `Custo: ${formatAmount(amount)}` : undefined,
      ]),
      amount,
      notes: item.notes,
    });
  });

  sources.plantings.forEach((item) => {
    const amount = parseNumber(item.total_price);
    events.push({
      id: `plantio-${item.id}`,
      type: "plantio",
      date: item.planting_date || item.created_at || "",
      title: item.item_name || "Semente / plantio",
      subtitle: "Registro de plantio",
      details: compact([
        item.quantity ? `Quantidade: ${numberText(item.quantity, item.unit ? ` ${item.unit}` : "")}` : undefined,
        item.operator ? `Operador: ${item.operator}` : undefined,
        amount ? `Custo: ${formatAmount(amount)}` : undefined,
      ]),
      amount,
      notes: item.notes,
    });
  });

  [...sources.fertilizations, ...sources.fertigations].forEach((item) => {
    const amount = parseNumber(item.total_price);
    events.push({
      id: `adubacao-${item.id}`,
      type: "adubacao",
      date: item.application_date || item.created_at || "",
      title: item.item_name || "Adubação",
      subtitle: item.application_method_display || "Aplicação nutricional",
      details: compact([
        item.quantity ? `Quantidade: ${numberText(item.quantity, item.unit ? ` ${item.unit}` : "")}` : undefined,
        item.dose_per_ha ? `Dose: ${numberText(item.dose_per_ha, "/ha")}` : undefined,
        item.operator ? `Operador: ${item.operator}` : undefined,
        amount ? `Custo: ${formatAmount(amount)}` : undefined,
      ]),
      amount,
      notes: item.notes,
    });
  });

  sources.pesticides.forEach((item) => {
    const amount = parseNumber(item.total_price);
    events.push({
      id: `defensivos-${item.id}`,
      type: "defensivos",
      date: item.application_date || item.created_at || "",
      title: item.item_name || "Aplicação de defensivo",
      subtitle: item.pesticide_type_display || "Defensivo agrícola",
      details: compact([
        item.target ? `Alvo: ${item.target}` : undefined,
        item.quantity ? `Quantidade: ${numberText(item.quantity, item.unit ? ` ${item.unit}` : "")}` : undefined,
        item.operator ? `Operador: ${item.operator}` : undefined,
        amount ? `Custo: ${formatAmount(amount)}` : undefined,
      ]),
      amount,
      notes: item.notes,
    });
  });

  sources.irrigations.forEach((item) => {
    const amount = parseNumber(item.energy_cost);
    const date = item.start_date || item.date || item.created_at || "";
    events.push({
      id: `irrigacao-${item.id}`,
      type: "irrigacao",
      date,
      title: item.irrigation_system_display || "Irrigação",
      subtitle: item.end_date && item.end_date !== date ? `${formatDate(date)} a ${formatDate(item.end_date)}` : "Manejo de irrigação",
      details: compact([
        item.pump_name ? `Bomba: ${item.pump_name}` : undefined,
        item.operating_days ? `Dias: ${item.operating_days}` : undefined,
        item.hours ? `Horas: ${numberText(item.hours, " h")}` : undefined,
        item.liters_used ? `Água: ${numberText(item.liters_used, " L")}` : undefined,
        amount ? `Energia: ${formatAmount(amount)}` : undefined,
      ]),
      amount,
      notes: item.notes,
    });
  });

  sources.recommendations.forEach((item) => {
    events.push({
      id: `agronomo-${item.id}`,
      type: "agronomo",
      date: item.recommendation_date || item.created_at || "",
      title: item.title || "Recomendação técnica",
      subtitle: item.objective || "Orientação agronômica",
      details: compact([
        item.priority_display ? `Prioridade: ${item.priority_display}` : undefined,
        item.status_display ? `Status: ${item.status_display}` : undefined,
        item.suggested_application_date ? `Aplicação sugerida: ${formatDate(item.suggested_application_date)}` : undefined,
      ]),
      notes: item.notes,
    });
  });

  sources.laborRecords.forEach((item) => {
    const amount = parseNumber(item.total_amount);
    events.push({
      id: `mao-obra-${item.id}`,
      type: "mao_obra",
      date: item.activity_date || item.created_at || "",
      title: item.activity_type_display || "Atividade de mão de obra",
      subtitle: item.worker_name || "Trabalhador",
      details: compact([
        item.daily_quantity ? `Diárias: ${numberText(item.daily_quantity)}` : undefined,
        amount ? `Custo: ${formatAmount(amount)}` : undefined,
      ]),
      amount,
      notes: item.notes,
    });
  });

  sources.harvests.forEach((item) => {
    const revenue = parseNumber(item.revenue_amount);
    events.push({
      id: `colheita-${item.id}`,
      type: "colheita",
      date: item.harvest_date || item.created_at || "",
      title: item.harvest_type_display || "Colheita registrada",
      subtitle: item.destination_display || "Destino da produção",
      details: compact([
        item.yield_kg ? `Produção: ${numberText(item.yield_kg, " kg")}` : undefined,
        item.buyer_name_display || item.buyer_name ? `Comprador: ${item.buyer_name_display || item.buyer_name}` : undefined,
        revenue ? `Receita: ${formatAmount(revenue)}` : undefined,
      ]),
      amount: revenue,
      notes: item.notes,
    });
  });

  sources.soilAnalyses.forEach((item) => {
    events.push({
      id: `anexo-${item.id}`,
      type: "anexos",
      date: item.created_at || "",
      title: "Análise de solo anexada",
      subtitle: item.original_name || "Documento técnico",
      details: compact([item.uploaded_by_name ? `Enviado por: ${item.uploaded_by_name}` : undefined]),
      notes: item.notes,
    });
  });

  return events.sort((a, b) => new Date(a.date || "0000-01-01").getTime() - new Date(b.date || "0000-01-01").getTime());
}

export default function RelatorioPlantacaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [plantation, setPlantation] = useState<Plantation | null>(null);
  const [events, setEvents] = useState<ReportEvent[]>([]);
  const [selectedModules, setSelectedModules] = useState<Record<ReportType, boolean>>(
    orderedModules.reduce((acc, key) => ({ ...acc, [key]: true }), {} as Record<ReportType, boolean>),
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;

    Promise.all([
      cropService.get(id),
      cropService.dashboard(id).catch(() => ({ data: {} })),
      cropService.listLandPreparations({ plantation: id }).catch(() => ({ data: { results: [] } })),
      cropService.listPlantings({ plantation: id }).catch(() => ({ data: { results: [] } })),
      cropService.listFertilizations({ plantation: id }).catch(() => ({ data: { results: [] } })),
      cropService.listFertigations({ plantation: id }).catch(() => ({ data: { results: [] } })),
      cropService.listPesticideApplications({ plantation: id }).catch(() => ({ data: { results: [] } })),
      cropService.listIrrigations({ plantation: id }).catch(() => ({ data: { results: [] } })),
      cropService.listSoilAnalyses({ plantation: id }).catch(() => ({ data: { results: [] } })),
      cropService.listAgronomistRecommendations({ plantation: id }).catch(() => ({ data: { results: [] } })),
      cropService.listLaborRecords({ plantation: id }).catch(() => ({ data: { results: [] } })),
      cropService.listHarvests({ planting_cycle: id }).catch(() => ({ data: { results: [] } })),
    ])
      .then(([plantationRes, dashboardRes, landRes, plantingRes, fertilizationRes, fertigationRes, pesticideRes, irrigationRes, soilRes, recommendationRes, laborRes, harvestRes]) => {
        if (!active) return;
        const currentPlantation = { ...plantationRes.data, ...dashboardRes.data } as Plantation;
        const reportEvents = buildEvents(currentPlantation, {
          landPreparations: extractArray<LandPreparation>(landRes.data),
          plantings: extractArray<Planting>(plantingRes.data),
          fertilizations: extractArray<Application>(fertilizationRes.data),
          fertigations: extractArray<Application>(fertigationRes.data),
          pesticides: extractArray<Application>(pesticideRes.data),
          irrigations: extractArray<Irrigation>(irrigationRes.data),
          soilAnalyses: extractArray<SoilAnalysis>(soilRes.data),
          recommendations: extractArray<Recommendation>(recommendationRes.data),
          laborRecords: extractArray<LaborRecord>(laborRes.data),
          harvests: extractArray<Harvest>(harvestRes.data),
        });

        const eventDates = reportEvents.map((event) => isoDate(event.date)).filter(Boolean);
        setPlantation(currentPlantation);
        setEvents(reportEvents);
        setStartDate(eventDates[0] || isoDate(currentPlantation.planting_date) || "");
        setEndDate(eventDates[eventDates.length - 1] || isoDate(currentPlantation.actual_harvest_date) || isoDate(currentPlantation.expected_harvest_date) || "");
        setError("");
      })
      .catch(() => {
        if (!active) return;
        setError("Não foi possível carregar os dados do relatório.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const periodEvents = useMemo(() => {
    const start = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
    const end = endDate ? new Date(`${endDate}T23:59:59`).getTime() : null;
    return events.filter((event) => {
      const time = new Date(`${isoDate(event.date) || "0000-01-01"}T12:00:00`).getTime();
      return (start === null || time >= start) && (end === null || time <= end);
    });
  }, [endDate, events, startDate]);

  const selectedEvents = useMemo(
    () => periodEvents.filter((event) => selectedModules[event.type]),
    [periodEvents, selectedModules],
  );

  const moduleCounts = useMemo(() => {
    return periodEvents.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as Partial<Record<ReportType, number>>);
  }, [periodEvents]);

  const totals = useMemo(() => {
    const investment = parseNumber(plantation?.investment_total) || selectedEvents.filter((event) => event.type !== "colheita").reduce((sum, event) => sum + (event.amount || 0), 0);
    const revenue = selectedEvents.filter((event) => event.type === "colheita").reduce((sum, event) => sum + (event.amount || 0), 0);
    const harvestedKg = selectedEvents
      .filter((event) => event.type === "colheita")
      .reduce((sum, event) => {
        const productionDetail = event.details.find((detail) => detail.startsWith("Produção:"));
        return sum + parseNumber(productionDetail?.replace("Produção:", "").replace("kg", "").trim());
      }, 0);
    const area = parseNumber(plantation?.planted_area_ha);
    const soldKg = revenue > 0 ? harvestedKg : 0;

    return {
      investment,
      revenue,
      profit: revenue - investment,
      harvestedKg,
      costPerHa: area > 0 ? investment / area : 0,
      revenuePerHa: area > 0 ? revenue / area : 0,
      costPerKg: harvestedKg > 0 ? investment / harvestedKg : 0,
      salePerKg: soldKg > 0 ? revenue / soldKg : 0,
      profitPerKg: harvestedKg > 0 ? (revenue - investment) / harvestedKg : 0,
    };
  }, [plantation?.investment_total, plantation?.planted_area_ha, selectedEvents]);

  const selectedModuleCount = orderedModules.filter((type) => selectedModules[type]).length;
  const totalRecords = orderedModules.reduce((sum, type) => sum + (selectedModules[type] ? moduleCounts[type] || 0 : 0), 0);
  const days = startDate && endDate
    ? Math.max(Math.floor((new Date(`${endDate}T12:00:00`).getTime() - new Date(`${startDate}T12:00:00`).getTime()) / 86400000) + 1, 1)
    : 0;

  const setAllModules = (checked: boolean) => {
    setSelectedModules(orderedModules.reduce((acc, key) => ({ ...acc, [key]: checked }), {} as Record<ReportType, boolean>));
  };

  const buildPdf = (summaryOnly = false) => {
    const doc = new jsPDF();
    const title = plantation?.name || plantation?.crop_name || "Produção";
    const margin = 14;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 18;

    const ensureSpace = (height = 12) => {
      if (y + height <= pageHeight - margin) return;
      doc.addPage();
      y = 18;
    };

    const textLine = (label: string, value: string) => {
      ensureSpace(7);
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, margin, y);
      doc.setFont("helvetica", "normal");
      doc.text(value || "-", margin + 48, y);
      y += 7;
    };

    const section = (label: string) => {
      y += 4;
      ensureSpace(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(label, margin, y);
      y += 8;
      doc.setFontSize(10);
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(summaryOnly ? "Resumo Total da Produção" : "Relatório da Produção", margin, y);
    y += 9;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(title, margin, y);
    y += 10;

    textLine("Fazenda", plantation?.farm_name || "-");
    textLine("Talhão", plantation?.field_name || "-");
    textLine("Status", plantation?.status_display || "-");
    textLine("Período", startDate && endDate ? `${formatDate(startDate)} a ${formatDate(endDate)}` : "-");

    section("Resumo financeiro e produtivo");
    textLine("Investimento total", formatAmount(totals.investment));
    textLine("Custo por hectare", totals.costPerHa ? formatAmount(totals.costPerHa) : "-");
    textLine("Receita por hectare", totals.revenuePerHa ? formatAmount(totals.revenuePerHa) : "-");
    textLine("Lucro real", formatAmount(totals.profit));
    textLine("Produção", totals.harvestedKg ? `${formatNumber(totals.harvestedKg, 0)} kg` : "-");
    textLine("Custo por kg", totals.costPerKg ? formatAmount(totals.costPerKg) : "-");
    textLine("Venda por kg", totals.salePerKg ? formatAmount(totals.salePerKg) : "-");
    textLine("Lucro por kg", totals.profitPerKg ? formatAmount(totals.profitPerKg) : "-");

    if (notes.trim()) {
      section("Observações para o agrônomo");
      const wrapped = doc.splitTextToSize(notes.trim(), pageWidth - margin * 2);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 5;
    }

    if (!summaryOnly) {
      orderedModules.filter((type) => selectedModules[type]).forEach((type) => {
        const moduleEvents = selectedEvents.filter((event) => event.type === type);
        section(moduleConfig[type].label);
        if (!moduleEvents.length) {
          doc.text("Nenhum registro no período selecionado.", margin, y);
          y += 6;
          return;
        }

        moduleEvents.forEach((event) => {
          const line = `${formatDate(event.date)} - ${event.title} - ${event.subtitle}${event.details.length ? ` | ${event.details.join(" | ")}` : ""}${event.notes ? ` | Obs.: ${event.notes}` : ""}`;
          const wrapped = doc.splitTextToSize(line, pageWidth - margin * 2);
          ensureSpace(wrapped.length * 5 + 4);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(wrapped, margin, y);
          y += wrapped.length * 5 + 3;
        });
      });
    }

    return doc;
  };

  const reportFileName = (summaryOnly = false) => {
    const title = plantation?.name || plantation?.crop_name || "producao";
    return `${summaryOnly ? "resumo-total" : "relatorio-producao"}-${fileNameText(title)}.pdf`;
  };

  const handlePreviewPdf = () => {
    const doc = buildPdf(false);
    const url = URL.createObjectURL(doc.output("blob"));
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDownloadPdf = (summaryOnly = false) => {
    buildPdf(summaryOnly).save(reportFileName(summaryOnly));
  };

  const handleSendToAgronomist = async () => {
    if (!plantation || sharing) return;
    try {
      setSharing(true);
      const file = new File([buildPdf(false).output("blob")], reportFileName(false), { type: "application/pdf" });
      const shareData = { title: "Relatório da Produção", text: `Relatório da produção ${plantation.name || plantation.crop_name || ""}`, files: [file] };
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        return;
      }
      handleDownloadPdf(false);
    } finally {
      setSharing(false);
    }
  };

  const handleCopyLink = async () => {
    if (typeof window === "undefined") return;
    await navigator.clipboard?.writeText(window.location.href);
  };

  if (loading) {
    return (
      <div className="p-4">
        <Skeleton height="48px" width="320px" className="mb-4" />
        <div className="row g-4">
          <div className="col-lg-8"><Skeleton height="760px" /></div>
          <div className="col-lg-4"><Skeleton height="760px" /></div>
        </div>
      </div>
    );
  }

  if (error) return <div className="p-4 text-muted">{error}</div>;
  if (!plantation) return <div className="p-4 text-muted">Plantação não encontrada.</div>;

  return (
    <div className="p-3 p-md-4">
      <div className="d-flex align-items-center justify-content-between gap-3 mb-4 flex-wrap">
        <div>
          <button type="button" className="btn btn-link text-decoration-none text-muted-foreground fw-semibold p-0 mb-3 d-inline-flex align-items-center gap-2" onClick={() => router.push(`/home/plantacoes/${id}`)}>
            <ArrowLeft size={17} /> Voltar
          </button>
          <h1 className="fw-black text-foreground mb-1" style={{ fontSize: "1.85rem" }}>Relatório da Produção</h1>
          <p className="text-muted-foreground mb-0">Gere um PDF completo com todas as informações e atividades registradas nesta produção.</p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <Button variant="outline-secondary" size="sm" onClick={handlePreviewPdf}><Eye size={15} /> Visualizar PDF</Button>
          <Button variant="agro" size="sm" onClick={() => handleDownloadPdf(false)}><Download size={15} /> Gerar PDF</Button>
          <Button variant="outline-primary" size="sm" onClick={handleSendToAgronomist} disabled={sharing}><Send size={15} /> Enviar para agrônomo</Button>
        </div>
      </div>

      <div className="row g-4 align-items-start">
        <div className="col-12 col-xl-8">
          <div className="dashboard-card p-4 mb-4">
            <h2 className="fw-bold mb-1" style={{ fontSize: "1.05rem" }}>Período do relatório</h2>
            <p className="text-muted-foreground small mb-4">Selecione o período que deseja incluir no relatório.</p>
            <div className="row g-3 align-items-end">
              <div className="col-md-5">
                <label className="form-label small fw-semibold">Data inicial</label>
                <input type="date" className="form-control" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </div>
              <div className="col-md-2 text-center text-muted-foreground small pb-2">até</div>
              <div className="col-md-5">
                <label className="form-label small fw-semibold">Data final</label>
                <input type="date" className="form-control" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
            </div>
            <div className="mt-4 p-3 d-flex align-items-start gap-3" style={{ borderRadius: 8, background: "#f0fdf4", border: "1px solid #dcfce7" }}>
              <Info size={20} className="text-success flex-shrink-0 mt-1" />
              <div>
                <div className="fw-bold text-foreground">Período selecionado: {days || 0} dias</div>
                <div className="text-muted-foreground small">{startDate ? formatDate(startDate) : "-"} até {endDate ? formatDate(endDate) : "-"}</div>
              </div>
            </div>
          </div>

          <div className="dashboard-card p-0 mb-4 overflow-hidden">
            <div className="p-4 d-flex align-items-start justify-content-between gap-3 flex-wrap border-bottom border-border">
              <div>
                <h2 className="fw-bold mb-1" style={{ fontSize: "1.05rem" }}>O que deseja incluir no relatório</h2>
                <p className="text-muted-foreground small mb-0">Escolha os módulos e informações que farão parte do seu relatório.</p>
              </div>
              <button type="button" className="btn btn-link text-success fw-bold text-decoration-none p-0 d-inline-flex align-items-center gap-2" onClick={() => setAllModules(selectedModuleCount !== orderedModules.length)}>
                {selectedModuleCount === orderedModules.length ? "Desmarcar todos" : "Selecionar todos"}
                <span className="d-inline-flex align-items-center justify-content-center bg-success text-white" style={{ width: 20, height: 20, borderRadius: 5 }}>
                  <Check size={13} />
                </span>
              </button>
            </div>
            {orderedModules.map((type) => {
              const config = moduleConfig[type];
              const Icon = config.icon;
              const checked = selectedModules[type];
              const count = moduleCounts[type] || 0;
              return (
                <button
                  key={type}
                  type="button"
                  className="w-100 border-0 bg-transparent text-start p-4 d-flex align-items-center gap-3 border-bottom border-border"
                  onClick={() => setSelectedModules((prev) => ({ ...prev, [type]: !prev[type] }))}
                >
                  <span className="d-inline-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 42, height: 42, borderRadius: 8, background: config.bg, color: config.color }}>
                    <Icon size={21} />
                  </span>
                  <span className="flex-grow-1 min-w-0">
                    <span className="d-block fw-bold text-foreground">{config.label}</span>
                    <span className="d-block text-muted-foreground small">{config.description}</span>
                  </span>
                  <span className="text-muted-foreground small fw-semibold text-nowrap">{count} {config.unit}</span>
                  <span className={`d-inline-flex align-items-center justify-content-center flex-shrink-0 ${checked ? "bg-success text-white" : "bg-body text-muted border border-border"}`} style={{ width: 22, height: 22, borderRadius: 5 }}>
                    {checked ? <Check size={14} /> : null}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="dashboard-card p-4 mb-4">
            <h2 className="fw-bold mb-1" style={{ fontSize: "1.05rem" }}>Informações adicionais <span className="text-muted fw-normal">(opcional)</span></h2>
            <p className="text-muted-foreground small mb-3">Inclua observações ou instruções para o agrônomo.</p>
            <label className="form-label small fw-semibold">Observações para o agrônomo</label>
            <textarea className="form-control" rows={4} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Digite aqui alguma informação importante sobre o relatório..." />
            <div className="text-muted-foreground small mt-2">{notes.length}/500 caracteres</div>
          </div>

          <div className="dashboard-card p-4">
            <h2 className="fw-bold mb-1" style={{ fontSize: "1.05rem" }}>Últimos eventos registrados no período</h2>
            <p className="text-muted-foreground small mb-3">Resumo rápido das atividades mais recentes.</p>
            <div className="d-flex gap-3 overflow-auto pb-1">
              {selectedEvents.slice(-5).reverse().map((event) => {
                const config = moduleConfig[event.type];
                const Icon = config.icon;
                return (
                  <div key={event.id} className="border border-border bg-card p-3 flex-shrink-0" style={{ borderRadius: 8, width: 150 }}>
                    <div className="d-flex align-items-center gap-2 mb-2" style={{ color: config.color }}>
                      <Icon size={15} />
                      <span className="fw-bold text-truncate" style={{ fontSize: "0.72rem" }}>{config.label}</span>
                    </div>
                    <div className="fw-semibold text-foreground text-truncate small">{event.title}</div>
                    <div className="text-muted-foreground" style={{ fontSize: "0.72rem" }}>{formatDate(event.date)}</div>
                  </div>
                );
              })}
              {selectedEvents.length === 0 ? <div className="text-muted-foreground small">Nenhum evento no período selecionado.</div> : null}
            </div>
          </div>
        </div>

        <aside className="col-12 col-xl-4">
          <div className="dashboard-card p-4 mb-4">
            <h2 className="fw-bold mb-1" style={{ fontSize: "1.05rem" }}>Resumo do relatório</h2>
            <p className="text-muted-foreground small mb-4">Veja o que será incluído no seu relatório.</p>
            <div className="d-flex flex-column gap-3">
              {orderedModules.map((type) => {
                const config = moduleConfig[type];
                const Icon = config.icon;
                const count = selectedModules[type] ? moduleCounts[type] || 0 : 0;
                return (
                  <div key={type} className="d-flex align-items-center gap-3">
                    <span className="d-inline-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 6, background: config.bg, color: config.color }}>
                      <Icon size={16} />
                    </span>
                    <span className="flex-grow-1 fw-semibold small text-foreground">{config.label}</span>
                    <span className="text-muted-foreground small text-nowrap">{count} {config.unit}</span>
                  </div>
                );
              })}
            </div>
            <div className="border-top border-border mt-4 pt-3 d-flex justify-content-between align-items-center">
              <span className="fw-bold text-foreground">Total de informações</span>
              <span className="fw-black text-foreground">{totalRecords} registros</span>
            </div>
          </div>

          <div className="dashboard-card p-4 mb-4">
            <h2 className="fw-bold mb-4" style={{ fontSize: "1.05rem" }}><Settings size={16} className="me-2" />Configurações do PDF</h2>
            {[
              ["Formato", "PDF"],
              ["Orientação", "Retrato"],
              ["Páginas estimadas", selectedEvents.length > 20 ? "20 - 30 páginas" : "5 - 15 páginas"],
              ["Tamanho", "A4"],
              ["Incluir gráficos", "Sim"],
              ["Incluir anexos", selectedModules.anexos ? "Sim" : "Não"],
              ["Idioma", "Português"],
            ].map(([label, value]) => (
              <div key={label} className="d-flex justify-content-between gap-3 mb-3 small">
                <span className="text-muted-foreground">{label}:</span>
                <span className="fw-semibold text-foreground">{value}</span>
              </div>
            ))}
          </div>

          <div className="dashboard-card p-4">
            <h2 className="fw-bold mb-1" style={{ fontSize: "1.05rem" }}>Exportar e compartilhar</h2>
            <p className="text-muted-foreground small mb-4">Gere o PDF completo, o resumo total ou envie diretamente ao agrônomo.</p>
            <div className="d-grid gap-3">
              <Button variant="agro" onClick={() => handleDownloadPdf(false)}><Download size={16} /> Gerar PDF completo</Button>
              <Button variant="outline-secondary" onClick={() => handleDownloadPdf(true)}><FileText size={16} /> Gerar PDF resumo</Button>
              <Button variant="outline-secondary" onClick={handlePreviewPdf}><Eye size={16} /> Visualizar PDF</Button>
              <Button variant="outline-secondary" onClick={handleSendToAgronomist} disabled={sharing}><Send size={16} /> Enviar para agrônomo</Button>
              <Button variant="outline-success" onClick={handleCopyLink}><Link size={16} /> Compartilhar link</Button>
            </div>
            <div className="mt-4 p-3 d-flex gap-3" style={{ borderRadius: 8, background: "#f0fdf4", border: "1px solid #dcfce7" }}>
              <Info size={18} className="text-success flex-shrink-0 mt-1" />
              <p className="text-muted-foreground small mb-0">O relatório será gerado com as informações selecionadas, organizadas por módulo, com resumo financeiro e detalhes de cada evento.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
