import api from "./api";
import type { Page } from "./cattleService";
export type MilkTank = { id: string; farm: string; farm_name: string; name: string; capacity_liters: string; balance_liters: string; is_active: boolean; notes: string };
export type TankMovement = { id: string; tank: string; tank_name: string; farm_name: string; kind: "production" | "collection" | "discard"; date: string; liters: string; buyer: string; driver: string; vehicle: string; document: string; reason: string; notes: string; unit_price?: string | null; amount?: string | null; receivable?: string | null; recorded_by: string; cancelled_at: string | null; cancellation_reason: string };
export type TankQuality = { id: string; tank: string; tank_name: string; farm_name: string; date: string; sample: string; temperature_c: string | null; fat_percent: string | null; protein_percent: string | null; scc: number | null; tbc: number | null; antibiotics: "not_tested" | "negative" | "positive"; notes: string; recorded_by: string };
export type AvailableMilk = { date: string; produced_usable: string; allocated: string; available: string };
const base = "/livestock/cattle";
export const milkTankService = {
  tanks: async (signal?: AbortSignal) => {
    const rows: MilkTank[] = [];
    for (let page = 1; ; page++) {
      const { data } = await api.get<Page<MilkTank>>(`${base}/milk-tanks/`, { params: { page, page_size: 100 }, signal });
      rows.push(...data.results);
      if (!data.next) return rows;
    }
  },
  saveTank: async (values: Record<string, unknown>, id?: string) => (id ? await api.patch<MilkTank>(`${base}/milk-tanks/${id}/`, values) : await api.post<MilkTank>(`${base}/milk-tanks/`, values)).data,
  available: async (id: string, date: string, signal?: AbortSignal) => (await api.get<AvailableMilk>(`${base}/milk-tanks/${id}/production-available/`, { params: { date }, signal })).data,
  movements: async (params: Record<string, string | number>, signal?: AbortSignal) => (await api.get<Page<TankMovement>>(`${base}/milk-tank-movements/`, { params: { page_size: 10, ...params }, signal })).data,
  quality: async (params: Record<string, string | number>, signal?: AbortSignal) => (await api.get<Page<TankQuality>>(`${base}/milk-tank-quality/`, { params: { page_size: 10, ...params }, signal })).data,
  move: async (values: Record<string, unknown>) => (await api.post<TankMovement>(`${base}/milk-tank-movements/`, values)).data,
  recordQuality: async (values: Record<string, unknown>) => (await api.post<TankQuality>(`${base}/milk-tank-quality/`, values)).data,
  cancel: async (id: string, reason: string) => (await api.post(`${base}/milk-tank-movements/${id}/cancel/`, { reason })).data,
};
