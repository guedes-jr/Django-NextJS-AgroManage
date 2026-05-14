"use client";

import Link from "next/link";
import { ChevronRight, Pill } from "lucide-react";

export default function MedicamentosPage() {
  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small" style={{ color: "var(--muted-foreground)" }}>
          <Link href="/home" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>Dashboard</Link>
          <ChevronRight size={14} />
          <Link href="/home/clinico" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>Clínico</Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">Medicamentos</span>
        </nav>
      </div>
      <div className="d-flex align-items-center gap-3 mb-4">
        <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 48, height: 48, background: "oklch(0.96 0.04 290)" }}>
          <Pill size={24} className="text-info" />
        </div>
        <div>
          <h1 className="fw-black mb-1" style={{ fontSize: "1.6rem", letterSpacing: "-0.03em" }}>
            Medicamentos
          </h1>
          <p className="text-muted-foreground small mb-0">Estoque e controle de medicamentos veterinários</p>
        </div>
      </div>
      <div className="dashboard-card p-4 shadow-sm" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
        <p className="text-muted-foreground small mb-0">Nenhum medicamento registrado.</p>
      </div>
    </div>
  );
}
