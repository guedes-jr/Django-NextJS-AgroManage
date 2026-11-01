import { CattleWorkspace } from "@/components/cattle/CattleWorkspace";

export default async function Page({searchParams}:{searchParams:Promise<{production?:string}>}) {
  const {production}=await searchParams;
  return <CattleWorkspace production={production === "dairy" ? "dairy" : production === "beef" ? "beef" : undefined} view="sales" />;
}
