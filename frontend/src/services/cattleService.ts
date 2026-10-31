import apiClient from "./api";

export type CattleAnimal = {
  id: string; farm: string; farm_name: string; identifier: string; name?: string; gender: "M" | "F";
  coat_color?: string; birth_weight_kg?: string | null; genealogical_registration?: string; dairy_aptitude?: boolean; beef_aptitude?: boolean; embryo_role?: string; historical_birth_count?: number; historical_last_birth_date?: string | null;
  birth_count?: number; last_mating_date?: string | null; expected_birth_date?: string | null; gestation_days?: number | null;
  category: string; breed_name?: string; batch?: string | null; batch_code?: string;
  status: string; reproductive_status: string; birth_date?: string | null; entry_date?: string | null;
  is_lactating: boolean; is_castrated: boolean; weaning_date: string | null; management_group: string;
  milk_withdrawal_until: string | null; meat_withdrawal_until: string | null;
  sire_identifier?: string | null; dam_identifier?: string | null; sire_name?: string; dam_name?: string; current_weight_kg?: string | null; initial_weight_kg?: string | null; notes: string;
};
export type CattleBatch = {
  id: string; farm_id: string; farm_name: string; batch_code: string; name: string;
  category: string; phase: string; quantity: number; status: string; gender: string;
  operations?: { age_days: number | null; last_weighing_date: string | null; identified_animals: number; pastures: { name: string; entry_date: string; days: number }[] };
  avg_weight_kg: string | null; entry_date: string; origin: string; notes: string;
};
export type CattlePasture = { id: string; farm: string; farm_name: string; name: string; area_ha: string; notes: string; max_stocking_ua_ha: string | null; availability: string; availability_reason: string; occupancy: { heads: number; missing_weight_heads: number; live_weight_kg: string; stocking_ua_ha: string | null; capacity_percent: string | null; occupied_days: number | null; empty_days: number | null; last_exit_date: string | null; state: string } };
export type CattleGrazing = { id: string; pasture: string; pasture_name: string; batch: string; batch_code: string; quantity: number; entry_date: string; exit_date: string | null; notes: string };
export type CattleMilk = { id: string; animal: string; identifier: string; farm_name: string; date: string; session: string; liters: string; discarded_liters: string; discard_reason: string; notes: string };
export type CattleManagement = {
  id: string; farm: string; farm_name: string; kind: "weighing" | "sanitary" | "castration"; date: string; description: string;
  responsible: string; treatment_type: string; cost_per_animal: string; next_procedure_date: string | null;
  milk_withdrawal_until: string | null; meat_withdrawal_until: string | null; notes: string;
  status: "draft" | "confirmed" | "cancelled"; confirmed_at: string | null; cancellation_reason: string;
  follow_up_status: string; follow_up_execution: string | null; follow_up_note: string;
  entries: { animal: string; identifier: string; weight_kg: string | null }[];
};
export type CattleFeed = { id: string; lote_codigo?: string; animais_identificadores: string[]; item_nome: string; data_inicio: string; data_fim: string; quantidade: string; custo_total?: string };
export type CattleStockItem = { id: string; nome: string; estoque_atual: string; categoria: string; especie_animal: string; unidade_medida: string };
export type CattleHistory = { type: string; date: string | null; title: string; subtitle: string; details?: { weight_kg?: number } };
export type CattleOverview = {
  total_head: number; identified_animals: number; active_batches: number; pregnant_females: number;
  lactating_females: number; average_identified_weight: string | null; milk_produced_month: string;
  milk_discarded_month: string; milk_usable_month: string; pasture_area_ha: string;
  categories: { category: string; quantity: number }[];
  agenda: { date: string; title: string; kind: string }[];
};
export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };
export type CattleResource = "animals" | "batches" | "pastures" | "grazings" | "milk" | "feed" | "managements";
export type CattleFilters = Record<string, string | number>;

export type CattleAgendaEvent = { id: string; source_id: string; date: string; title: string; kind: "birth" | "diagnosis" | "sanitary"; animal: string | null; farm: string; farm_name: string; period: string };
export type CattleTroughReading = { id: string; batch: string; batch_code: string; farm_name: string; formula: string | null; formula_name: string; date: string; session: string; score: number; remaining_kg: string | null; head_count: number; notes: string; recorded_by: string };
export type CattleGenealogy = { ancestors: { id: string; identifier: string; relation: string; level: number; repeated: boolean }[]; children: { id: string; identifier: string; birth_date: string | null; current_weight_kg: string | null; status: string }[]; children_count: number; depth: number; notice: string };

