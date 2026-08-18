"use client";

import { StructureDedicatedPage } from "@/components/farm/StructureDedicatedPage";
import { Waves } from "lucide-react";

export default function FarmReservatorioPage() {
  return <StructureDedicatedPage 
    category="water_reservoir" 
    categoryLabel="Reservatório" 
    categoryPlural="reservatórios" 
    title="Reservatórios de Água" 
    subtitle="Caixas, açudes, reservatórios e sistemas de captação" 
    icon={Waves} 
    defaultName="Novo reservatório" 
    defaultMaterials={["Reservatório", "Tubulação", "Bomba d'água", "Boia", "Registro"]} 
  />;
}
