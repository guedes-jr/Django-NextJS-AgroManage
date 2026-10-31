import { CattleWorkspace } from "@/components/cattle/CattleWorkspace";

export default async function Page({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const { group } = await searchParams;
  return <CattleWorkspace view="animals" youngFemales={group === "young-females"} />;
}
