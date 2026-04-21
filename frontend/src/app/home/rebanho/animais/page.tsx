"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { AnimalsTable } from "@/components/dashboard/AnimalsTable";
import { AnimalFormModal } from "@/components/dashboard/AnimalFormModal";
import { ChevronRight, Plus, Warehouse, CheckCircle2, AlertOctagon, Clock, BarChart3, Bird } from "lucide-react";
import { Icon } from "lucide-react";
import { cowHead, pigHead } from "@lucide/lab";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient } from "@/services/api";
import "./animais.css";

const animalTypes = [
  { id: "bovinos" as const, label: "Bovinos", icon: "cow", color: "oklch(0.55 0.16 145)" },
  { id: "suinos" as const, label: "Suínos", icon: "pig", color: "oklch(0.78 0.15 85)" },
  { id: "aves" as const, label: "Aves", icon: "bird", color: "oklch(0.62 0.14 50)" },
];

function AnimalTypeIcon({ icon, color, isActive }: { icon: string; color: string; isActive?: boolean }) {
  const lucideIcons = {
    cow: cowHead,
    pig: pigHead,
  };
  const iconColor = isActive ? "#ffffff" : "var(--muted-foreground)";
  const iconSize = isActive ? 24 : 20;
  const icons: Record<string, React.ReactNode> = {
    cow: <Icon iconNode={lucideIcons.cow} size={iconSize} color={iconColor} />,
    pig: <Icon iconNode={lucideIcons.pig} size={iconSize} color={iconColor} />,
    bird: <Bird size={iconSize} color={iconColor} />,
  };
  return <span style={{ color: iconColor }}>{icons[icon]}</span>;
}

interface KPICard {
  label: string;
  value: string | number;
  change?: string;
  icon: "cow" | "pig" | "bird" | "warehouse" | "check" | "alert" | "clock" | "chart";
  color: string;
}

function KPIcon({ icon }: { icon: KPICard["icon"] }) {
  const lucideIcons = {
    cow: cowHead,
    pig: pigHead,
  };
  const icons: Record<string, React.ReactNode> = {
    cow: <Icon iconNode={lucideIcons.cow} size={22} strokeWidth={2.5}  />,
    pig: <Icon iconNode={lucideIcons.pig} size={22} strokeWidth={2.5}  />,
    bird: <Bird size={22} strokeWidth={2.5}  />,
    warehouse: <Warehouse size={22} strokeWidth={2.5}  />,
    check: <CheckCircle2 size={22} strokeWidth={2.5}  />,
    alert: <AlertOctagon size={22} strokeWidth={2.5}  />,
    clock: <Clock size={22} strokeWidth={2.5}  />,
    chart: <BarChart3 size={22} strokeWidth={2.5}  />,
  };
  return <span>{icons[icon]}</span>;
}

function getKPIs(type: "bovinos" | "suinos" | "aves", data: any[]): KPICard[] {
  const total = data.length;
  const ativos = data.filter((a) => a.status === "active").length;
  const doentes = data.filter((a) => a.status === "sick").length;
  const quarentena = data.filter((a) => a.status === "quarantine").length;

  switch (type) {
    case "bovinos":
      return [
        { label: "Total Bovinos", value: total, icon: "cow", color: "oklch(0.55 0.16 145)" },
        { label: "Ativos", value: ativos, change: `${total ? Math.round((ativos / total) * 100) : 0}%`, icon: "check", color: "oklch(0.60 0.16 150)" },
        { label: "Doentes", value: doentes, icon: "alert", color: "oklch(0.6 0.22 27)" },
        { label: "Quarentena", value: quarentena, icon: "clock", color: "oklch(0.78 0.15 75)" },
      ];
    case "suinos":
      return [
        { label: "Total Lotes", value: total, icon: "pig", color: "oklch(0.78 0.15 85)" },
        { label: "Ativos", value: ativos, change: `${total ? Math.round((ativos / total) * 100) : 0}%`, icon: "check", color: "oklch(0.60 0.16 150)" },
        { label: "Doentes", value: doentes, icon: "alert", color: "oklch(0.6 0.22 27)" },
        { label: "Quarentena", value: quarentena, icon: "clock", color: "oklch(0.78 0.15 75)" },
      ];
    case "aves":
      return [
        { label: "Total Galpões", value: total, icon: "bird", color: "oklch(0.62 0.14 50)" },
        { label: "Ativos", value: ativos, change: `${total ? Math.round((ativos / total) * 100) : 0}%`, icon: "check", color: "oklch(0.60 0.16 150)" },
        { label: "Quarentena", value: quarentena, icon: "clock", color: "oklch(0.78 0.15 75)" },
        { label: "Capacidade", value: data.reduce((acc, a) => acc + (a.capacity || 0), 0).toLocaleString(), icon: "chart", color: "var(--primary)" },
      ];
  }
}

