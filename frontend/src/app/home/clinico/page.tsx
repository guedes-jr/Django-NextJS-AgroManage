"use client";

import { useState, useEffect } from "react";
import { Stethoscope, Syringe, Pill, Microscope, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { clinicalService } from "@/services/clinicalService";
import { useToast } from "@/components/ui/Toast";

export default function ClinicoDashboardPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  
  const [dashboardStats, setDashboardStats] = useState({
    consultasHoje: 0,
    vacinasAplicadas: 0,
    medicamentosAtivos: 0,
    examesPendentes: 0
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [recordsRes, medsRes, vacsRes, examsRes] = await Promise.all([
          clinicalService.getClinicalRecords(),
          clinicalService.getMedications(),
          clinicalService.getVaccinations(),
          clinicalService.getHealthRecords({ treatment_type: "exam" })
        ]);
        
        const recordsData = recordsRes.data.results || recordsRes.data || [];
        const medsData = medsRes.data.results || medsRes.data || [];
        const vacsData = vacsRes.data.results || vacsRes.data || [];
        const examsData = examsRes.data.results || examsRes.data || [];

        const today = new Date().toISOString().split('T')[0];
        const todayRecords = recordsData.filter((r: any) => r.record_date === today);

        setDashboardStats({
          consultasHoje: todayRecords.length,
          vacinasAplicadas: vacsData.length,
          medicamentosAtivos: medsData.length,
          examesPendentes: examsData.length
        });

      } catch (err) {
        console.error("Erro ao carregar dados clínicos:", err);
        showToast("Erro ao carregar dados", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [showToast]);

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small" style={{ color: "var(--muted-foreground)" }}>
          <Link href="/home" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>Dashboard</Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">Clínico/Veterinário</span>
        </nav>
      </div>

      <div className="mb-4">
        <h1 className="fw-black mb-1" style={{ fontSize: "2.1rem", letterSpacing: "-0.03em" }}>
          Visão Geral Clínica
        </h1>
        <p className="text-muted-foreground mb-0">
          Acompanhamento geral de consultas, medicações e exames do plantel.
        </p>
      </div>

      {loading ? (
        <div className="d-flex justify-content-center py-5">
          <Loader2 className="spin-animation text-muted" size={32} />
        </div>
      ) : (
        <div className="row g-4">
          <div className="col-12 col-sm-6 col-lg-3">
            <Link href="/home/clinico/consultas" className="text-decoration-none">
              <div className="dashboard-card p-4 shadow-sm h-100 transition-all hover-scale" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)", cursor: "pointer" }}>
                <div className="d-flex align-items-center gap-3 mb-2">
                  <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 48, height: 48, background: "oklch(0.95 0.05 145)" }}>
                    <Stethoscope size={24} className="text-success" />
                  </div>
                  <div>
                    <div className="fs-3 fw-black text-foreground">{dashboardStats.consultasHoje}</div>
                    <div className="text-muted-foreground small fw-semibold">Consultas Hoje</div>
                  </div>
                </div>
              </div>
            </Link>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <Link href="/home/clinico/vacinacao" className="text-decoration-none">
              <div className="dashboard-card p-4 shadow-sm h-100 transition-all hover-scale" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)", cursor: "pointer" }}>
                <div className="d-flex align-items-center gap-3 mb-2">
                  <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 48, height: 48, background: "oklch(0.94 0.04 230)" }}>
                    <Syringe size={24} className="text-primary" />
                  </div>
                  <div>
                    <div className="fs-3 fw-black text-foreground">{dashboardStats.vacinasAplicadas}</div>
                    <div className="text-muted-foreground small fw-semibold">Vacinas Aplicadas</div>
                  </div>
                </div>
              </div>
            </Link>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <Link href="/home/clinico/medicamentos" className="text-decoration-none">
              <div className="dashboard-card p-4 shadow-sm h-100 transition-all hover-scale" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)", cursor: "pointer" }}>
                <div className="d-flex align-items-center gap-3 mb-2">
                  <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 48, height: 48, background: "oklch(0.96 0.04 290)" }}>
                    <Pill size={24} className="text-info" />
                  </div>
                  <div>
                    <div className="fs-3 fw-black text-foreground">{dashboardStats.medicamentosAtivos}</div>
                    <div className="text-muted-foreground small fw-semibold">Medicamentos (Estoque)</div>
                  </div>
                </div>
              </div>
            </Link>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <Link href="/home/clinico/exames" className="text-decoration-none">
              <div className="dashboard-card p-4 shadow-sm h-100 transition-all hover-scale" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)", cursor: "pointer" }}>
                <div className="d-flex align-items-center gap-3 mb-2">
                  <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 48, height: 48, background: "oklch(0.97 0.04 80)" }}>
                    <Microscope size={24} className="text-warning" />
                  </div>
                  <div>
                    <div className="fs-3 fw-black text-foreground">{dashboardStats.examesPendentes}</div>
                    <div className="text-muted-foreground small fw-semibold">Exames Realizados</div>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
