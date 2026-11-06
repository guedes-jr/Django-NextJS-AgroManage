import { getPublicTranslator } from "@/lib/publicLocaleServer";
import type { Metadata } from "next";
import { MarketingPage } from "@/components/marketing/MarketingPage";
export async function generateMetadata(): Promise<Metadata> { const { t } = await getPublicTranslator(); return { title: t("public.privacyFazendaMais") }; }
export default async function PrivacidadePage() {
  const { t } = await getPublicTranslator();

  return (
    <MarketingPage
      eyebrow={t("public.legal")}
      title={t("public.privacyPolicy")}
      description={t("public.howFazendaMaisHandlesAndProtectsYourOrganizationSInformation")}
    >
      <section className="legal-content marketing-container">
        <h2>{t("public.dataProcessed")}</h2>
        <p> {t("public.weProcessRegistrationOperationalAndTechnicalDataNecessaryForAuthentication")} </p>
        <h2>{t("crops.purpose")}</h2>
        <p> {t("public.informationIsUsedToProvideTheContractedServiceProtectAccounts")} </p>
        <h2>{t("public.securityAndRights")}</h2>
        <p> {t("public.weApplyAccessControlsAndOrganizationIsolationRequestsConcerningData")} </p>
      </section>
    </MarketingPage>
  );
}
