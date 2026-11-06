"use client";
import { useOrganizationLocale } from "@/lib/locale";

import { StructureDedicatedPage } from "@/components/farm/StructureDedicatedPage";
import { Beef } from "lucide-react";

export default function FarmCurralPage() {
  const { t } = useOrganizationLocale();
  return <StructureDedicatedPage 
    category="corral" 
    categoryLabel="Curral" 
    categoryPlural="currais" 
    title={t("structure.home.corral")}
    subtitle="Cadastre currais e estruturas de manejo para bovinos" 
    icon={Beef} 
    defaultName="Novo curral" 
    defaultMaterials={["Mourão de concreto", "Tábuas", "Porteira", "Bebedouro", "Cocho"]} 
  />;
}
