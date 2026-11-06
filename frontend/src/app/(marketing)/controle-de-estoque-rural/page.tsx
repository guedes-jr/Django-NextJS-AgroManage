import { getPublicTranslator } from "@/lib/publicLocaleServer";
import type { Metadata } from "next";
import { SegmentLanding } from "@/components/marketing/SegmentLanding";
export async function generateMetadata(): Promise<Metadata> { const { t } = await getPublicTranslator(); return {
  title: t("public.farmStockControlFazendaMais"),
  description:
    t("public.trackFarmInputsProductsSuppliersAndMovements"),
}; }
export default async function Page() {
  const { t } = await getPublicTranslator();

  return (
    <SegmentLanding trackingLabel="Estoque rural"
      eyebrow={t("public.farmStock")}
      title={t("public.knowWhatCameInWhatWentOutAndWhatNeeds")}
      description={t("public.reduceLossesAndLastMinuteFixesWithTraceableMovementsAlerts")}
      benefits={[
        t("public.updatedBalancePerProduct"),
        t("public.minimumStockAlerts"),
        t("public.inboundAndOutboundHistory"),
        t("public.purchasesLinkedToOperations"),
      ]}
      features={[
        [t("plantations.agronomist.products"), t("public.registerUnitsCategoriesAndLimits")],
        [t("dashboard.movements"), t("public.recordInboundOutboundAndAdjustmentMovements")],
        [t("swine.home.activeAlerts"), t("public.planImportantReplenishmentsAhead")],
        [t("inventory.home.suppliers"), t("public.organizeContactsAndCommercialHistory")],
        [t("public.feed"), t("public.trackFormulasAndInHouseProduction")],
        [t("crops.costs"), t("public.trackStockValueAndConsumption")],
      ]}
    />
  );
}