export default function AnimalsPage() {
  const [activeTab, setActiveTab] = useState<"bovinos" | "suinos" | "aves">("bovinos");
  
  const [bovinosData, setBovinosData] = useState<any[]>([]);
  const [suinosData, setSuinosData] = useState<any[]>([]);
  const [avesData, setAvesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchAnimals = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get("/livestock/batches/");
      const allBatches = data.results || data;
      setBovinosData(allBatches.filter((b: any) => b.species_code === "bovinos"));
      setSuinosData(allBatches.filter((b: any) => b.species_code === "suinos"));
      setAvesData(allBatches.filter((b: any) => b.species_code === "aves"));
    } catch (err) {
      console.error("Error fetching animals:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnimals();
  }, []);

  const currentData = useMemo(() => {
    switch (activeTab) {
      case "bovinos": return bovinosData;
      case "suinos": return suinosData;
      case "aves": return avesData;
    }
  }, [activeTab, bovinosData, suinosData, avesData]);

  const kpis = useMemo(() => getKPIs(activeTab, currentData), [activeTab, currentData]);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  const handleSaveAnimals = async (newAnimalsRaw: any[]) => {
    try {
      const payload = newAnimalsRaw.map(raw => ({
        batch_code: raw.numero,
        name: raw.nome || "",
        category: raw.category || raw.categoria,
        gender: raw.sexo,
        origin: raw.origem === "Comprado" ? "purchased" : raw.origem === "Nascido" ? "born" : "donated",
        purchase_value: raw.valor ? parseFloat(raw.valor) : null,
        avg_weight_kg: raw.peso ? parseFloat(raw.peso) : null,
        entry_date: raw.dataCompra || raw.nascimento || new Date().toISOString().split('T')[0],
        status: "active",
        species_code_input: activeTab, // Corrected input field name
        breed_name_input: raw.raca // Corrected input field name
      }));

      await apiClient.post("/livestock/batches/bulk_create_batches/", payload);
      
      fetchAnimals();
      setIsModalOpen(false);
    } catch (err) {
      console.error("Error saving animals:", err);
      alert("Erro ao salvar animais. Verifique o console.");
    }
  };

  return (
    <div className="d-flex" style={{ minHeight: "100vh" }}>
      <AppSidebar />
      <div className="flex-grow-1 d-flex flex-column" style={{ background: "var(--background)" }}>
        <TopBar />
        <main className="flex-grow-1 p-4 p-lg-5 overflow-auto">
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={itemVariants} className="mb-4">
              <nav className="d-flex align-items-center gap-2 small" style={{ color: "var(--muted-foreground)" }}>
                <Link href="/home" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>Home</Link>
                <ChevronRight size={14} />
                <Link href="/home/rebanho" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>Rebanho</Link>
                <ChevronRight size={14} />
                <span className="fw-semibold text-foreground">Animais</span>
              </nav>
            </motion.div>

            <motion.div variants={itemVariants} className="d-flex justify-content-between align-items-start mb-5">
              <div>
                <h1 className="fw-bold mb-1" style={{ fontSize: '2rem', letterSpacing: '-0.03em', color: "var(--foreground)" }}>Gerenciamento de Animais</h1>
                <p className="mb-0 text-muted-foreground fw-medium">Controle total do seu rebanho e produção com visão integrada</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="btn d-flex align-items-center gap-2 px-4 py-2.5 rounded-pill shadow-sm hover-bg-primary/90 transition-colors" 
                style={{ background: 'var(--primary)', color: 'white', fontWeight: 600 }}
              >
                <Plus size={20} />
                Adicionar Animal
              </button>
            </motion.div>

            <motion.div variants={itemVariants} className="d-flex justify-content-center mb-5">
              <div className="tab-pill-container">
                {animalTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setActiveTab(type.id)}
                    className={`tab-pill-button ${activeTab === type.id ? 'active' : ''}`}
                  >
                    {activeTab === type.id && (
                      <motion.div
                        layoutId="active-tab-bubble"
                        className="tab-pill-bg"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <AnimalTypeIcon icon={type.icon} color={type.color} isActive={activeTab === type.id} />
                    {type.label}
                  </button>
                ))}
              </div>
            </motion.div>

            <AnimatePresence mode="wait">
              <motion.div 
                key={activeTab}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.25 }}
              >
                {loading ? (
                  <div className="d-flex justify-content-center p-5">
                    <div className="spinner-border text-primary" role="status">
                      <span className="visually-hidden">Carregando...</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="row g-4 mb-5">
                      {kpis.map((kpi, idx) => (
                        <div key={idx} className="col-12 col-sm-6 col-lg-3">
                          <div className="dashboard-card p-4 h-100 transition-all shadow-sm hover:shadow-lg" style={{ transform: "translateY(0)", transition: "transform 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-4px)"} onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}>
                            <div className="d-flex justify-content-between align-items-start mb-3">
                              <div
                                className="rounded-circle d-flex align-items-center justify-content-center shadow-sm"
                                style={{ width: 48, height: 48, background: kpi.color, color: "#fff" }}
                              >
                                <KPIcon icon={kpi.icon} />
                              </div>
                              {kpi.change && (
                                <span className="px-2.5 py-1 rounded-pill small fw-bold" style={{ background: "var(--muted)", color: "var(--foreground)", border: "1px solid var(--border)" }}>
                                  {kpi.change}
                                </span>
                              )}
                            </div>
                            <div className="fw-bold mb-1" style={{ fontSize: "2.5rem", lineHeight: 1.1, color: "var(--foreground)" }}>
                              {kpi.value}
                            </div>
                            <div className="fw-medium text-muted-foreground" style={{ fontSize: "0.9rem" }}>{kpi.label}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mb-4">
                      <AnimalsTable 
                        data={currentData.map(d => ({
                          id: d.batch_code,
                          name: d.name || d.batch_code,
                          breed: d.breed_name || "N/D",
                          weight: d.avg_weight_kg || 0,
                          age: "N/D",
                          status: d.status === 'active' ? 'Ativo' : d.status,
                          category: activeTab === 'bovinos' ? 'bovino' : activeTab === 'suinos' ? 'suino' : 'ave'
                        }))} 
                        type={activeTab === "bovinos" ? "bovino" : activeTab === "suinos" ? "suino" : "ave"} 
                      />
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
            
          </motion.div>
        </main>
      </div>

      <AnimalFormModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        type={activeTab}
        onSave={handleSaveAnimals}
      />
    </div>
  );
}
