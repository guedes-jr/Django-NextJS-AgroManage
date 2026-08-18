"use client";

import { StructureDedicatedPage } from "@/components/farm/StructureDedicatedPage";
import { Bird } from "lucide-react";

export default function FarmGalinheiroPage() {
  return <StructureDedicatedPage 
    category="poultry_house" 
    categoryLabel="Galinheiro" 
    categoryPlural="galinheiros" 
    title="Galinheiro" 
    subtitle="Cadastre galinheiros, instalações de postura, corte e reprodução" 
    icon={Bird} 
    defaultName="Novo galinheiro" 
    defaultMaterials={["Tela galvanizada", "Cobertura", "Poleiro", "Bebedouro", "Comedouro"]} 
  />;
}
