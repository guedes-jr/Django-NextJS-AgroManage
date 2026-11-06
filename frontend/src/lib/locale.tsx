"use client";

import { translateMessage, type AppLanguage, type TranslationKey } from "./localeMessages";
import apiClient, { setApiLanguage } from "@/services/api";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export const organizationLanguages = [
  { value: "pt-BR", label: "Português (Brasil)", flag: "🇧🇷" },
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "es", label: "Español", flag: "🇪🇸" },
  { value: "pt-PT", label: "Português (Portugal)", flag: "🇵🇹" },
] as const;

export type { AppLanguage, TranslationKey } from "./localeMessages";

type LocaleContextValue = {
  language: AppLanguage;
  updateLanguage: (language: AppLanguage) => Promise<AppLanguage>;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function isAppLanguage(value: string): value is AppLanguage {
  return organizationLanguages.some(option => option.value === value);
}

export function OrganizationLocaleProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>("pt-BR");

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const requestVersion = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    async function refreshLanguage() {
      if (document.visibilityState === "hidden") return;
      const version = ++requestVersion.current;
      try {
        const { data } = await apiClient.get<{ language?: string }>("/organizations/me/", { signal: controller.signal });
        if (controller.signal.aborted || version !== requestVersion.current) return;
        if (!data.language || !isAppLanguage(data.language)) throw new Error("Unsupported organization language.");
        setApiLanguage(data.language);
        setLanguage(data.language);
        setLoaded(true);
        setLoadError(false);
      } catch {
        if (!controller.signal.aborted && version === requestVersion.current) setLoadError(true);
      }
    }
    void refreshLanguage();
    const onVisible = () => { void refreshLanguage(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [retry]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const updateLanguage = useCallback(async (nextLanguage: AppLanguage) => {
    ++requestVersion.current;
    const { data } = await apiClient.patch<{ language: string }>("/organizations/me/", { language: nextLanguage });
    if (!isAppLanguage(data.language)) {
      throw new Error("The server returned an unsupported organization language.");
    }
    ++requestVersion.current;
    setApiLanguage(data.language);
    setLanguage(data.language);
    return data.language;
  }, []);

  const value = useMemo<LocaleContextValue>(() => ({
    language,
    updateLanguage,
    t: (key, values) => translateMessage(language, key, values),
  }), [language, updateLanguage]);

  if (!loaded) {
    return <div className="app-workspace p-3" role={loadError ? "alert" : "status"}>
      <p>{translateMessage(language, loadError ? "workspace.couldNotLoadTheOrganizationLanguage" : "workspace.loadingOrganizationLanguage")}</p>
      {loadError && <button className="btn btn-outline-secondary" onClick={() => { setLoadError(false); setRetry(value => value + 1); }}>{translateMessage(language, "lotReport.retry")}</button>}
    </div>;
  }
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useOrganizationLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useOrganizationLocale must be used within OrganizationLocaleProvider.");
  return context;
}

/** Shared controls may also be mounted outside an organization workspace. */
export function useOptionalOrganizationLocale() {
  return useContext(LocaleContext);
}
