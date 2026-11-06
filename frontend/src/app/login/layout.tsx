import { PublicLocaleProvider } from "@/lib/publicLocale";
import { getPublicTranslator } from "@/lib/publicLocaleServer";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { language } = await getPublicTranslator();
  return <PublicLocaleProvider initialLanguage={language}>{children}</PublicLocaleProvider>;
}
