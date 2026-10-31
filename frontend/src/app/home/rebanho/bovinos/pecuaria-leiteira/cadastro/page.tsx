import { CattleWorkspace } from "@/components/cattle/CattleWorkspace";

export default async function Page({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const { group } = await searchParams;
  return <CattleWorkspace view="animals" production="dairy" dairyAnimals youngFemales={group === "young-females"} />;
}

