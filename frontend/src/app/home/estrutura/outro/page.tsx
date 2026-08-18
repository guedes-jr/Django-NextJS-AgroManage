"use client";

import { StructureDedicatedPage } from "@/components/farm/StructureDedicatedPage";
import { Ellipsis } from "lucide-react";

export default function FarmOutroPage() {
  return <StructureDedicatedPage 
    category="other" 
    categoryLabel="Outra estrutura" 
    categoryPlural="outras estruturas" 
    title="Outras Estruturas" 
    subtitle="Outras estruturas não enquadradas nas categorias padrão" 
    icon={Ellipsis} 
    defaultName="Nova estrutura" 
    defaultMaterials={["Material de construção", "Mão de obra", "Equipamento"]} 
  />;
}
