import { CattleOperationsWorkspace } from "@/components/cattle/CattleOperationsWorkspace";
export default async function Page({searchParams}:{searchParams:Promise<{tab?:string}>}) { const {tab}=await searchParams; return <CattleOperationsWorkspace initialTab={tab}/>; }
