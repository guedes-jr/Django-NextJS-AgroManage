import apiClient from "./api";

export const laborTypes = { daily: "Diária", monthly: "Mensal", hourly: "Por hora" };
export type LaborType = keyof typeof laborTypes;
export const laborSectors = ["Geral", "Maternidade", "Creche", "Crescimento", "Engorda", "Fábrica de ração", "Limpeza / Manutenção", "Reprodução"];
export type LaborDetails = { sector: string; worker: string; activity: string; type: LaborType; people: number; quantity: number; rate: number; observations: string };
export type LaborTransaction = { id: string; description: string; amount: string; due_date: string; notes: string; reference: string; animal_batch: string | null; status: string };
export type LaborBatch = { id: string; batch_code: string; farm_name: string; species_code: string };

type Page<T> = { results: T[]; next: string | null };
async function allPages<T>(url: string): Promise<T[]> {
  const items: T[] = [];
  let next: string | null = url;
  while (next) {
    const { data }: { data: Page<T> | T[] } = await apiClient.get(next);
    if (Array.isArray(data)) return [...items, ...data];
    items.push(...data.results);
    next = data.next;
  }
  return items;
}
export function calculateLaborTotal(type: LaborType, people: number, quantity: number, rate: number) {
  if (![people, quantity, rate].every(Number.isFinite) || !Number.isInteger(people) || people < 1 || quantity <= 0 || rate <= 0) return 0;
  return Math.round(people * (type === "monthly" ? 1 : quantity) * rate * 100) / 100;
}
export function readLaborDetails(notes: string): LaborDetails | null {
  try {
    const value = JSON.parse(notes);
    if (value.version === 1 && value.labor && value.labor.type in laborTypes) return value.labor;
  } catch { /* Existing entries have plain text notes. */ }
  return null;
}
export async function getSwineLaborHistory() {
  return (await allPages<LaborTransaction>("/finance/transactions/?page_size=100&type=expense"))
    .filter(item => item.reference?.startsWith("LABOR-SWINE-") && item.status !== "cancelled");
}
export async function getSwineLaborBatches() {
  return (await allPages<LaborBatch>("/livestock/batches/?species=suinos&page_size=100"))
    .filter(item => item.species_code === "suinos");
}
export async function createSwineLabor(date: string, batch: LaborBatch, labor: LaborDetails) {
  const amount = calculateLaborTotal(labor.type, labor.people, labor.quantity, labor.rate);
  if (!amount || !laborSectors.includes(labor.sector)) throw new Error("Lançamento inválido");
  const categories = await allPages<{ id: string; name: string; category_type: string }>("/finance/categories/?page_size=100");
  let category = categories.find(item => item.name === "Mão de Obra - Suinocultura" && item.category_type === "expense");
  if (!category) category = (await apiClient.post("/finance/categories/", { name: "Mão de Obra - Suinocultura", category_type: "expense", is_active: true })).data;
  await apiClient.post("/finance/transactions/", {
    category: category!.id, animal_batch: batch.id,
    description: `Mão de obra (${laborTypes[labor.type]}): ${labor.sector} — ${labor.activity} — ${labor.worker} — Lote ${batch.batch_code}`,
    amount: amount.toFixed(2), due_date: date, payment_date: date, status: "paid",
    reference: `LABOR-SWINE-${crypto.randomUUID()}`, notes: JSON.stringify({ version: 1, labor }),
  });
}
