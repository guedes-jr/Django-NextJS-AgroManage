"use client";

import { useState } from "react";
import { FinanceDashboard } from "@/components/dashboard/FinanceDashboard";
import { TransactionManager } from "@/components/dashboard/TransactionManager";
import { 
  LayoutDashboard, 
  ArrowLeftRight, 
  Settings, 
  Download,
  ChevronRight
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

const TABS = [
  { id: "dashboard", label: "Visão Geral", icon: <LayoutDashboard size={18} /> },
  { id: "transactions", label: "Fluxo de Transações", icon: <ArrowLeftRight size={18} /> },
];

export default function FinanceiroPage() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="animate-fade-in">
      {/* Breadcrumbs */}
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small" style={{ color: "var(--muted-foreground)" }}>
          <Link href="/home" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>Dashboard</Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">Financeiro</span>
        </nav>
      </div>

      {/* Header Title & Actions */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-end gap-4 mb-4">
        <div>
          <h1 className="fw-black mb-1" style={{ fontSize: "2.1rem", letterSpacing: "-0.03em" }}>
            Gestão Financeira
          </h1>
          <p className="text-muted-foreground mb-0">
            Acompanhe o fluxo de caixa, receitas e despesas da sua fazenda.
          </p>
        </div>
        
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary fw-semibold d-flex align-items-center gap-2 rounded-2 px-3 py-2 text-dark bg-white border-light-subtle">
            <Download size={18} /> Exportar Relatório
          </button>
          <button className="btn btn-outline-secondary fw-semibold d-flex align-items-center gap-2 rounded-2 px-3 py-2 text-dark bg-white border-light-subtle">
            <Settings size={18} /> Configurações
          </button>
        </div>
      </div>

      {/* Navigation Tabs (Bootstrap Style) */}
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

      {/* Content Area */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "dashboard" ? (
            <FinanceDashboard />
          ) : (
            <TransactionManager />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
