"use client";

import { FeedProductionDashboard } from "@/components/dashboard/FeedProductionDashboard";
import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";
import { useOrganizationLocale } from "@/lib/locale";

export default function Page() {
  const access = useOrganizationAccess();
  const { t } = useOrganizationLocale();
  if (!access) return <p role="status">{t("cattle.feedProduction.loadingPermissions")}</p>;
  if (!access.can_view_financial) return <p role="alert">{t("cattle.feedProduction.permissionDenied")}</p>;
  return <FeedProductionDashboard species="bovino" />;
}
