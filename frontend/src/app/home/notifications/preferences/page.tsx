"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NotificationPreferences } from "@/components/notifications";
import { useOrganizationLocale } from "@/lib/locale";

export default function NotificationPreferencesPage() {
  const { t } = useOrganizationLocale();
  return <div style={{maxWidth:760,margin:"0 auto"}}>
    <Link href="/home/notifications" className="d-inline-flex align-items-center gap-2 text-decoration-none small mb-4"><ArrowLeft size={16}/> {t("notificationPreferences.back")}</Link>
    <div className="mb-4"><div className="text-primary text-uppercase fw-bold" style={{fontSize:".68rem",letterSpacing:".1em"}}>{t("notificationPreferences.channels")}</div><h1 className="h2 fw-black mt-1 mb-2">{t("notificationPreferences.title")}</h1><p className="text-muted small">{t("notificationPreferences.description")}</p></div>
    <NotificationPreferences />
  </div>;
}
