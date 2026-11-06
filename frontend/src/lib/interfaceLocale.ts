"use client";

import { useOptionalOrganizationLocale } from "./locale";
import { useOptionalPublicLocale } from "./publicLocale";
import { translateMessage, type AppLanguage, type TranslationKey, type TranslationValues } from "./localeMessages";

type InterfaceLocale = { language: AppLanguage; t: (key: TranslationKey, values?: TranslationValues) => string };
const defaultLocale: InterfaceLocale = { language: "pt-BR", t: (key, values) => translateMessage("pt-BR", key, values) };

/** Reuse the active provider; platform-only screens retain their Portuguese default. */
export function useInterfaceLocale(): InterfaceLocale {
  const organization = useOptionalOrganizationLocale();
  const publicLocale = useOptionalPublicLocale();
  return organization ?? publicLocale ?? defaultLocale;
}
