import apiClient from "./api";

export const lotCostColumns = [
  { key: "lactation_feed", label: "Ração Lactação (R$)" },
  { key: "gestation_feed", label: "Ração Gestação (R$)" },
  { key: "reproduction", label: "Reprodutor e Sêmen (R$)" },
  { key: "purchase", label: "Compra de Leitões (R$)" },
  { key: "maternity", label: "Maternidade (R$)" },
  { key: "nursery", label: "Creche (R$)" },
  { key: "growth", label: "Crescimento (R$)" },
  { key: "finishing", label: "Engorda (R$)" },
  { key: "cost_per_animal", label: "Gasto Total por Animal (R$)" },
  { key: "medication", label: "Gasto com Medicamentos Geral (R$)" },
  { key: "labor", label: "Gasto com Mão de Obra Geral (R$)" },
  { key: "total_cost", label: "Custo Total do Lote (R$)" },
  { key: "sales", label: "Venda Total do Lote (R$)" },
  { key: "profit", label: "Lucro/Prejuízo do Lote (R$)" },
  { key: "margin", label: "Margem (%)" },
] as const;
export type LotCostKey = typeof lotCostColumns[number]["key"];
export type LotReportItem = Partial<Record<LotCostKey, string | null>> & {
  id: string; batch_code: string; name?: string; quantity: number; category?: string;
  breed?: string; farm: string; entry_date?: string; exit_date?: string | null; status: string; status_display?: string;
  avg_weight?: number; species_code: string; phase?: string; production_type?: string;
  matrices?: string[]; missing_cost_count?: number; origin?: string; purchase_value?: number | null;
  /** Original lot size (entry), kept after sales. */ total_quantity?: number;
  /** Animals still in the lot: 0 once it is closed. */ current_quantity?: number; cost_quantity?: number | null; reproduction_allocation_pending?: boolean;
};
export interface LotReport {
  total_animals: number; total_active_animals: number; items: LotReportItem[];
  by_status: { status: string; total: number; batches: number }[];
}
export function isProductionLot(item: LotReportItem) {
  const category = (item.category || "").trim().toLocaleLowerCase("pt-BR");
  return !["matriz", "marrã", "marra", "reprodutor", "cachaço", "touro", "vaca", "novilha", "aguardando cobertura"].includes(category)
    && !["reproducao", "aguardando_cobertura"].includes(item.phase || "")
    && item.production_type !== "Reprodução";
}
const phaseNames: Record<string, string> = { creche: "Em creche", crescimento: "Em crescimento", engorda: "Em engorda", gestacao_maternidade: "Maternidade", reproducao: "Reprodução", aguardando_cobertura: "Aguardando cobertura" };
const statusNames: Record<string, string> = { active: "Ativo", sold: "Vendido", finished: "Finalizado", dead: "Morto" };
export function lotReportStatus(item: LotReportItem) {
  return item.status === "active" ? phaseNames[item.phase || ""] || "Ativo" : statusNames[item.status] || item.status_display || item.status;
}
export async function getLotReport(signal?: AbortSignal) {
  return (await apiClient.get<LotReport>("/reports/livestock/inventory/", {
    params: { species: "suinos", include_costs: true }, signal,
  })).data;
}
export function lotReportTotals(items: LotReportItem[]): Record<LotCostKey, number | null> {
  const totals = {} as Record<LotCostKey, number | null>;
  for (const { key } of lotCostColumns) {
    const values = items.map(item => item[key]).filter((value): value is string => value != null);
    totals[key] = values.length ? values.reduce((sum, value) => sum + Number(value), 0) : null;
  }
  const quantity = items.reduce((sum, item) => sum + (item.cost_quantity ?? item.quantity), 0);
  const unknownQuantity = items.some(item => Number(item.total_cost) > 0 && item.cost_per_animal == null);
  totals.cost_per_animal = !unknownQuantity && quantity && totals.total_cost != null ? totals.total_cost / quantity : null;
  totals.margin = totals.sales && totals.profit != null ? totals.profit / totals.sales * 100 : null;
  return totals;
}
/** Animals still in the lot (a closed lot keeps its last quantity on the model). */
export const lotCurrentQuantity = (item: LotReportItem) => item.current_quantity ?? (item.status === "active" ? item.quantity : 0);
/** Original lot size (animals that entered it), unchanged by sales and deaths. */
export const lotTotalQuantity = (item: LotReportItem) => item.total_quantity ?? item.cost_quantity ?? item.quantity;
/**
 * Animals that went through production lots in the period: lots still active, or closed
 * (sale/finish) within it. Each lot counts its original size, so cost per animal is
 * spread over every animal that entered the lot. Breeding stock is not a produced animal.
 */
export function animalsInPeriod(items: LotReportItem[], from: string, to: string) {
  return items.filter(isProductionLot).reduce((sum, item) => {
    if (item.entry_date && item.entry_date > to) return sum;
    if (item.status !== "active" && (!item.exit_date || item.exit_date < from || item.exit_date > to)) return sum;
    return sum + lotTotalQuantity(item);
  }, 0);
}
export const lotReportHeaders = ["Lote", "Tipo de Produção", "Matrizes", "Total do Lote", "Animais Atuais", "Status do Lote", ...lotCostColumns.map(column => column.label)];
export function lotReportExportRow(item: LotReportItem) {
  return [item.batch_code, item.production_type || "—", item.matrices?.join(", ") || "—", item.total_quantity ?? "—", lotCurrentQuantity(item),
    lotReportStatus(item), ...lotCostColumns.map(({ key }) => item[key] == null ? "—" : Number(item[key]))];
}

export interface LotIndicators {
  start: string; end: string; lots: number;
  initial_quantity: number; initial_weight_kg: number | null;
  current_quantity: number; current_weight_kg: number | null;
  daily_gain_kg: number | null; total_gain_kg: number | null;
  feed_conversion: number | null; deaths: number; mortality_pct: number | null;
  feed_kg: number; feed_per_animal_day_kg: number | null;
  feed_cost: number; cost_per_kg_gain: number | null;
}
/** Zootechnical indicators of the given lots in the period (same rules as the productivity tab). */
export async function getLotIndicators(start: string, end: string, batchIds: string[], signal?: AbortSignal) {
  return (await apiClient.get<LotIndicators>("/reports/livestock/lot-indicators/", {
    params: { start, end, batches: batchIds.join(",") }, signal,
  })).data;
}
