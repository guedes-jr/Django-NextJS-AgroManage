import apiClient from "./api";

export interface PhaseIndicators {
  quantity: number; weight_kg: number | null; feed_kg: number | null;
  mortality_pct: number | null; daily_gain_kg: number | null; feed_conversion: number | null;
  sold: number; days_to_sale: number | null;
}
export interface SwineProductivity {
  crushing_mortality_pct: number | null;
  distribution: { maternity: number; creche: number; crescimento: number; engorda: number; reproduction: number };
  phases: Record<"creche" | "crescimento" | "engorda", PhaseIndicators>;
  feed_conversion: number | null; profit_per_matrix: number | null;
  farms: { id: string; name: string }[]; missing_reasons: Record<string, string>;
}
export async function getSwineProductivity(year: string, farm: string, signal?: AbortSignal) {
  const response = await apiClient.get<SwineProductivity>("/reports/livestock/productivity/", { params: { year, farm: farm || undefined }, signal });
  return response.data;
}

export async function getAllSwineFemales<T>(signal?: AbortSignal): Promise<T[]> {
  const items: T[] = [];
  let next: string | null = "/livestock/animals/?species=suinos&page_size=100";
  while (next) {
    const { data }: { data: T[] | { results: T[]; next: string | null } } = await apiClient.get(next, { signal });
    if (Array.isArray(data)) return [...items, ...data];
    items.push(...data.results); next = data.next;
  }
  return items;
}
