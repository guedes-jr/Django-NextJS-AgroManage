import { getPublicTranslator } from "@/lib/publicLocaleServer";
import type { Metadata } from "next";
import { SegmentLanding } from "@/components/marketing/SegmentLanding";
export async function generateMetadata(): Promise<Metadata> { const { t } = await getPublicTranslator(); return {
  title: t("public.livestockManagementSoftwareFazendaMais"),
  description:
    t("public.trackHerdsManagementHealthFeedingAndLivestockCosts"),
}; }
export default async function Page() {
  const { t } = await getPublicTranslator();

  return (
    <SegmentLanding trackingLabel="Gestão pecuária"
      eyebrow={t("public.livestockManagement")}
      title={t("public.betterDecisionsStartWithAWellMonitoredHerd")}
      description={t("public.bringAnimalRecordsBatchesReproductionHealthFeedingAndCostsInto")}
      benefits={[
        t("public.individualAndBatchHistory"),
        t("public.costsConnectedToManagement"),
        t("public.healthAndProductionIndicators"),
        t("public.aTeamWithClearResponsibilities"),
      ]}
      features={[
        [
          t("public.registrationAndBatches"),
          t("public.organizeAnimalsIdentificationWeightCategoriesAndMovements"),
        ],
        [t("public.animalHealth"), t("public.recordConsultationsTestsVaccinesAndMedicines")],
        [t("cattleReproduction.production"), t("public.trackMatingsDiagnosesAndBirths")],
        [t("animalDetail.feed"), t("public.trackFeedFormulasConsumptionAndStock")],
        [t("public.livestockCosts"), t("public.linkExpensesToActivitiesAndPeriods")],
        [t("affiliate.reports"), t("public.trackProgressOccurrencesAndResults")],
      ]}
    />
  );
}
