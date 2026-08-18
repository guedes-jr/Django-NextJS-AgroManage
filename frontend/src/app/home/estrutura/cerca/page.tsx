"use client";

import { StructureDedicatedPage } from "@/components/farm/StructureDedicatedPage";
import { PanelsTopLeft } from "lucide-react";

export default function FarmCercaPage() {
  return <StructureDedicatedPage 
    category="fence" 
    categoryLabel="Cerca" 
    categoryPlural="cercas" 
    title="Cercas e Divisões" 
    subtitle="Cercas, porteiras e divisões internas da propriedade" 
    icon={PanelsTopLeft} 
    defaultName="Nova cerca" 
    defaultMaterials={["Mourão", "Arame", "Grampo", "Porteira", "Esticador"]} 
  />;
}
