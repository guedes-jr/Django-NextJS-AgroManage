"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FeedProductionDashboard } from "@/components/dashboard/FeedProductionDashboard";
import { SwineFeedingDashboard } from "@/components/dashboard/SwineFeedingDashboard";

function SuinosRacaoContent() {
  const searchParams = useSearchParams();
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
