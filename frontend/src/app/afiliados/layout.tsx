import { PublicLocaleProvider } from "@/lib/publicLocale";
import { getPublicTranslator } from "@/lib/publicLocaleServer";

export default async function AffiliateLayout({ children }: { children: React.ReactNode }) {
  const { language } = await getPublicTranslator();
  return <PublicLocaleProvider initialLanguage={language}>{children}</PublicLocaleProvider>;
}
