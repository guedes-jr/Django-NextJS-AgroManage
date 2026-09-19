import type { Metadata } from "next";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { PlanBuilder } from "@/components/marketing/PlanBuilder";

export const metadata: Metadata = { title:"Monte seu plano | Fazenda Mais", description:"Combine os segmentos da sua operação e encontre o plano Fazenda Mais ideal para o seu porte." };

export default function PlanosPage() {
  return <><MarketingHeader/><main id="marketing-main"><PlanBuilder/></main><MarketingFooter/></>;
}
