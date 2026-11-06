"use client";

import { setApiLanguage } from "@/services/api";
import { resolvePublicLanguage, translatePublicMessage, type PublicTranslator, type PublicLanguage } from "./publicMessages";
export type { PublicLanguage } from "./publicMessages";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";


type PublicLocaleContextValue = {
  language: PublicLanguage;
  t: PublicTranslator;
};
const PublicLocaleContext = createContext<PublicLocaleContextValue | null>(null);

export function PublicLocaleProvider({ children, initialLanguage }: { children: React.ReactNode; initialLanguage?: PublicLanguage }) {
  const [language, setLanguage] = useState<PublicLanguage>(initialLanguage ?? "pt-BR");
  useEffect(() => {
    const timer = window.setTimeout(() => { const nextLanguage = initialLanguage ?? resolvePublicLanguage((navigator.languages ?? [navigator.language]).join(",")); setApiLanguage(nextLanguage); setLanguage(nextLanguage); }, 0);
    return () => window.clearTimeout(timer);
  }, [initialLanguage]);
  useLayoutEffect(() => {
    setApiLanguage(language);
    document.documentElement.lang = language;
  }, [language]);
  const value = useMemo<PublicLocaleContextValue>(() => ({
    language,
    t: (key, values) => translatePublicMessage(language, key, values),
  }), [language]);
  return <PublicLocaleContext.Provider value={value}>{children}</PublicLocaleContext.Provider>;
}

export function usePublicLocale() {
  const context = useContext(PublicLocaleContext);
  if (!context) throw new Error("usePublicLocale must be used within PublicLocaleProvider.");
  return context;
}

export function useOptionalPublicLocale() {
  return useContext(PublicLocaleContext);
}
