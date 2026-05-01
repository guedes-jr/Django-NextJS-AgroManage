"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { AnimalsTable } from "@/components/dashboard/AnimalsTable";
import { AnimalFormModal } from "@/components/dashboard/AnimalFormModal";
import { useToast } from "@/components/ui/Toast";
import { ChevronRight, Plus, Warehouse, CheckCircle2, AlertOctagon, Clock, BarChart3, Bird } from "lucide-react";
import { Icon } from "lucide-react";
import { cowHead, pigHead } from "@lucide/lab";
import { motion, AnimatePresence, Variants } from "framer-motion";
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
      const matrizes = data.filter(a => a.category?.toLowerCase() === 'matriz' || a.category?.toLowerCase() === 'matrizes').length;
      const reprodutores = data.filter(a => a.category?.toLowerCase() === 'reprodutor' || a.category?.toLowerCase() === 'reprodutores').length;
      const lotes = data.filter(a => a.category?.toLowerCase().includes('lote')).length;
      return [
        { label: "Matrizes", value: matrizes, icon: "pig", color: "oklch(0.6 0.22 27)" },
        { label: "Reprodutores", value: reprodutores, icon: "pig", color: "oklch(0.55 0.16 230)" },
        { label: "Lotes de Leitões", value: lotes, icon: "pig", color: "oklch(0.78 0.15 85)" },
        { label: "Total de Suínos", value: total, icon: "chart", color: "oklch(0.60 0.16 150)" },
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

export default function AnimalsPage() {  const { showToast } = useToast();  const [activeTab, setActiveTab] = useState<"bovinos" | "suinos" | "aves">("bovinos");
  
  const [bovinosData, setBovinosData] = useState<any[]>([]);
  const [suinosData, setSuinosData] = useState<any[]>([]);
  const [avesData, setAvesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [modalConfig, setModalConfig] = useState<{ open: boolean; initialData?: { categoria: string; sexo: string } }>({
    open: false,
  });

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

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants: Variants = {
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
        species_code_input: activeTab,
        breed_name_input: raw.raca
      }));

      console.log("Sending payload to /livestock/batches/bulk_create_batches/:", payload);
      await apiClient.post("/livestock/batches/bulk_create_batches/", payload);
      
      showToast(\"Animais salvos com sucesso! 🎉\", \"success\", 15000);
      fetchAnimals();
      setModalConfig({ open: false });
    } catch (err: any) {
      console.error(\"Error saving animals:\", err);
      
      let errorMessage = \"Erro ao salvar animais. Tente novamente.\";
      
      if (err.response?.data?.non_field_errors) {
        errorMessage = err.response.data.non_field_errors[0];
      } else if (err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      showToast(errorMessage, \"error\", 15000);
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
                <Link href="/home" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>Rebanho</Link>
                <ChevronRight size={14} />
                <Link href="/home/rebanho" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>Suínos</Link>
                <ChevronRight size={14} />
                <span className="fw-semibold text-foreground">Cadastro</span>
              </nav>
            </motion.div>

            <motion.div variants={itemVariants} className="mb-5">
              <h1 className="fw-bold mb-1" style={{ fontSize: '2rem', letterSpacing: '-0.03em', color: "var(--foreground)" }}>
                Cadastro de {activeTab === 'suinos' ? 'Suínos' : activeTab === 'bovinos' ? 'Bovinos' : 'Aves'}
              </h1>
              <p className="mb-0 text-muted-foreground fw-medium">
                {activeTab === 'suinos' 
                  ? 'Cadastre matrizes, reprodutores ou lotes de leitões adquiridos'
                  : 'Gerencie as informações de registro e produção do seu plantel'}
              </p>
            </motion.div>

            {/* Species Tab Bar */}
            <motion.div variants={itemVariants} className="d-flex justify-content-center mb-5">
              <div className="species-tab-container w-100 max-w-2xl">
                {animalTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setActiveTab(type.id)}
                    className={`species-tab ${activeTab === type.id ? 'active' : ''}`}
                  >
                    <AnimalTypeIcon icon={type.icon} color={type.color} isActive={activeTab === type.id} />
                    {type.label}
                  </button>
                ))}
              </div>
            </motion.div>

            <AnimatePresence mode="wait">
              <motion.div 
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                {loading ? (
                  <div className="d-flex justify-content-center p-5">
                    <div className="spinner-border text-primary" role="status">
                      <span className="visually-hidden">Carregando...</span>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Section: O que você deseja cadastrar? */}
                    <div className="mb-5">
                      <div className="row g-4">
                        {[
                          { 
                            title: activeTab === 'suinos' ? 'Matrizes' : 'Fêmeas', 
                            desc: 'Cadastre fêmeas para reprodução.',
                            icon: <div className="reg-card-icon" style={{ background: '#fef2f2' }}><Icon iconNode={pigHead} size={28} color="#ef4444" /></div>,
                            features: ['Controle de ciclo reprodutivo', 'Histórico de partos', 'Desempenho reprodutivo'],
                            targetCat: 'Matriz',
                            targetSex: 'Femea'
                          },
                          { 
                            title: activeTab === 'suinos' ? 'Reprodutores' : 'Machos', 
                            desc: 'Cadastre machos para reprodução.',
                            icon: <div className="reg-card-icon" style={{ background: '#eff6ff' }}><Icon iconNode={pigHead} size={28} color="#3b82f6" /></div>,
                            features: ['Controle de cobertura', 'Avaliação de desempenho', 'Histórico reprodutivo'],
                            targetCat: (activeTab === 'suinos' ? 'Cachaço' : activeTab === 'bovinos' ? 'Touro' : 'Matriz'),
                            targetSex: 'Macho'
                          },
                          { 
                            title: activeTab === 'suinos' ? 'Lote de Leitões' : 'Novos Lotes', 
                            desc: 'Cadastre lotes de leitões adquiridos.',
                            icon: <div className="reg-card-icon" style={{ background: '#fff7ed' }}><Icon iconNode={pigHead} size={28} color="#f97316" /></div>,
                            features: ['Controle de crescimento', 'Conversão alimentar', 'Desempenho do lote'],
                            targetCat: (activeTab === 'aves' ? 'Frango de Corte' : 'Lote'),
                            targetSex: 'Misto'
                          }
                        ].map((card, i) => (
                          <div key={i} className="col-12 col-md-4">
                            <div className="reg-card">
                              {card.icon}
                              <div className="reg-card-title">{card.title}</div>
                              <p className="text-muted-foreground small mb-0">{card.desc}</p>
                              
                              <ul className="reg-feature-list">
                                {card.features.map((f, j) => (
                                  <li key={j} className="reg-feature-item">
                                    <CheckCircle2 size={14} className="reg-feature-check" />
                                    {f}
                                  </li>
                                ))}
                              </ul>
                              
                              <button 
                                onClick={() => setModalConfig({ open: true, initialData: { categoria: card.targetCat, sexo: card.targetSex } })} 
                                className="btn-reg-outline"
                              >
                                Cadastrar {card.title}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Section: Resumo do Plantel */}
                    <div className="mb-5">
                      <h3 className="fw-bold mb-1" style={{ fontSize: '1.25rem' }}>Resumo do Plantel</h3>
                      <p className="text-muted-foreground small mb-4">Visão geral do seu plantel de {activeTab}</p>
                      
                      <div className="row g-4">
                        {kpis.map((kpi, idx) => (
                          <div key={idx} className="col-12 col-sm-6 col-lg-3">
                            <div className="summary-card">
                              <div className="summary-card-body">
                                <div className="d-flex justify-content-between align-items-start">
                                  <div className="summary-icon-wrapper" style={{ background: `color-mix(in srgb, ${kpi.color}, transparent 90%)`, color: kpi.color }}>
                                    <KPIcon icon={kpi.icon} />
                                  </div>
                                </div>
                                <div className="text-muted-foreground small fw-medium mb-1">{kpi.label}</div>
                                <div className="fw-bold text-foreground" style={{ fontSize: '1.75rem' }}>{kpi.value}</div>
                                <div className="text-muted-foreground" style={{ fontSize: '0.7rem' }}>Ativos</div>
                              </div>
                              <div className="summary-footer">
                                <Link href="#" className="summary-link">Ver {kpi.label.toLowerCase()}</Link>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Section: Ações Rápidas */}
                    <div className="mb-4">
                      <h3 className="fw-bold mb-1" style={{ fontSize: '1.25rem' }}>Ações Rápidas</h3>
                      <div className="mt-4 row g-3">
                        {[
                          { title: 'Transferir Animal', desc: 'Transferir animal entre setores', icon: <Warehouse size={20} />, color: '#ecfdf5', iconColor: '#059669' },
                          { title: 'Baixa de Animal', desc: 'Registrar saída ou óbito', icon: <AlertOctagon size={20} />, color: '#fffbeb', iconColor: '#d97706' },
                          { title: 'Histórico de Movimentações', desc: 'Ver todas movimentações', icon: <Clock size={20} />, color: '#eff6ff', iconColor: '#2563eb' },
                          { title: 'Relatórios', desc: 'Relatórios e análises', icon: <BarChart3 size={20} />, color: '#f5f3ff', iconColor: '#7c3aed' }
                        ].map((action, i) => (
                          <div key={i} className="col-12 col-md-6 col-xl-3">
                            <button className="quick-action-btn">
                              <div className="qa-icon-wrapper" style={{ background: action.color, color: action.iconColor }}>
                                {action.icon}
                              </div>
                              <div className="flex-grow-1">
                                <div className="fw-bold small">{action.title}</div>
                                <div className="text-muted-foreground" style={{ fontSize: '0.7rem' }}>{action.desc}</div>
                              </div>
                              <ChevronRight size={16} className="text-muted-foreground" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>

            
          </motion.div>
        </main>
      </div>

      <AnimalFormModal 
        isOpen={modalConfig.open}
        onClose={() => setModalConfig({ open: false })}
        type={activeTab}
        onSave={handleSaveAnimals}
        initialData={modalConfig.initialData}
      />
    </div>
  );
}
