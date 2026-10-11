"use client";

import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FeedProductionDashboard } from "@/components/dashboard/FeedProductionDashboard";
import { SwineFeedingDashboard } from "@/components/dashboard/SwineFeedingDashboard";

function SuinosRacaoContent() {
  const searchParams = useSearchParams();
  const access = useOrganizationAccess();
  if (searchParams.get("tab") === "producao" && access?.role === "operator") return <div className="alert alert-info">A produção de ração exige um gerente ou administrador. Acesse a aba de alimentação para registrar o consumo.</div>;
  return searchParams.get("tab") === "producao"
    ? <FeedProductionDashboard species="suino" showHeader />
    : <SwineFeedingDashboard />;
}

export default function SuinosRacaoPage() {
  return (
    <Suspense fallback={<div className="p-5 text-center text-muted-foreground">Carregando alimentação...</div>}>
      <SuinosRacaoContent />
    </Suspense>
  );
}
