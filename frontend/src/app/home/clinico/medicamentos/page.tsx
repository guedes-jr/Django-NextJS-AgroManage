"use client";

import { useState, useEffect } from "react";
import { Loader2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { clinicalService } from "@/services/clinicalService";
import { DataTable } from "@/components/ui";
import { useOrganizationLocale } from "@/lib/locale";
import { useToast } from "@/components/ui/Toast";

export default function MedicamentosPage() {
  const { language, t } = useOrganizationLocale();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [medications, setMedications] = useState<any[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const medsRes = await clinicalService.getMedications();
      setMedications(medsRes.data.results || medsRes.data || []);
    } catch (err) {
      console.error("Erro ao carregar medicamentos:", err);
      showToast(t("clinical.loadMedicationsFailed"), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    return new Date(`${dateStr.split("T")[0]}T00:00:00`).toLocaleDateString(language);
  };

  const columns = [
    { key: "medication_name", label: t("clinical.medication") },
    { key: "quantity_available", label: t("clinical.stock") },
    { key: "expiry_date", label: t("clinical.expiry"), render: (v: any) => formatDate(v) },
    { key: "supplier", label: t("clinical.supplier"), render: (v: any) => v || "—" }
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small" style={{ color: "var(--muted-foreground)" }}>
          <Link href="/home" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>{t("sidebar.dashboard")}</Link>
          <ChevronRight size={14} />
          <Link href="/home/clinico" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>{t("clinical.dashboard")}</Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">{t("clinical.medications")}</span>
        </nav>
      </div>

      <div className="mb-4">
        <h1 className="fw-black mb-1" style={{ fontSize: "2.1rem", letterSpacing: "-0.03em" }}>
          {t("clinical.medicationStockTitle")}
        </h1>
        <p className="text-muted-foreground mb-0">
          {t("clinical.medicationStockDescription")}
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
          emptyText={t("clinical.medicationEmpty")}
        />
      )}
    </div>
  );
}
