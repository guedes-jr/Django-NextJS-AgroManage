import { getPublicTranslator } from "@/lib/publicLocaleServer";
import type { Metadata } from "next";
import { SegmentLanding } from "@/components/marketing/SegmentLanding";
export async function generateMetadata(): Promise<Metadata> { const { t } = await getPublicTranslator(); return {
  title: t("public.cropManagementSoftwareFazendaMais"),
  description:
    t("public.planPlantingInputsOperationsHarvestsAndCropCosts"),
}; }
export default async function Page() {
  const { t } = await getPublicTranslator();

  return (
    <SegmentLanding trackingLabel="Gestão agrícola"
      eyebrow={t("public.cropManagement")}
      title={t("public.planTheSeasonAndTrackEveryFieldOperation")}
      description={t("public.keepActivitiesInputsTeamsAndCostsConnectedFromSoilPreparation")}
      benefits={[
        t("public.planningByCropAndPlot"),
        t("public.applicationTraceability"),
        t("public.inputAndServiceTracking"),
        t("public.financialResultsPerProduction"),
      ]}
      features={[
        [
          t("public.planning"),
          t("public.setUpCropsSectorsCalendarsAndAssignees"),
        ],
        [t("public.inputs"), t("public.trackSeedsFertilizersAndPesticides")],
        [t("swine.home.operations"), t("public.recordPreparationPlantingIrrigationAndLabor")],
        [
          t("public.technicalAssistance"),
          t("public.centralizeAnalysesAndAgronomicGuidance"),
        ],
        [t("plantations.history.module.colheita"), t("public.recordYieldsAndSeasonHistory")],
        [t("crops.costs"), t("public.consolidateProductionExpensesAndIncome")],
      ]}
    />
  );
}
