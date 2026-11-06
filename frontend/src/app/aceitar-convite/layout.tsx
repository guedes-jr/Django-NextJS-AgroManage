import { PublicLocaleProvider } from "@/lib/publicLocale";
import { getPublicTranslator } from "@/lib/publicLocaleServer";

export default async function InvitationLayout({ children }: { children: React.ReactNode }) {
  const { language } = await getPublicTranslator();
  return <PublicLocaleProvider initialLanguage={language}>{children}</PublicLocaleProvider>;
}
