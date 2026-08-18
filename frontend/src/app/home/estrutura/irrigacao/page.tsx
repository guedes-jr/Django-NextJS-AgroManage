"use client";

import { StructureDedicatedPage } from "@/components/farm/StructureDedicatedPage";
import { Droplets } from "lucide-react";

export default function FarmIrrigacaoPage() {
  return <StructureDedicatedPage 
    category="irrigation" 
    categoryLabel="Irrigação" 
    categoryPlural="sistemas de irrigação" 
    title="Sistemas de Irrigação" 
    subtitle="Gerencie sistemas e equipamentos de distribuição de água" 
    icon={Droplets} 
    defaultName="Novo sistema de irrigação" 
    defaultMaterials={["Tubulação", "Bomba d'água", "Aspersor", "Filtro", "Registro"]} 
  />;
}
