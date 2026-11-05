"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2, ChevronRight, Microscope, DollarSign, Users, FileText } from "lucide-react";
import Link from "next/link";
import { clinicalService } from "@/services/clinicalService";
import { DataTable } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ClinicalModal, ModalField } from "@/components/clinico/ClinicalModal";
import { useOrganizationLocale } from "@/lib/locale";

export default function ExamesPage() {
  const { showToast } = useToast();
  const { language, t } = useOrganizationLocale();
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch health records filtering by treatment_type = 'exam'
      const res = await clinicalService.getHealthRecords({ treatment_type: "exam" });
      setExams(res.data.results || res.data || []);
    } catch (err) {
      console.error("Erro ao carregar exames:", err);
      showToast(t("clinical.loadExamsFailed"), "error");
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

  const formatCurrency = (val: number | string | null) => {
    if (val === null || val === undefined || val === "") return "—";
    const num = typeof val === "string" ? parseFloat(val) : val;
    return new Intl.NumberFormat(language, { style: "currency", currency: "BRL" }).format(num);
  };

  const columns = [
    { key: "application_date", label: t("clinical.date"), render: (v: any) => formatDate(v) },
    {
      key: "animal_identifier",
      label: t("clinical.animal"),
      render: (v: any) => (
        <span className="badge bg-light text-dark border px-2 py-1 rounded-pill">
          🐖 {t("clinical.animalTag")}: {v || "—"}
        </span>
      ),
    },
    { key: "description", label: t("clinical.descriptionObjective") },
    { key: "veterinary", label: t("clinical.veterinarian"), render: (v: any) => v || "—" },
    { key: "cost", label: t("clinical.cost"), render: (v: any) => formatCurrency(v) },
    { key: "notes", label: t("clinical.notes"), render: (v: any) => v || "—" },
  ];

  const handleCreateExam = async (data: any) => {
    try {
      const payload = {
        animal_identifier: data.animal_identifier,
        treatment_type: "exam",
        description: data.description,
        application_date: data.application_date,
        veterinary: data.veterinary || "Dr. Veterinário Padrão",
        cost: data.cost ? parseFloat(data.cost) : null,
        notes: data.notes,
      };

      await clinicalService.createHealthRecord(payload);
      showToast(t("clinical.examSuccess"), "success");
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.detail || t("clinical.examFailed"), "error");
    }
  };

  const modalFields: ModalField[] = [
    { name: "animal_identifier", label: t("clinical.animalTag"), type: "text", required: true, colSpan: "half" },
    {
      name: "application_date",
      label: t("clinical.examDate"),
      type: "date",
      required: true,
      initialValue: new Date().toISOString().split("T")[0],
      colSpan: "half",
    },
    { name: "description", label: t("clinical.examDescriptionLabel"), type: "text", required: true, colSpan: "full", placeholder: t("clinical.examDescriptionPlaceholder") },
    { name: "veterinary", label: t("clinical.responsibleVeterinarian"), type: "text", colSpan: "half" },
    { name: "cost", label: t("clinical.examCost"), type: "number", colSpan: "half" },
    { name: "notes", label: t("clinical.additionalNotes"), type: "textarea", colSpan: "full" },
  ];

  // Dynamic statistics
  const totalExams = exams.length;
  const totalCost = exams.reduce((sum, item) => sum + (item.cost ? parseFloat(item.cost) : 0), 0);
  const uniqueVeterinaries = Array.from(new Set(exams.map((e) => e.veterinary).filter(Boolean))).length;

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small" style={{ color: "var(--muted-foreground)" }}>
          <Link href="/home" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>{t("sidebar.dashboard")}</Link>
          <ChevronRight size={14} />
          <Link href="/home/clinico" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>{t("clinical.dashboard")}</Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">{t("clinical.exams")}</span>
        </nav>
      </div>

      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-end gap-4 mb-4">
        <div className="d-flex align-items-center gap-3">
          <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 48, height: 48, background: "oklch(0.97 0.04 80)" }}>
            <Microscope size={24} className="text-warning" />
          </div>
          <div>
            <h1 className="fw-black mb-1" style={{ fontSize: "1.9rem", letterSpacing: "-0.03em" }}>
              {t("clinical.labExams")}
            </h1>
            <p className="text-muted-foreground mb-0">
              {t("clinical.examDescription")}
            </p>
          </div>
        </div>
        <button
          className="btn btn-primary d-inline-flex align-items-center gap-2 fw-semibold px-4 py-2 shadow-sm rounded-pill transition-all hover-scale"
          style={{ fontSize: "0.9rem", backgroundColor: "var(--primary)", borderColor: "var(--primary)" }}
          onClick={() => setIsModalOpen(true)}
        >
          <Plus size={18} />
          {t("clinical.newExam")}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="row g-4 mb-4">
        <div className="col-12 col-sm-4">
          <div className="dashboard-card p-4 shadow-sm h-100" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
            <div className="d-flex align-items-center gap-3">
              <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 40, height: 40, background: "oklch(0.97 0.04 80)" }}>
                <FileText size={20} className="text-warning" />
              </div>
              <div>
                <div className="fs-4 fw-black">{totalExams}</div>
                <div className="text-muted-foreground small fw-semibold">{t("clinical.examCompleted")}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-4">
          <div className="dashboard-card p-4 shadow-sm h-100" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
            <div className="d-flex align-items-center gap-3">
              <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 40, height: 40, background: "oklch(0.96 0.04 290)" }}>
                <DollarSign size={20} className="text-info" />
              </div>
              <div>
                <div className="fs-4 fw-black">{formatCurrency(totalCost)}</div>
                <div className="text-muted-foreground small fw-semibold">{t("clinical.totalInvestment")}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-4">
          <div className="dashboard-card p-4 shadow-sm h-100" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
            <div className="d-flex align-items-center gap-3">
              <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 40, height: 40, background: "oklch(0.95 0.05 145)" }}>
                <Users size={20} className="text-success" />
              </div>
              <div>
                <div className="fs-4 fw-black">{uniqueVeterinaries}</div>
                <div className="text-muted-foreground small fw-semibold">{t("clinical.veterinarians")}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="d-flex justify-content-center py-5">
          <Loader2 className="spin-animation text-muted" size={32} />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={exams}
          emptyIcon="🔬"
          emptyText={t("clinical.examEmpty")}
        />
      )}

      <ClinicalModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t("clinical.examTitle")}
        subtitle={t("clinical.examSubtitle")}
        fields={modalFields}
        onConfirm={handleCreateExam}
        confirmLabel={t("clinical.saveExam")}
      />
    </div>
  );
}
