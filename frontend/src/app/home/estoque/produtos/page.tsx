"use client";

import { Suspense } from "react";
import { ProdutosDashboard } from "@/components/dashboard/ProdutosDashboard";

export default function ProdutosPage() {
  return (
    <Suspense fallback={<div className="p-5 text-center text-muted">Carregando...</div>}>
      <ProdutosDashboard />
    </Suspense>
  );
}