"use client";

import { useState, useEffect } from "react";
import { Loader2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { clinicalService } from "@/services/clinicalService";
import { DataTable } from "@/components/ui";

export default function MedicamentosPage() {
  const [loading, setLoading] = useState(true);
  const [medications, setMedications] = useState<any[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const medsRes = await clinicalService.getMedications();
      setMedications(medsRes.data.results || medsRes.data || []);
    } catch (err) {
      console.error("Erro ao carregar medicamentos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    const [y, m, d] = dateStr.split('T')[0].split('-');
    return `${d}/${m}/${y}`;
  };

  const columns = [
    { key: "medication_name", label: "Medicamento" },
    { key: "quantity_available", label: "Estoque" },
    { key: "expiry_date", label: "Vencimento", render: (v: any) => formatDate(v) },
    { key: "supplier", label: "Fornecedor", render: (v: any) => v || "—" }
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small" style={{ color: "var(--muted-foreground)" }}>
          <Link href="/home" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>Dashboard</Link>
          <ChevronRight size={14} />
          <Link href="/home/clinico" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>Clínico/Veterinário</Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">Medicamentos</span>
        </nav>
      </div>

      <div className="mb-4">
        <h1 className="fw-black mb-1" style={{ fontSize: "2.1rem", letterSpacing: "-0.03em" }}>
          Estoque de Medicamentos
        </h1>
        <p className="text-muted-foreground mb-0">
          Controle do inventário da farmácia veterinária.
        </p>
      </div>

      {loading ? (
        <div className="d-flex justify-content-center py-5">
          <Loader2 className="spin-animation text-muted" size={32} />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={medications}
          emptyIcon="💊"
          emptyText="Nenhum medicamento registrado no estoque."
        />
      )}
    </div>
  );
}
