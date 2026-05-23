"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { clinicalService } from "@/services/clinicalService";
import { DataTable } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ClinicalModal, ModalField } from "@/components/clinico/ClinicalModal";

export default function ConsultasPage() {
  const { showToast } = useToast();
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
      showToast("Erro ao carregar consultas", "error");
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
    { key: "record_date", label: "Data", render: (v: any) => formatDate(v) },
    { key: "animal_identifier", label: "Animal" },
    { key: "disease_name", label: "Diagnóstico", render: (v: any) => v || "—" },
    { key: "severity", label: "Severidade", render: (v: any) => {
        const map: Record<string, string> = { low: 'Baixa', medium: 'Média', high: 'Alta', critical: 'Crítica' };
        return map[v as string] || v;
    }},
    { key: "veterinarian", label: "Veterinário", render: (v: any) => v || "—" }
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
      showToast("Consulta registrada com sucesso!", "success");
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.detail || "Erro ao registrar consulta", "error");
    }
  };

  const modalFields: ModalField[] = [
    { name: "animal_identifier", label: "Brinco do Animal", type: "text", required: true, colSpan: "half" },
    { name: "record_date", label: "Data da Consulta", type: "date", required: true, initialValue: new Date().toISOString().split('T')[0], colSpan: "half" },
    { name: "record_type", label: "Tipo de Atendimento", type: "select", required: true, colSpan: "half", options: [
      { value: "rotina", label: "Rotina" },
      { value: "emergencia", label: "Emergência" },
      { value: "acompanhamento", label: "Acompanhamento" },
      { value: "cirurgia", label: "Cirúrgico" },
    ], initialValue: "rotina" },
    { name: "severity", label: "Severidade", type: "select", required: true, colSpan: "half", options: [
      { value: "low", label: "Baixa" },
      { value: "medium", label: "Média" },
      { value: "high", label: "Alta" },
      { value: "critical", label: "Crítica" },
    ], initialValue: "low" },
    { name: "disease", label: "Diagnóstico / Doença", type: "select", colSpan: "full", options: diseases.map(d => ({ value: String(d.id), label: d.name })) },
    { name: "clinical_notes", label: "Observações Clínicas", type: "textarea", colSpan: "full" },
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small" style={{ color: "var(--muted-foreground)" }}>
          <Link href="/home" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>Dashboard</Link>
          <ChevronRight size={14} />
          <Link href="/home/clinico" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>Clínico/Veterinário</Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">Consultas</span>
        </nav>
      </div>

      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-end gap-4 mb-4">
        <div>
          <h1 className="fw-black mb-1" style={{ fontSize: "2.1rem", letterSpacing: "-0.03em" }}>
            Histórico de Consultas
          </h1>
          <p className="text-muted-foreground mb-0">
            Acompanhe o histórico clínico do plantel e registre novos atendimentos.
          </p>
        </div>
        <button 
          className="btn btn-primary d-inline-flex align-items-center gap-2 fw-semibold px-4 py-2 shadow-sm rounded-pill transition-all hover-scale" 
          style={{ fontSize: '0.9rem', backgroundColor: 'var(--primary)', borderColor: 'var(--primary)' }}
          onClick={() => setIsModalOpen(true)}
        >
          <Plus size={18} />
          Nova Consulta
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
          emptyText="Nenhuma consulta registrada."
        />
      )}

      <ClinicalModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Nova Consulta Clínica"
        subtitle="Registre os detalhes do atendimento veterinário"
        fields={modalFields}
        onConfirm={handleCreateRecord}
        confirmLabel="Salvar Consulta"
      />
    </div>
  );
}
