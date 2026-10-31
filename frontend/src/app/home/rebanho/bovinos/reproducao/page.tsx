import { CattleWorkspace } from "@/components/cattle/CattleWorkspace";

export default async function Page({ searchParams }: { searchParams: Promise<{ production?: string; tab?: string }> }) {
  const { production, tab } = await searchParams;
  const selected = tab && ["dashboard", "heifers", "cows", "pregnant", "lactating", "dry"].includes(tab) ? tab : "dashboard";
  return <CattleWorkspace key={production === "dairy" ? "dairy" : "beef"} initialReproductionTab={selected} view="reproduction" production={production === "dairy" ? "dairy" : "beef"} />;
}
