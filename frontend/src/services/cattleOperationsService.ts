import api from "./api";
import type { Page } from "./cattleService";
export type OperationRow = Record<string, unknown> & { id: string };
export type StockLotOption = { id: string; label: string; unit: string; expiry: string | null; balance: string };
export type MilkTrend = { series: { date: string; produced: string; discarded: string; usable: string; milked_cows: number | null; aggregate: boolean }[]; sessions: { session: string; liters: string; records: number }[]; produced: string; days_with_records: number; drop_alert: { text: string; drop_percent: string; date: string } | null; note: string };
export type CostReport = { expenses: (OperationRow & { date: string; description: string; amount: string; status: string; reference: string })[]; entries: (OperationRow & { source: string; date: string; description: string; amount: string | null; reference: string | null })[]; totals: Record<string,string>; operational_total: string; expenses_by_due_date: string; missing_cost_count: number; note: string };
const base = "/livestock/cattle/operations";
export const cattleOperations = {
  page: async <T = OperationRow>(kind: string, params: Record<string,string | number> = {}, signal?: AbortSignal) => (await api.get<Page<T>>(`${base}/${kind}/`, { params, signal })).data,
  read: async <T>(kind: string, params: Record<string,string | number> = {}, signal?: AbortSignal) => (await api.get<T>(`${base}/${kind}/`, { params, signal })).data,
  command: async <T = OperationRow>(kind: string, data: Record<string,unknown>) => (await api.post<T>(`${base}/${kind}/`, data)).data,
};
export const purposeLabels: Record<string,string> = { unknown: "Não informado", beef: "Corte", dairy: "Leite", dual: "Dupla finalidade" };

export function parseAnimalCSV(content: string): Record<string,string>[] {
  const text = content.replace(/^\uFEFF/, "");
  const delimiter = text.split(/\r?\n/)[0].includes(";") ? ";" : ",";
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false;
  for (let i=0; i<text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i+1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (char === delimiter && !quoted) { row.push(field.trim()); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[i+1] === "\n") i++; row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row=[]; field=""; }
    else field += char;
  }
  if (quoted) throw new Error("Há aspas sem fechamento na planilha.");
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2 || rows.length > 501) throw new Error("Use uma planilha com cabeçalho e entre 1 e 500 animais.");
  const headers=rows.shift()!;
  const allowed=["identifier","name","gender","category","birth_date","entry_date","breed_name_input","initial_weight_kg","notes","cattle_purpose"];
  if (new Set(headers).size !== headers.length || headers.some(key => !allowed.includes(key)) || !headers.includes("identifier")) throw new Error("Confira os cabeçalhos usando a planilha-modelo.");
  return rows.map((values,index) => { if (values.length !== headers.length) throw new Error(`A linha ${index+2} tem quantidade de colunas incorreta.`); return Object.fromEntries(headers.flatMap((key,i) => values[i] ? [[key,values[i]]] : [])); });
}
