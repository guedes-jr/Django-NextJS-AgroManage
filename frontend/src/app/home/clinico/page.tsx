"use client";

import { useState } from "react";
import { LayoutDashboard, Stethoscope, Syringe, Pill, Microscope, ChevronRight } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

const TABS = [
  { id: "dashboard", label: "Visão Geral", icon: <LayoutDashboard size={18} /> },
  { id: "consultas", label: "Consultas", icon: <Stethoscope size={18} /> },
  { id: "vacinacao", label: "Vacinação", icon: <Syringe size={18} /> },
  { id: "medicamentos", label: "Medicamentos", icon: <Pill size={18} /> },
  { id: "exames", label: "Exames", icon: <Microscope size={18} /> },
];

export default function ClinicoPage() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small" style={{ color: "var(--muted-foreground)" }}>
          <Link href="/home" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>Dashboard</Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">Clínico/Veterinário</span>
        </nav>
      </div>

      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-end gap-4 mb-4">
        <div>
          <h1 className="fw-black mb-1" style={{ fontSize: "2.1rem", letterSpacing: "-0.03em" }}>
            Clínica Veterinária
          </h1>
          <p className="text-muted-foreground mb-0">
            Gerencie consultas, vacinações, medicamentos e exames do plantel.
          </p>
        </div>
      </div>

      <ul className="nav nav-tabs mb-4 border-bottom w-100">
        {TABS.map((tab) => (
          <li className="nav-item" key={tab.id}>
            <button
              onClick={() => setActiveTab(tab.id)}
              className={`nav-link d-flex align-items-center gap-2 py-3 px-4 fw-semibold border-0 border-bottom border-3 rounded-0 ${
                activeTab === tab.id
                  ? "active text-success border-success bg-transparent"
                  : "text-muted border-transparent hover-bg-light"
              }`}
              style={{ fontSize: '0.9rem', marginBottom: '-1px' }}
            >
              <span className={activeTab === tab.id ? "text-success" : "text-muted"}>{tab.icon}</span>
              {tab.label}
            </button>
          </li>
        ))}
      </ul>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "dashboard" && (
            <div className="row g-4">
              <div className="col-12 col-sm-6 col-lg-3">
                <div className="dashboard-card p-4 shadow-sm" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
                  <div className="d-flex align-items-center gap-3 mb-3">
                    <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 48, height: 48, background: "oklch(0.95 0.05 145)" }}>
                      <Stethoscope size={24} className="text-success" />
                    </div>
                    <div>
                      <div className="fs-3 fw-black">0</div>
                      <div className="text-muted-foreground small fw-semibold">Consultas Hoje</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-12 col-sm-6 col-lg-3">
                <div className="dashboard-card p-4 shadow-sm" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
                  <div className="d-flex align-items-center gap-3 mb-3">
                    <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 48, height: 48, background: "oklch(0.94 0.04 230)" }}>
                      <Syringe size={24} className="text-primary" />
                    </div>
                    <div>
                      <div className="fs-3 fw-black">0</div>
                      <div className="text-muted-foreground small fw-semibold">Vacinas Aplicadas</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-12 col-sm-6 col-lg-3">
                <div className="dashboard-card p-4 shadow-sm" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
                  <div className="d-flex align-items-center gap-3 mb-3">
                    <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 48, height: 48, background: "oklch(0.96 0.04 290)" }}>
                      <Pill size={24} className="text-info" />
                    </div>
                    <div>
                      <div className="fs-3 fw-black">0</div>
                      <div className="text-muted-foreground small fw-semibold">Medicamentos</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-12 col-sm-6 col-lg-3">
                <div className="dashboard-card p-4 shadow-sm" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
                  <div className="d-flex align-items-center gap-3 mb-3">
                    <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 48, height: 48, background: "oklch(0.97 0.04 80)" }}>
                      <Microscope size={24} className="text-warning" />
                    </div>
                    <div>
                      <div className="fs-3 fw-black">0</div>
                      <div className="text-muted-foreground small fw-semibold">Exames Pendentes</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === "consultas" && (
            <div className="dashboard-card p-4 shadow-sm" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
              <h5 className="fw-bold mb-3">Consultas</h5>
              <p className="text-muted-foreground small mb-0">Nenhuma consulta registrada.</p>
            </div>
          )}
          {activeTab === "vacinacao" && (
            <div className="dashboard-card p-4 shadow-sm" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
              <h5 className="fw-bold mb-3">Vacinação</h5>
              <p className="text-muted-foreground small mb-0">Nenhuma vacinação registrada.</p>
            </div>
          )}
          {activeTab === "medicamentos" && (
            <div className="dashboard-card p-4 shadow-sm" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
              <h5 className="fw-bold mb-3">Medicamentos</h5>
              <p className="text-muted-foreground small mb-0">Nenhum medicamento registrado.</p>
            </div>
          )}
          {activeTab === "exames" && (
            <div className="dashboard-card p-4 shadow-sm" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
              <h5 className="fw-bold mb-3">Exames</h5>
              <p className="text-muted-foreground small mb-0">Nenhum exame registrado.</p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
