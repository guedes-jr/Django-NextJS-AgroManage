"use client";

import { StructureDedicatedPage } from "@/components/farm/StructureDedicatedPage";
import { Building2 } from "lucide-react";

export default function FarmInstalacaoPage() {
  return <StructureDedicatedPage 
    category="facility" 
    categoryLabel="Instalação" 
    categoryPlural="instalações" 
    title="Instalações Gerais" 
    subtitle="Oficinas, casas, galpões e estruturas elétricas" 
    icon={Building2} 
    defaultName="Nova instalação" 
    defaultMaterials={["Alvenaria", "Cobertura", "Instalação elétrica", "Porta", "Janela"]} 
  />;
}
