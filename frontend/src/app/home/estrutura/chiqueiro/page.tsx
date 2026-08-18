"use client";

import { StructureDedicatedPage } from "@/components/farm/StructureDedicatedPage";
import { PiggyBank } from "lucide-react";

export default function FarmChiqueiroPage() {
  return <StructureDedicatedPage 
    category="pigsty" 
    categoryLabel="Chiqueiro" 
    categoryPlural="chiqueiros" 
    title="Chiqueiro" 
    subtitle="Cadastre chiqueiros e estruturas de manejo para suínos" 
    icon={PiggyBank} 
    defaultName="Novo chiqueiro" 
    defaultMaterials={["Piso de concreto", "Parede de alvenaria", "Cobertura", "Bebedouro", "Comedouro"]} 
  />;
}
