import { getPublicTranslator } from "@/lib/publicLocaleServer";
import type { Metadata } from "next";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { PlanBuilder } from "@/components/marketing/PlanBuilder";

export async function generateMetadata(): Promise<Metadata> { const { t } = await getPublicTranslator(); return {
  title: t("public.buildYourPlanFazendaMais"),
  description:
    t("public.combineYourOperationSSegmentsAndFindTheFazendaMais"),
}; }

export default function PlanosPage() {

  return (
    <>
      <MarketingHeader />
      <main id="marketing-main">
        <PlanBuilder />
      </main>
      <MarketingFooter />
    </>
  );
}
