"use client";
import { useOrganizationLocale } from "@/lib/locale";

import { Suspense } from "react";
import { ProdutosDashboard } from "@/components/dashboard/ProdutosDashboard";

export default function ProdutosPage() {
  const { t } = useOrganizationLocale();
  return (
    <Suspense fallback={<div className="p-5 text-center text-muted">{t("profile.loading")}</div>}>
      <ProdutosDashboard />
    </Suspense>
  );
}