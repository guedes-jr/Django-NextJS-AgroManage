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
import { useOrganizationLocale } from "@/lib/locale";

const TAB_DEFINITIONS = [
  { id: "lotes", labelKey: "livestock.feed.tabs.lots", Icon: Users },
  { id: "matrizes", labelKey: "livestock.feed.tabs.breeders", Icon: Bird },
  { id: "frangos", labelKey: "livestock.feed.tabs.broilers", Icon: Feather },
  { id: "pintinhos", labelKey: "livestock.feed.tabs.chicks", Icon: Egg },
  { id: "producao", labelKey: "livestock.feed.tabs.production", Icon: FlaskConical },
] as const;

export default function AvesRacaoPage() {
  const [activeTab, setActiveTab] = useState("lotes");
  const [showForm, setShowForm] = useState(false);
  const { t } = useOrganizationLocale();
  const tabs = TAB_DEFINITIONS.map(({ id, labelKey, Icon }) => ({ id, label: t(labelKey), icon: <Icon size={18} /> }));

  return (
    <div className="animate-fade-in inventory-container">
      {/* Header Centralizado com Botões */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <nav className="d-flex align-items-center gap-2 small text-muted-foreground mb-2">
            <Link href="/home" className="text-decoration-none text-muted-foreground">Fazenda Mais</Link>
            <ChevronRight size={14} />
            <span>{t("livestock.breadcrumb.segments")}</span>
            <ChevronRight size={14} />
            <span className="fw-semibold text-foreground">{t("livestock.birds.title")}</span>
          </nav>
          <h1 className="fw-black mb-1" style={{ fontSize: "2.1rem", letterSpacing: "-0.03em" }}>
            {activeTab === "producao" ? t("livestock.feed.productionTitle") : t("livestock.feed.consumptionTitle")}
          </h1>
          <p className="text-muted-foreground mb-0">
            {activeTab === "producao" 
              ? t("livestock.feed.productionDescription")
              : t("livestock.feed.consumptionDescription")}
          </p>
        </div>
        
        <div className="d-flex gap-3 align-items-center">
          <button className="btn btn-outline-secondary fw-semibold d-flex align-items-center gap-2 rounded-2 px-3 py-2 text-foreground bg-card border-light-subtle">
            <History size={16} /> {t("livestock.feed.history")}
          </button>
          <button 
            onClick={() => setShowForm(!showForm)}
            className="btn btn-primary fw-semibold d-flex align-items-center gap-2 shadow-sm border-0 rounded-2 px-3 py-2"
            style={{ background: "#054f31" }} // dark green
          >
            <Plus size={16} /> {showForm ? t("livestock.feed.closeEntry") : t("livestock.feed.newEntry")}
          </button>
        </div>
      </div>

      {/* Navigation Tabs (Bootstrap) */}
      <ul className="nav nav-tabs mb-4 border-bottom w-100">
        {tabs.map((tab) => (
          <li className="nav-item" key={tab.id}>
            <button
              onClick={() => setActiveTab(tab.id)}
              className={`nav-link d-flex align-items-center gap-2 py-3 px-4 fw-semibold border-0 border-bottom border-3 rounded-0 ${
                activeTab === tab.id 
                  ? "active text-success border-success bg-transparent" 
                  : "text-muted border-transparent hover-bg-muted"
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
          categories={tabs.filter(tab => tab.id !== 'producao')}
          showForm={showForm}
          onToggleForm={() => setShowForm(!showForm)}
        />
      )}
    </div>
  );
}





