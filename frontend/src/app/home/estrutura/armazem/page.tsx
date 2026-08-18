"use client";

import { StructureDedicatedPage } from "@/components/farm/StructureDedicatedPage";
import { Warehouse } from "lucide-react";

export default function FarmArmazemPage() {
  return <StructureDedicatedPage 
    category="warehouse" 
    categoryLabel="Depósito ou armazém" 
    categoryPlural="depósitos e armazéns" 
    title="Depósitos e Armazéns" 
    subtitle="Armazenamento de grãos, insumos e materiais" 
    icon={Warehouse} 
    defaultName="Novo depósito ou armazém" 
    defaultMaterials={["Piso de concreto", "Estrutura metálica", "Cobertura", "Portão", "Prateleira"]} 
  />;
}
