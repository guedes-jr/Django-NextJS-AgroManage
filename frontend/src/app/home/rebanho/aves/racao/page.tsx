"use client";

import { useState } from "react";
import Link from "next/link";
import { FeedProductionDashboard } from "@/components/dashboard/FeedProductionDashboard";
import { FeedConsumptionDashboard } from "@/components/dashboard/FeedConsumptionDashboard";
import { 
  FlaskConical, 
  ChevronRight, 
  Plus, 
  History,
  Users,
  Bird,
  Feather,
  Egg,
  LayoutDashboard
} from "lucide-react";


const TABS = [
  { id: "lotes", label: "Lotes", icon: <Users size={18} /> },
  { id: "matrizes", label: "Matrizes", icon: <Bird size={18} /> },
  { id: "frangos", label: "Frangos", icon: <Feather size={18} /> },
  { id: "pintinhos", label: "Pintinhos", icon: <Egg size={18} /> },
  { id: "producao", label: "Produção de Ração", icon: <FlaskConical size={18} /> },
];

export default function AvesRacaoPage() {
  const [activeTab, setActiveTab] = useState("lotes");
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="animate-fade-in inventory-container">
      {/* Header Centralizado com Botões */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <nav className="d-flex align-items-center gap-2 small text-muted-foreground mb-2">
            <Link href="/home" className="text-decoration-none text-muted-foreground">Gestão Agro</Link>
            <ChevronRight size={14} />
            <Link href="/home/rebanho" className="text-decoration-none text-muted-foreground">Rebanho</Link>
            <ChevronRight size={14} />
            <span className="fw-semibold text-foreground">Aves</span>
          </nav>
          <h1 className="fw-black mb-1" style={{ fontSize: "2.1rem", letterSpacing: "-0.03em" }}>
            {activeTab === "producao" ? "Produção de Ração" : "Consumo de Ração"}
          </h1>
          <p className="text-muted-foreground mb-0">
            {activeTab === "producao" 
              ? "Produza rações de forma rápida e controle os custos com eficiência."
              : "Lance e acompanhe o consumo de ração dos animais."}
          </p>
        </div>
        
        <div className="d-flex gap-3 align-items-center">
          <button className="btn btn-outline-secondary fw-semibold d-flex align-items-center gap-2 rounded-2 px-3 py-2 text-dark bg-white border-light-subtle">
            <History size={16} /> Histórico de Consumo
          </button>
          <button 
            onClick={() => setShowForm(!showForm)}
            className="btn btn-primary fw-semibold d-flex align-items-center gap-2 shadow-sm border-0 rounded-2 px-3 py-2"
            style={{ background: "#054f31" }} // dark green
          >
            <Plus size={16} /> {showForm ? "Fechar Lançamento" : "Novo Lançamento"}
          </button>
        </div>
      </div>

      {/* Navigation Tabs (Bootstrap) */}
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

      {activeTab === "producao" ? (
        <FeedProductionDashboard species="ave" showHeader={false} />
      ) : (
        <FeedConsumptionDashboard 
          species="ave" 
          showHeader={false} 
          initialCategory={activeTab} 
          hideInternalTabs={true}
          categories={TABS.filter(t => t.id !== 'producao')}
          showForm={showForm}
          onToggleForm={() => setShowForm(!showForm)}
        />
      )}
    </div>
  );
}






