import { getPublicTranslator } from "@/lib/publicLocaleServer";
import type { Metadata } from "next";
import { MarketingPage } from "@/components/marketing/MarketingPage";
export async function generateMetadata(): Promise<Metadata> { const { t } = await getPublicTranslator(); return { title: t("public.termsOfUseFazendaMais") }; }
export default async function TermosPage() {
  const { t } = await getPublicTranslator();

  return (
    <MarketingPage
      eyebrow={t("public.legal")}
      title={t("public.termsOfUse")}
      description={t("public.generalConditionsForUsingFazendaMaisServices")}
    >
      <section className="legal-content marketing-container">
        <h2>{t("public.platformUse")}</h2>
        <p> {t("public.accessMustBeByUsersAuthorizedByTheContractingOrganization")} </p>
        <h2>{t("public.dataAndAvailability")}</h2>
        <p> {t("public.registeredDataRemainsLinkedToTheResponsibleOrganizationAvailabilitySupport")} </p>
        <h2>{t("public.responsibilities")}</h2>
        <p> {t("public.fazendaMaisSupportsManagementAndDecisionMakingWithoutReplacingTechnical")} </p>
      </section>
    </MarketingPage>
  );
}