const base = "/livestock/cattle";
export const cattleService = {
  reproductionSummary: async (params: CattleFilters, signal?: AbortSignal) => (await apiClient.get<Record<string, number>>(`${base}/animals/reproduction-summary/`, { params, signal })).data,
  troughReadings: async (params: CattleFilters, signal?: AbortSignal) => (await apiClient.get<Page<CattleTroughReading>>(`${base}/trough-readings/`, { params: { page_size: 10, ...params }, signal })).data,
  recordTroughReading: async (data: Record<string, unknown>) => (await apiClient.post<CattleTroughReading>(`${base}/trough-readings/`, data)).data,
  agenda: async (params: CattleFilters, signal?: AbortSignal) => (await apiClient.get<Page<CattleAgendaEvent>>(`${base}/agenda/`, { params, signal })).data,
  categoryCounts: async (params: CattleFilters, signal?: AbortSignal) => (await apiClient.get<Record<"all" | "cows" | "heifers" | "calves" | "bulls", number>>(`${base}/animals/category-counts/`, { params, signal })).data,
  animal: async (id: string) => (await apiClient.get<CattleAnimal>(`${base}/animals/${id}/`)).data,
  genealogy: async (id: string, signal?: AbortSignal) => (await apiClient.get<CattleGenealogy>(`${base}/animals/${id}/genealogy/`, { signal })).data,

  stockItems: async () => {
    const { data } = await apiClient.get<CattleStockItem[]>("/inventory/items/all_items/");
    return data;
  },
  all: async <T>(resource: CattleResource, filters: CattleFilters = {}, signal?: AbortSignal) => {
    const records: T[] = [];
    let page = 1;
    let more = true;
    while (more) {
      const { data } = await apiClient.get<Page<T>>(`${base}/${resource}/`, { params: { ...filters, page, page_size: 100 }, signal });
      records.push(...data.results);
      more = Boolean(data.next);
      page += 1;
    }
    return records;
  },
  overview: async (signal?: AbortSignal, farm?: string) => (await apiClient.get<CattleOverview>(`${base}/overview/`, { signal, params: farm ? { farm } : {} })).data,
  list: async <T>(resource: CattleResource, params: CattleFilters = {}, signal?: AbortSignal) =>
    (await apiClient.get<Page<T>>(`${base}/${resource}/`, { params: { page_size: 30, ...params }, signal })).data,
  farms: async (signal?: AbortSignal) => {
    const farms: { id: string; name: string }[] = [];
    let page = 1;
    let more = true;
    while (more) {
      const { data } = await apiClient.get<Page<{ id: string; name: string }>>("/farms/", { params: { page, page_size: 100 }, signal });
      farms.push(...data.results);
      more = Boolean(data.next);
      page += 1;
    }
    return farms;
  },
  create: async (resource: CattleResource, data: Record<string, unknown>) => (await apiClient.post(`${base}/${resource}/`, data)).data,
  update: async (resource: CattleResource, id: string, data: Record<string, unknown>) => (await apiClient.patch(`${base}/${resource}/${id}/`, data)).data,
  action: async (resource: "animals" | "batches" | "grazings" | "managements", id: string, action: string, data: Record<string, unknown>) =>
    (await apiClient.post(`${base}/${resource}/${id}/${action}/`, data)).data,
  history: async (id: string, signal?: AbortSignal) => (await apiClient.get<CattleHistory[]>(`${base}/animals/${id}/full-history/`, { signal })).data,
  sales: async (signal?: AbortSignal, farm?: string) => (await apiClient.get<{ id: string; date: string; batch_code: string; quantity: number; amount: string; buyer: string }[]>(`${base}/batches/sales/`, { signal, params: farm ? { farm } : {} })).data,
};

export function cattleError(error: unknown): string {
  const body = typeof error === "object" && error && "response" in error
    ? (error as { response?: { data?: unknown } }).response?.data : null;
  const messages = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(messages);
    if (value && typeof value === "object") return Object.values(value).flatMap(messages);
    return [];
  };
  return messages(body).join(" ") || "Não foi possível concluir a operação. Tente novamente.";
}
