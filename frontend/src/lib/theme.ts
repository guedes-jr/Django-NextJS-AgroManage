import { STORAGE_KEYS } from "@/lib/constants";

export const THEMES = ["light", "dark", "contrast"] as const;

export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "light";

export const THEME_LABELS: Record<Theme, string> = {
  light: "Padrão",
  dark: "Escuro",
  contrast: "Alto contraste",
};

export const isTheme = (value: unknown): value is Theme =>
  typeof value === "string" && THEMES.includes(value as Theme);

export const getStoredTheme = (): Theme => {
  if (typeof window === "undefined") return DEFAULT_THEME;

  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
  if (isTheme(savedTheme)) return savedTheme;

  try {
    const savedUser = localStorage.getItem(STORAGE_KEYS.user);
    const parsedUser = savedUser ? JSON.parse(savedUser) : null;
    if (isTheme(parsedUser?.theme)) return parsedUser.theme;
  } catch {
    // Keep the default theme when localStorage has stale JSON.
  }

  return DEFAULT_THEME;
};

export const applyTheme = (theme: Theme) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.bsTheme = theme === "dark" ? "dark" : "light";
  root.style.colorScheme = theme === "dark" ? "dark" : "light";
};

export const persistTheme = (theme: Theme) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.theme, theme);
};
