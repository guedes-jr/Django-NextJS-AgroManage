import { CattleWorkspace } from "@/components/cattle/CattleWorkspace";

export default async function Page({ searchParams }: { searchParams: Promise<{ group?: string; production?: string }> }) {
  const { group, production } = await searchParams;
  return <CattleWorkspace view="animals" production={production === "dairy" ? "dairy" : "beef"} youngFemales={group === "young-females"} />;
}
