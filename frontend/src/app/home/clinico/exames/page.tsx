"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2, ChevronRight, Microscope, DollarSign, Users, FileText } from "lucide-react";
import Link from "next/link";
import { clinicalService } from "@/services/clinicalService";
import { DataTable } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ClinicalModal, ModalField } from "@/components/clinico/ClinicalModal";

export default function ExamesPage() {
  const { showToast } = useToast();
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
      showToast("Erro ao carregar exames", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    const [y, m, d] = dateStr.split("T")[0].split("-");
    return `${d}/${m}/${y}`;
  };

  const formatCurrency = (val: number | string | null) => {
    if (val === null || val === undefined || val === "") return "—";
    const num = typeof val === "string" ? parseFloat(val) : val;
    return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const columns = [
    { key: "application_date", label: "Data", render: (v: any) => formatDate(v) },
    {
      key: "animal_identifier",
      label: "Animal",
      render: (v: any) => (
        <span className="badge bg-light text-dark border px-2 py-1 rounded-pill">
          🐖 Brinco: {v || "—"}
        </span>
      ),
    },
    { key: "description", label: "Descrição / Objetivo" },
    { key: "veterinary", label: "Veterinário", render: (v: any) => v || "—" },
    { key: "cost", label: "Custo", render: (v: any) => formatCurrency(v) },
    { key: "notes", label: "Observações", render: (v: any) => v || "—" },
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
      showToast("Exame registrado com sucesso!", "success");
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.detail || "Erro ao registrar exame", "error");
    }
  };

  const modalFields: ModalField[] = [
    { name: "animal_identifier", label: "Brinco do Animal", type: "text", required: true, colSpan: "half" },
    {
      name: "application_date",
      label: "Data do Exame",
      type: "date",
      required: true,
      initialValue: new Date().toISOString().split("T")[0],
      colSpan: "half",
    },
    { name: "description", label: "Descrição / Objetivo do Exame", type: "text", required: true, colSpan: "full", placeholder: "Ex: Hemograma completo, Ultrassom gestacional" },
    { name: "veterinary", label: "Veterinário Responsável", type: "text", colSpan: "half" },
    { name: "cost", label: "Custo do Exame (R$)", type: "number", colSpan: "half" },
    { name: "notes", label: "Observações / Detalhes Adicionais", type: "textarea", colSpan: "full" },
  ];

  // Dynamic statistics
  const totalExams = exams.length;
  const totalCost = exams.reduce((sum, item) => sum + (item.cost ? parseFloat(item.cost) : 0), 0);
  const uniqueVeterinaries = Array.from(new Set(exams.map((e) => e.veterinary).filter(Boolean))).length;

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small" style={{ color: "var(--muted-foreground)" }}>
          <Link href="/home" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>Dashboard</Link>
          <ChevronRight size={14} />
          <Link href="/home/clinico" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>Clínico</Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">Exames</span>
        </nav>
      </div>

      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-end gap-4 mb-4">
        <div className="d-flex align-items-center gap-3">
          <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 48, height: 48, background: "oklch(0.97 0.04 80)" }}>
            <Microscope size={24} className="text-warning" />
          </div>
          <div>
            <h1 className="fw-black mb-1" style={{ fontSize: "1.9rem", letterSpacing: "-0.03em" }}>
              Exames Laboratoriais
            </h1>
            <p className="text-muted-foreground mb-0">
              Registro e acompanhamento de análises clínicas, exames de imagem e diagnósticos laboratoriais.
            </p>
          </div>
        </div>
        <button
          className="btn btn-primary d-inline-flex align-items-center gap-2 fw-semibold px-4 py-2 shadow-sm rounded-pill transition-all hover-scale"
          style={{ fontSize: "0.9rem", backgroundColor: "var(--primary)", borderColor: "var(--primary)" }}
          onClick={() => setIsModalOpen(true)}
        >
          <Plus size={18} />
          Novo Exame
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
                <div className="text-muted-foreground small fw-semibold">Exames Realizados</div>
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
                <div className="text-muted-foreground small fw-semibold">Investimento Total</div>
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
                <div className="text-muted-foreground small fw-semibold">Veterinários</div>
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
          emptyText="Nenhum exame laboratorial registrado."
        />
      )}

      <ClinicalModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Registrar Novo Exame"
        subtitle="Preencha os detalhes do exame clínico ou laboratorial realizado"
        fields={modalFields}
        onConfirm={handleCreateExam}
        confirmLabel="Salvar Exame"
      />
    </div>
  );
}
