/**
 * Application-wide constants.
 */

export const APP_NAME = "AgroManage";
export const APP_VERSION = "0.1.0";

// ─── API ─────────────────────────────────────────────────────────────────────
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

// ─── Pagination ───────────────────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

// ─── Date ─────────────────────────────────────────────────────────────────────
export const DATE_FORMAT = "dd/MM/yyyy";
export const DATETIME_FORMAT = "dd/MM/yyyy HH:mm";

// ─── Locale ───────────────────────────────────────────────────────────────────
export const LOCALE = "pt-BR";
export const CURRENCY = "BRL";

// ─── Routes ───────────────────────────────────────────────────────────────────
export const ROUTES = {
  home: "/",
  login: "/login",
  dashboard: "/dashboard",
  farms: "/farms",
  livestock: "/livestock",
  crops: "/crops",
  inventory: "/inventory",
  finance: "/finance",
  reports: "/reports",
  settings: "/settings",
} as const;

// ─── Storage keys ─────────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  accessToken: "access_token",
  refreshToken: "refresh_token",
  user: "user",
  theme: "theme",
} as const;
