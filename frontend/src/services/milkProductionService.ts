import api from "./api";
import type { Page, CattleMilk } from "./cattleService";
export type MilkCow = { id: string; identifier: string; name: string; farm: string; farm_name: string; breed_name: string; is_lactating: boolean; liters: string | null; entry_status: "pending" | "recorded" | "total" };
export type MilkSummary = { produced_liters: string; discarded_liters: string; usable_liters: string; milked_cows: number | null; expected_cows: number; pending_cows: number | null; average_per_milked_cow: string | null; aggregate_mode: boolean };
export type MilkTotal = { id: string; farm: string; farm_name: string; date: string; liters: string; discarded_liters: string; discard_reason: string; notes: string };
export type MilkValues = { liters: string; discarded_liters: string; discard_reason: string; notes: string };
const base = "/livestock/cattle";
export const milkProductionService = {
  summary: async (date: string, farm: string, signal?: AbortSignal) => (await api.get<MilkSummary>(`${base}/milk/day-summary/`, { params: { date, ...(farm ? { farm } : {}) }, signal })).data,
  cows: async (params: Record<string, string | number>, signal?: AbortSignal) => (await api.get<Page<MilkCow>>(`${base}/milk/cows/`, { params, signal })).data,
  records: async (params: Record<string, string | number>, signal?: AbortSignal) => (await api.get<Page<CattleMilk>>(`${base}/milk/`, { params, signal })).data,
  totals: async (params: Record<string, string | number>, signal?: AbortSignal) => (await api.get<Page<MilkTotal>>(`${base}/milk-totals/`, { params, signal })).data,
  saveIndividual: async (animal: string, date: string, session: string, values: MilkValues, id?: string) => id
    ? (await api.patch<CattleMilk>(`${base}/milk/${id}/`, values)).data
    : (await api.post<CattleMilk>(`${base}/milk/`, { animal, date, session, ...values })).data,
  saveTotal: async (farm: string, date: string, values: MilkValues, id?: string) => id
    ? (await api.patch<MilkTotal>(`${base}/milk-totals/${id}/`, values)).data
    : (await api.post<MilkTotal>(`${base}/milk-totals/`, { farm, date, ...values })).data,
};
export const milkToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
};
export const milkNumber = (value: string | number | null | undefined) => value == null ? "—" : Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const milkSessions = [{ id: "morning", label: "De manhã" }, { id: "afternoon", label: "De tarde" }, { id: "evening", label: "De noite" }];
