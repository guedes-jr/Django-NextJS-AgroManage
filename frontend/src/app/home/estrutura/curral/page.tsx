"use client";

import { StructureDedicatedPage } from "@/components/farm/StructureDedicatedPage";
import { Beef } from "lucide-react";

export default function FarmCurralPage() {
  return <StructureDedicatedPage 
    category="corral" 
    categoryLabel="Curral" 
    categoryPlural="currais" 
    title="Curral" 
    subtitle="Cadastre currais e estruturas de manejo para bovinos" 
    icon={Beef} 
    defaultName="Novo curral" 
    defaultMaterials={["Mourão de concreto", "Tábuas", "Porteira", "Bebedouro", "Cocho"]} 
  />;
}
