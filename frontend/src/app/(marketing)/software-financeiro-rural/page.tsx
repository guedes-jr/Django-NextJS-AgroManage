import { getPublicTranslator } from "@/lib/publicLocaleServer";
import type { Metadata } from "next";
import { SegmentLanding } from "@/components/marketing/SegmentLanding";
export async function generateMetadata(): Promise<Metadata> { const { t } = await getPublicTranslator(); return {
  title: t("public.farmFinanceSoftwareFazendaMais"),
  description:
    t("public.trackPropertyIncomeExpensesAndFinancialResults"),
}; }
export default async function Page() {
  const { t } = await getPublicTranslator();

  return (
    <SegmentLanding trackingLabel="Financeiro rural"
      eyebrow={t("public.farmFinances")}
      title={t("public.understandWhereThePropertySMoneyGoes")}
      description={t("public.centralizeIncomeExpensesAccountsAndIndicatorsToPlanWithMore")}
      benefits={[
        t("public.organizedFinancialFlow"),
        t("public.categoriesSuitedToTheOperation"),
        t("public.costsAndIncomeOverview"),
        t("public.planningIndicators"),
      ]}
      features={[
        [t("public.entries"), t("public.recordIncomeAndExpensesInContext")],
        [t("public.accounts"), t("public.organizeDifferentCashAccountsAndBanks")],
        [t("public.categories"), t("public.classifyEachMovement")],
        [t("public.reconciliation"), t("public.reviewAmountsAndPeriods")],
        [t("public.indicators"), t("public.trackBalancesAndTrends")],
        [t("affiliate.reports"), t("public.exportInformationForAnalysis")],
      ]}
    />
  );
}
