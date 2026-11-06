"use client";
import { usePublicLocale } from "@/lib/publicLocale";

import Link from "next/link";

export default function TermsPage() {
  const { t } = usePublicLocale();
  return (
    <div className="auth-container">
      <div className="auth-card" style={{ maxWidth: "600px" }}>
        <div className="auth-logo">
          <h1>{t("public.termsOfUseText")}</h1>
        </div>

        <div className="legal-content" style={{ maxHeight: "400px", overflowY: "auto", padding: "1rem 0" }}>
          <h2>{t("public.1AcceptanceOfTerms")}</h2>
          <p> {t("public.byAccessingAndUsingFazendaMaisYouAgreeToComply")} </p>

          <h2>{t("public.2UseOfTheApplication")}</h2>
          <p> {t("public.fazendaMaisIsAFarmingManagementPlatformForFarmersAnd")} </p>

          <h2>{t("public.3UserAccount")}</h2>
          <p> {t("public.youAreResponsibleForMaintainingTheConfidentialityOfYourAccount")} </p>

          <h2>{t("public.4Privacy")}</h2>
          <p> {t("public.yourPrivacyIsImportantToUsOurPrivacyPolicyDescribes")} </p>

          <h2>{t("public.5LimitationOfLiability")}</h2>
          <p> {t("public.fazendaMaisShallNotBeLiableForAnyDirectIndirect")} </p>

          <h2>{t("public.6Changes")}</h2>
          <p> {t("public.weReserveTheRightToModifyTheseTermsAtAny")} </p>

          <h2>{t("public.7Contact")}</h2>
          <p> {t("public.ifYouHaveQuestionsAboutTheseTermsOfUseContact")} </p>
        </div>

        <div className="text-center mt-3">
          <Link href="/login" className="btn btn-agro"> {t("public.backToSignIn")} </Link>
        </div>
      </div>
    </div>
  );
}
