"use client";

import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FeedProductionDashboard } from "@/components/dashboard/FeedProductionDashboard";
import { SwineFeedingDashboard } from "@/components/dashboard/SwineFeedingDashboard";
import { useOrganizationLocale } from "@/lib/locale";

function SuinosRacaoContent() {
  const searchParams = useSearchParams();
  const access = useOrganizationAccess();
  const { t } = useOrganizationLocale();
  if (searchParams.get("tab") === "producao" && access?.role === "operator") return <div className="alert alert-info">{t("swine.feed.permissionDenied")}</div>;
  return searchParams.get("tab") === "producao"
    ? <FeedProductionDashboard species="suino" showHeader />
    : <SwineFeedingDashboard />;
}

export default function SuinosRacaoPage() {
  const { t } = useOrganizationLocale();
  return (
    <Suspense fallback={<div className="p-5 text-center text-muted-foreground">{t("swine.feed.loading")}</div>}>
      <SuinosRacaoContent />
    </Suspense>
  );
}
