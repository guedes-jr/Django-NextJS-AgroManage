/* Shared helpers for the harvest and production sales screens. */

/** Parses "30.000,50", "30000.5" or numbers into a number (0 when empty/invalid). */
export function decimalValue(value?: string | number | null): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = value.replace(/\s/g, "");
  if (!raw) return 0;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized = raw;
  if (lastComma !== -1 && lastDot !== -1) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousand = decimal === "," ? "." : ",";
    normalized = raw.replaceAll(thousand, "").replace(decimal, ".");
  } else if (lastComma !== -1) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (lastDot !== -1 && raw.split(".").length > 2) {
    normalized = raw.replace(/\./g, "");
  }
  const parsed = Number.parseFloat(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export const formatNumber = (value: number, language: string, digits = 2) =>
  value.toLocaleString(language, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const formatInteger = (value: number, language: string) =>
  value.toLocaleString(language, { maximumFractionDigits: 0 });

export const formatMoney = (value: number, language: string) =>
  value.toLocaleString(language, { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

export const formatDate = (value: string, language: string) =>
  value ? new Date(`${value}T12:00:00`).toLocaleDateString(language) : "-";

export const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export const monthBounds = (reference = new Date()) => {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(year, month + 1, 0).getDate();
  return { from: `${year}-${pad(month + 1)}-01`, to: `${year}-${pad(month + 1)}-${pad(last)}` };
};

export const extractArray = <T,>(data: unknown): T[] => {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && "results" in data) {
    const results = (data as { results?: unknown }).results;
    return Array.isArray(results) ? (results as T[]) : [];
  }
  return [];
};

const normalize = (value: string) =>
  value.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const CROP_IMAGES: Array<[string[], string]> = [
  [["milho", "corn"], "/images/crops/cultures/corn.png"],
  [["soja", "soybean"], "/images/crops/cultures/soybean.png"],
  [["feijao", "bean"], "/images/crops/cultures/bean.png"],
  [["sorgo", "sorghum"], "/images/crops/cultures/sorghum.png"],
  [["milheto", "millet"], "/images/crops/cultures/millet.png"],
  [["melancia", "watermelon"], "/images/crops/cultures/watermelon.png"],
];

/** Culture picture for a crop name, or null when there is none. */
export function cropImage(name?: string | null): string | null {
  const key = normalize(name || "");
  if (!key) return null;
  return CROP_IMAGES.find(([keys]) => keys.some((item) => key.includes(item)))?.[1] ?? null;
}
