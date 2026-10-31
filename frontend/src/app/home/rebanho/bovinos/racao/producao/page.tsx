"use client";

import { FeedProductionDashboard } from "@/components/dashboard/FeedProductionDashboard";
import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";

export default function Page() {
  const access = useOrganizationAccess();
  if (!access) return <p role="status">Carregando permissões...</p>;
  if (!access.can_view_financial) return <p role="alert">A produção de ração exige acesso de gerente ou administrador.</p>;
  return <FeedProductionDashboard species="bovino" />;
}
