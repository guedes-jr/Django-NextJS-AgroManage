import apiClient from "./api";

export type DailyFeedRow = {
  id: string; farm_name: string; batch_code: string; pasture: string | null;
  head_count: number; item_name: string; kg_per_head_day: string;
  daily_requirement_kg: string; supplied_kg: string;
  forecast: { status: string; estimated_remaining_kg: string | null };
  deliveries: { id: string; quantity_kg: string; remaining_before_kg: string; recorded_by: string; created_at: string; notes: string }[];
};
export type DailyFeeding = { date: string; results: DailyFeedRow[] };
export const cattleDailyFeedingService = {
  get: async (signal?: AbortSignal) => (await apiClient.get<DailyFeeding>("/livestock/cattle/daily-feeding/", { signal })).data,
  supply: async (values: { plan: string; date: string; quantity_kg: string; remaining_before_kg: string; request_key: string; notes: string }) =>
    (await apiClient.post("/livestock/cattle/daily-feeding/", values)).data,
};
