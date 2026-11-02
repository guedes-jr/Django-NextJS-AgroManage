import { redirect } from "next/navigation";
import { cattleHome, type CattleProduction } from "@/services/cattleNavigation";
import { CattleWorkspace, type CattleView } from "./CattleWorkspace";
import { CattleOperationsWorkspace } from "./CattleOperationsWorkspace";
import { DairyHome } from "./DairyHome";
import { MilkProduction } from "./MilkProduction";
import DailyFeedingPage from "./CattleDailyFeedingPage";
import FeedProductionPage from "./CattleFeedProductionPage";
import { FeedFormulaManagerDashboard } from "@/components/dashboard/FeedFormulaManagerDashboard";

type View = CattleView | "operations" | "daily-feeding" | "feed-production" | "formulas" | "animal-alias";
export function cattleSegmentPage(production: CattleProduction, view: View) {
  return async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const params = await searchParams;
    const tab = typeof params.tab === "string" ? params.tab : undefined;
    if (view === "animal-alias") {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (key === "production") continue;
        if (Array.isArray(value)) value.forEach(item => query.append(key, item));
        else if (value !== undefined) query.set(key, value);
      }
      redirect(`${cattleHome(production)}/cadastro${query.size ? `?${query}` : ""}`);
    }
    if (view === "overview" && production === "dairy") return <DairyHome />;
    if (view === "operations") return <CattleOperationsWorkspace production={production} initialTab={tab} />;
    if (view === "daily-feeding") return <DailyFeedingPage />;
    if (view === "feed-production") return <FeedProductionPage />;
    if (view === "formulas") return <FeedFormulaManagerDashboard species="bovino" />;
    if (view === "milk") return <MilkProduction />;
    const selected = tab && ["dashboard", "heifers", "cows", "pregnant", "lactating", "dry"].includes(tab) ? tab : "dashboard";
    return <CattleWorkspace key={production} view={view} production={production}
      initialMedication={view === "management" && params.launch === "medication"}
      dairyAnimals={view === "animals" && production === "dairy"}
      youngFemales={params.group === "young-females"} initialReproductionTab={selected} />;
  };
}
