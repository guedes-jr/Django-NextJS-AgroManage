"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2, ChevronRight, Syringe, Calendar, Users, Activity } from "lucide-react";
import Link from "next/link";
import { clinicalService } from "@/services/clinicalService";
import { DataTable } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ClinicalModal, ModalField } from "@/components/clinico/ClinicalModal";

export default function VacinacaoPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [vaccinations, setVaccinations] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await clinicalService.getVaccinations();
      setVaccinations(res.data.results || res.data || []);
    } catch (err) {
      console.error("Erro ao carregar vacinações:", err);
      showToast("Erro ao carregar vacinações", "error");
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

  const columns = [
    { key: "application_date", label: "Data", render: (v: any) => formatDate(v) },
    { key: "vaccine_name", label: "Vacina" },
    {
      key: "target",
      label: "Destinatário",
      render: (_: any, row: any) => {
        if (row.animal_identifier) {
          return (
            <span className="badge bg-light text-dark border px-2 py-1 rounded-pill">
              🐖 Brinco: {row.animal_identifier}
            </span>
          );
        }
        if (row.batch_code) {
          return (
            <span className="badge bg-light text-primary border border-primary-subtle px-2 py-1 rounded-pill">
              📦 Lote: {row.batch_code}
            </span>
          );
        }
        return "—";
      },
    },
    {
      key: "dose_type",
      label: "Dose",
      render: (v: any) => {
        const map: Record<string, string> = {
          unica: "Única",
          primeira: "1ª Dose",
          segunda: "2ª Dose",
          terceira: "3ª Dose",
          reforco: "Reforço",
        };
        return map[v as string] || v;
      },
    },
    { key: "dosage_ml", label: "Dosagem", render: (v: any) => (v ? `${v} ml` : "—") },
    { key: "applicator", label: "Aplicador", render: (v: any) => v || "—" },
    { key: "next_dose_date", label: "Reforço Previsto", render: (v: any) => formatDate(v) },
  ];

  const handleCreateVaccination = async (data: any) => {
    try {
      const payload = {
        animal_identifier: data.target_type === "animal" ? data.animal_identifier : "",
        batch_code: data.target_type === "batch" ? data.batch_code : "",
        vaccine_name: data.vaccine_name,
        application_date: data.application_date,
        dose_type: data.dose_type,
        dosage_ml: data.dosage_ml ? parseFloat(data.dosage_ml) : null,
        batch_number: data.batch_number,
        applicator: data.applicator,
        next_dose_date: data.next_dose_date || null,
        notes: data.notes,
      };

      await clinicalService.createVaccination(payload);
      showToast("Vacinação registrada com sucesso!", "success");
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.detail || "Erro ao registrar vacinação", "error");
    }
  };

  const modalFields: ModalField[] = [
    {
      name: "target_type",
      label: "Aplicar Em",
      type: "select",
      required: true,
      colSpan: "full",
      options: [
        { value: "animal", label: "Animal Individual" },
        { value: "batch", label: "Lote de Animais" },
      ],
      initialValue: "animal",
    },
    {
      name: "animal_identifier",
      label: "Brinco do Animal",
      type: "text",
      required: true,
      colSpan: "half",
      showIf: (values) => values.target_type === "animal",
    },
    {
      name: "batch_code",
      label: "Código do Lote",
      type: "text",
      required: true,
      colSpan: "half",
      showIf: (values) => values.target_type === "batch",
    },
    { name: "vaccine_name", label: "Nome da Vacina", type: "text", required: true, colSpan: "half" },
    {
      name: "application_date",
      label: "Data da Aplicação",
      type: "date",
      required: true,
      initialValue: new Date().toISOString().split("T")[0],
      colSpan: "half",
    },
    {
      name: "dose_type",
      label: "Tipo de Dose",
      type: "select",
      required: true,
      colSpan: "half",
      options: [
        { value: "unica", label: "Dose Única" },
        { value: "primeira", label: "1ª Dose" },
        { value: "segunda", label: "2ª Dose" },
        { value: "terceira", label: "3ª Dose" },
        { value: "reforco", label: "Reforço" },
      ],
      initialValue: "unica",
    },
    { name: "dosage_ml", label: "Dosagem (ml)", type: "number", colSpan: "half" },
    { name: "batch_number", label: "Número do Lote da Vacina", type: "text", colSpan: "half" },
    { name: "applicator", label: "Responsável pela Aplicação", type: "text", colSpan: "half" },
    { name: "next_dose_date", label: "Data do Próximo Reforço (Opcional)", type: "date", colSpan: "full" },
    { name: "notes", label: "Observações / Notas", type: "textarea", colSpan: "full" },
  ];

  // Dynamic statistics
  const totalApplied = vaccinations.length;
  const nextDoses = vaccinations.filter(
    (v) => v.next_dose_date && new Date(v.next_dose_date) >= new Date()
  ).length;
  const uniqueApplicators = Array.from(new Set(vaccinations.map((v) => v.applicator).filter(Boolean)))
    .length;

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small" style={{ color: "var(--muted-foreground)" }}>
          <Link href="/home" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>Dashboard</Link>
          <ChevronRight size={14} />
          <Link href="/home/clinico" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>Clínico</Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">Vacinação</span>
        </nav>
      </div>

      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-end gap-4 mb-4">
        <div className="d-flex align-items-center gap-3">
          <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 48, height: 48, background: "oklch(0.94 0.04 230)" }}>
            <Syringe size={24} className="text-primary" />
          </div>
          <div>
            <h1 className="fw-black mb-1" style={{ fontSize: "1.9rem", letterSpacing: "-0.03em" }}>
              Vacinação do Plantel
            </h1>
            <p className="text-muted-foreground mb-0">
              Controle de imunização, aplicação de vacinas e agendamento de reforços.
            </p>
          </div>
        </div>
        <button
          className="btn btn-primary d-inline-flex align-items-center gap-2 fw-semibold px-4 py-2 shadow-sm rounded-pill transition-all hover-scale"
          style={{ fontSize: "0.9rem", backgroundColor: "var(--primary)", borderColor: "var(--primary)" }}
          onClick={() => setIsModalOpen(true)}
        >
          <Plus size={18} />
          Registrar Vacina
        </button>
      </div>

      {/* KPI Cards */}
      <div className="row g-4 mb-4">
        <div className="col-12 col-sm-4">
          <div className="dashboard-card p-4 shadow-sm h-100" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
            <div className="d-flex align-items-center gap-3">
              <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 40, height: 40, background: "oklch(0.94 0.04 230)" }}>
                <Activity size={20} className="text-primary" />
              </div>
              <div>
                <div className="fs-4 fw-black">{totalApplied}</div>
                <div className="text-muted-foreground small fw-semibold">Vacinas Aplicadas</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-4">
          <div className="dashboard-card p-4 shadow-sm h-100" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
            <div className="d-flex align-items-center gap-3">
              <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 40, height: 40, background: "oklch(0.97 0.04 80)" }}>
                <Calendar size={20} className="text-warning" />
              </div>
              <div>
                <div className="fs-4 fw-black">{nextDoses}</div>
                <div className="text-muted-foreground small fw-semibold">Próximos Reforços</div>
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
                <div className="fs-4 fw-black">{uniqueApplicators}</div>
                <div className="text-muted-foreground small fw-semibold">Responsáveis</div>
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
          rows={vaccinations}
          emptyIcon="💉"
          emptyText="Nenhuma vacinação registrada no sistema."
        />
      )}

      <ClinicalModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Registrar Aplicação de Vacina"
        subtitle="Preencha as informações da vacina aplicada no animal ou lote"
        fields={modalFields}
        onConfirm={handleCreateVaccination}
        confirmLabel="Salvar Registro"
      />
    </div>
  );
}
