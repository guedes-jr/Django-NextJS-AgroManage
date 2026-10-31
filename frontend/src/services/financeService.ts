import { isAxiosError } from "axios";
import { apiClient } from "./api";

export type FinanceCategory = { id: string; name: string; category_type: "revenue" | "expense"; parent: string | null; is_active: boolean };
export type FinanceAccount = { id: string; name: string; account_type: string; initial_balance: string; current_balance: string; is_active: boolean };
export type PaymentEvent = { id: string; kind: "payment" | "reversal"; amount: string; bank_account: string | null; bank_account_name?: string; payment_date: string; payment_method: string; reason: string; reverses: string | null; created_by_name?: string; created_at: string };
export type FinanceTransaction = {
  id: string; description: string; amount: string; category: string; category_name: string; category_type: string;
  due_date: string; payment_date: string | null; status: string; reference: string; notes: string;
  bank_account: string | null; bank_account_name?: string; farm: string | null; farm_name?: string;
  species: string | null; species_name?: string; animal_batch: string | null; animal_batch_name?: string;
  planting_cycle: string | null; planting_cycle_name?: string; payment_events: PaymentEvent[];
  series_kind: string; series_number: number | null; series_count: number | null;
};
export type NamedOption = { id: string; name: string; farm?: string; farm_id?: string };
export type FinanceFilters = Record<string, string | number>;
export type FinancePage = { results: FinanceTransaction[]; count: number; next: string | null; previous: string | null };
export async function allFinanceOptions<T>(url: string, signal?: AbortSignal): Promise<T[]> {
  const result: T[] = [];
  for (let page = 1; ; page++) {
    const { data } = await apiClient.get<T[] | { results: T[]; next: string | null }>(url, { params: { page, page_size: 100 }, signal });
    if (Array.isArray(data)) return data;
    result.push(...data.results);
    if (!data.next) return result;
  }
}
export type CashProjection = { start_date: string; end_date: string; opening_balance: string | number; closing_balance: string | number; first_negative_date: string | null; included_titles: number; unassigned_titles: number; include_overdue: boolean; days: { date: string; revenue: string | number; expense: string | number; balance: string | number }[] };
export const financeService = {
  projection: async (params: FinanceFilters, signal?: AbortSignal) => (await apiClient.get<CashProjection>("/finance/transactions/projection/", { params, signal })).data,

  list: async (params: FinanceFilters, signal?: AbortSignal) => (await apiClient.get<FinancePage>("/finance/transactions/", { params, signal })).data,
  categories: (signal?: AbortSignal) => allFinanceOptions<FinanceCategory>("/finance/categories/", signal),
  accounts: (signal?: AbortSignal) => allFinanceOptions<FinanceAccount>("/finance/accounts/", signal),
  farms: (signal?: AbortSignal) => allFinanceOptions<NamedOption>("/farms/", signal),
  lookups: async (signal?: AbortSignal) => (await apiClient.get<{ farms: NamedOption[]; species: NamedOption[]; batches: { id: string; batch_code: string; farm_id: string; species_id: string }[]; plantations: { id: string; name: string; farm_id: string | null; field__farm_id: string }[] }>("/finance/transactions/lookups/", { signal })).data,
  create: async (data: Record<string, unknown>) => (await apiClient.post<FinanceTransaction>("/finance/transactions/", data)).data,
  update: async (id: string, data: Record<string, unknown>) => (await apiClient.patch(`/finance/transactions/${id}/`, data)).data,
  remove: async (id: string) => { await apiClient.delete(`/finance/transactions/${id}/`); },
  settle: async (id: string, data: Record<string, unknown>) => { await apiClient.post(`/finance/transactions/${id}/settle/`, data); },
  reverse: async (id: string, data: Record<string, unknown>) => { await apiClient.post(`/finance/transactions/${id}/reverse/`, data); },
  series: async (data: Record<string, unknown>) => { await apiClient.post("/finance/transactions/series/", data); },
  createAccount: async (data: Record<string, unknown>) => { await apiClient.post("/finance/accounts/", data); },
  updateAccount: async (id: string, data: Record<string, unknown>) => { await apiClient.patch(`/finance/accounts/${id}/`, data); },
  createCategory: async (data: Record<string, unknown>) => { await apiClient.post("/finance/categories/", data); },
  updateCategory: async (id: string, data: Record<string, unknown>) => { await apiClient.patch(`/finance/categories/${id}/`, data); },
  export: async (params: FinanceFilters = {}) => {
    const { data } = await apiClient.get<Blob>("/finance/transactions/export/", { params, responseType: "blob" });
    const url = URL.createObjectURL(data);
    const link = document.createElement("a"); link.href = url; link.download = "financeiro.csv"; link.click(); URL.revokeObjectURL(url);
  },
};

export function financeError(error: unknown): string {
  if (!isAxiosError(error)) return "Não foi possível concluir a operação.";
  const data = error.response?.data;
  const details = data?.error?.detail ?? data?.detail ?? data;
  if (typeof details === "string") return details;
  if (details && typeof details === "object") return Object.values(details).flat().filter(value => typeof value === "string").join(" ") || "Confira os dados e tente novamente.";
  return "Não foi possível concluir a operação.";
}
