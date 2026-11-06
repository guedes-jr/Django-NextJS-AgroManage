"use client";
import { useOrganizationLocale } from "@/lib/locale";

import { StructureDedicatedPage } from "@/components/farm/StructureDedicatedPage";
import { PiggyBank } from "lucide-react";

export default function FarmChiqueiroPage() {
  const { t } = useOrganizationLocale();
  return <StructureDedicatedPage 
    category="pigsty" 
    categoryLabel="Chiqueiro" 
    categoryPlural="chiqueiros" 
    title={t("structure.category.pigsty")}
    subtitle="Cadastre chiqueiros e estruturas de manejo para suínos" 
    icon={PiggyBank} 
    defaultName="Novo chiqueiro" 
    defaultMaterials={["Piso de concreto", "Parede de alvenaria", "Cobertura", "Bebedouro", "Comedouro"]} 
  />;
}
