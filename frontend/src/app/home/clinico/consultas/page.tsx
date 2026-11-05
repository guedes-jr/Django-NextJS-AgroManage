"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { clinicalService } from "@/services/clinicalService";
import { DataTable } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ClinicalModal, ModalField } from "@/components/clinico/ClinicalModal";
import { useOrganizationLocale } from "@/lib/locale";

export default function ConsultasPage() {
  const { showToast } = useToast();
  const { language, t } = useOrganizationLocale();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<any[]>([]);
  const [diseases, setDiseases] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [recordsRes, diseasesRes] = await Promise.all([
        clinicalService.getClinicalRecords(),
        clinicalService.getDiseases(),
      ]);
      setRecords(recordsRes.data.results || recordsRes.data || []);
      setDiseases(diseasesRes.data.results || diseasesRes.data || []);
    } catch (err) {
      console.error("Erro ao carregar consultas:", err);
      showToast(t("clinical.loadConsultationsFailed"), "error");
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
    { key: "record_date", label: t("clinical.date"), render: (v: any) => formatDate(v) },
    { key: "animal_identifier", label: t("clinical.animal") },
    { key: "disease_name", label: t("clinical.diagnosis"), render: (v: any) => v || "—" },
    { key: "severity", label: t("clinical.severity"), render: (v: any) => {
        const map: Record<string, string> = { low: t("clinical.low"), medium: t("clinical.medium"), high: t("clinical.high"), critical: t("clinical.critical") };
        return map[v as string] || v;
    }},
    { key: "veterinarian", label: t("clinical.veterinarian"), render: (v: any) => v || "—" }
  ];

  const handleCreateRecord = async (data: any) => {
    try {
      const payload = {
        animal_identifier: data.animal_identifier,
        record_type: data.record_type,
        record_date: data.record_date,
        severity: data.severity,
        clinical_notes: data.clinical_notes,
        disease: data.disease ? parseInt(data.disease) : null,
        veterinarian: "Dr. Veterinário Padrão",
      };
      
      await clinicalService.createClinicalRecord(payload);
      showToast(t("clinical.consultationSuccess"), "success");
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.detail || t("clinical.consultationFailed"), "error");
    }
  };

  const modalFields: ModalField[] = [
    { name: "animal_identifier", label: t("clinical.animalTag"), type: "text", required: true, colSpan: "half" },
    { name: "record_date", label: t("clinical.consultationDate"), type: "date", required: true, initialValue: new Date().toISOString().split('T')[0], colSpan: "half" },
    { name: "record_type", label: t("clinical.attendanceType"), type: "select", required: true, colSpan: "half", options: [
      { value: "rotina", label: t("clinical.routine") },
      { value: "emergencia", label: t("clinical.emergency") },
      { value: "acompanhamento", label: t("clinical.followUp") },
      { value: "cirurgia", label: t("clinical.surgery") },
    ], initialValue: "rotina" },
    { name: "severity", label: t("clinical.severity"), type: "select", required: true, colSpan: "half", options: [
      { value: "low", label: t("clinical.low") },
      { value: "medium", label: t("clinical.medium") },
      { value: "high", label: t("clinical.high") },
      { value: "critical", label: t("clinical.critical") },
    ], initialValue: "low" },
    { name: "disease", label: t("clinical.diagnosisDisease"), type: "select", colSpan: "full", options: diseases.map(d => ({ value: String(d.id), label: d.name })) },
    { name: "clinical_notes", label: t("clinical.notes"), type: "textarea", colSpan: "full" },
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small" style={{ color: "var(--muted-foreground)" }}>
          <Link href="/home" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>{t("sidebar.dashboard")}</Link>
          <ChevronRight size={14} />
          <Link href="/home/clinico" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>{t("clinical.dashboard")}</Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">{t("clinical.consultations")}</span>
        </nav>
      </div>

      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-end gap-4 mb-4">
        <div>
          <h1 className="fw-black mb-1" style={{ fontSize: "2.1rem", letterSpacing: "-0.03em" }}>
            {t("clinical.consultationHistory")}
          </h1>
          <p className="text-muted-foreground mb-0">
            {t("clinical.consultationDescription")}
          </p>
        </div>
        <button 
          className="btn btn-primary d-inline-flex align-items-center gap-2 fw-semibold px-4 py-2 shadow-sm rounded-pill transition-all hover-scale" 
          style={{ fontSize: '0.9rem', backgroundColor: 'var(--primary)', borderColor: 'var(--primary)' }}
          onClick={() => setIsModalOpen(true)}
        >
          <Plus size={18} />
          {t("clinical.newConsultation")}
        </button>
      </div>

      {loading ? (
        <div className="d-flex justify-content-center py-5">
          <Loader2 className="spin-animation text-muted" size={32} />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={records}
          emptyIcon="📝"
          emptyText={t("clinical.consultationEmpty")}
        />
      )}

      <ClinicalModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t("clinical.consultationTitle")}
        subtitle={t("clinical.consultationSubtitle")}
        fields={modalFields}
        onConfirm={handleCreateRecord}
        confirmLabel={t("clinical.saveConsultation")}
      />
    </div>
  );
}
