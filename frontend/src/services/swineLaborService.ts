import apiClient from "./api";

export const laborTypes = { daily: "Diária", monthly: "Mensal", hourly: "Por hora" };
export type LaborType = keyof typeof laborTypes;
export const laborSectors = ["Geral", "Maternidade", "Creche", "Crescimento", "Engorda", "Fábrica de ração", "Limpeza / Manutenção", "Reprodução"];
export type LaborDetails = { sector: string; worker: string; activity: string; type: LaborType; people: number; quantity: number; rate: number; observations: string };
export type LaborTransaction = { id: string; description: string; amount: string; due_date: string; notes: string; reference: string; animal_batch: string | null; status: string };

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
// randomUUID is unavailable on browsers serving the app over ordinary HTTP.
// This is only a financial reference, never an authentication token.
function createLaborReference() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return `LABOR-SWINE-${cryptoApi.randomUUID()}`;
  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return `LABOR-SWINE-${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `LABOR-SWINE-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function laborSaveError(error: unknown): string {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return "Não foi possível salvar o lançamento. Tente novamente.";
  }
  const response = error.response as { status?: number; data?: unknown } | undefined;
  if (response?.status === 403) return "Seu usuário não tem permissão para registrar esta despesa ou criar a categoria financeira. Solicite ao administrador.";
  if (response?.status === 400 && typeof response.data === "object" && response.data !== null) {
    const messages = Object.entries(response.data).flatMap(([key, value]) => {
      const label = ({ amount: "Valor", description: "Atividade / funcionário", due_date: "Data", payment_date: "Data", category: "Categoria" } as Record<string, string>)[key];
      if (!label && key !== "detail" && key !== "non_field_errors") return [];
      const text = Array.isArray(value) ? value.filter(item => typeof item === "string").join(" ") : typeof value === "string" ? value : "";
      return text ? [`${label ? `${label}: ` : ""}${text}`] : [];
    });
    if (messages.length) return messages.join(" ");
  }
  return "Não foi possível salvar o lançamento. Tente novamente.";
}

export async function createSwineLabor(date: string, labor: LaborDetails) {
  const amount = calculateLaborTotal(labor.type, labor.people, labor.quantity, labor.rate);
  if (!amount || !laborSectors.includes(labor.sector)) throw new Error("Lançamento inválido");
  const categories = await allPages<{ id: string; name: string; category_type: string }>("/finance/categories/?page_size=100");
  let category = categories.find(item => item.name === "Mão de Obra - Suinocultura" && item.category_type === "expense");
  if (!category) category = (await apiClient.post("/finance/categories/", { name: "Mão de Obra - Suinocultura", category_type: "expense", is_active: true })).data;
  await apiClient.post("/finance/transactions/", {
    category: category!.id,
    description: `Mão de obra (${laborTypes[labor.type]}): ${labor.sector} — ${labor.activity} — ${labor.worker}`,
    amount: amount.toFixed(2), due_date: date, payment_date: date, status: "paid",
    reference: createLaborReference(), notes: JSON.stringify({ version: 1, labor }),
  });
}
