import { getPublicTranslator } from "@/lib/publicLocaleServer";
import type { Metadata } from "next";
import { SegmentLanding } from "@/components/marketing/SegmentLanding";
export async function generateMetadata(): Promise<Metadata> { const { t } = await getPublicTranslator(); return {
  title: t("public.multiFarmManagementFazendaMais"),
  description:
    t("public.consolidateTeamsFarmsAndIndicatorsInOneFarmingPlatform"),
}; }
export default async function Page() {
  const { t } = await getPublicTranslator();

  return (
    <SegmentLanding trackingLabel="Operação multifazendas"
      eyebrow={t("public.multiFarmOperation")}
      title={t("public.aConsolidatedViewWithControlOverEveryUnit")}
      description={t("public.standardizeProcessesAssignAccessAndMonitorDifferentPropertiesInOne")}
      benefits={[
        t("public.perFarmAndConsolidatedViews"),
        t("public.rolesAndPermissionsPerTeam"),
        t("public.standardizedProcesses"),
        t("public.comparableIndicators"),
      ]}
      features={[
        [t("public.units"), t("public.organizePropertiesAndInfrastructure")],
        [t("public.team"), t("public.defineAccessAndResponsibilities")],
        [t("poultryReproduction.productionStatus"), t("public.trackOperationsPerUnit")],
        [t("animalDetail.stock"), t("public.separateAndConsolidateMovements")],
        [t("notifications.category.finance"), t("public.compareCostsAndResults")],
        [t("public.governance"), t("public.maintainHistoryAndAuditTrails")],
      ]}
    />
  );
}
