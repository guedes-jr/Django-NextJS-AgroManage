"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { ChevronRight, Warehouse, CheckCircle2, AlertOctagon, Clock, BarChart3, Bird } from "lucide-react";
import { Icon } from "lucide-react";
import { cowHead, pigHead } from "@lucide/lab";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient } from "@/services/api";
import { useToast } from "@/components/ui/Toast";
import "@/app/home/rebanho/animais/animais.css";
import { AnimalFormModal } from "@/components/dashboard/AnimalFormModal";

// Helper for color-mix
const colorMix = (color: string, opacity: number) => `color-mix(in srgb, ${color}, transparent ${100 - opacity * 100}%)`;

type SpeciesType = "suinos" | "aves" | "bovinos";

interface SpeciesDashboardProps {
  species: SpeciesType;
}

interface KPICard {
  label: string;
  value: string | number;
  change?: string;
  icon: any;
  color: string;
}

function KPIcon({ icon }: { icon: any }) {
  if (typeof icon === 'string') return <span style={{ fontSize: '1.25rem' }}>{icon}</span>;
  return icon;
}

export function SpeciesDashboard({ species }: SpeciesDashboardProps) {
  const { showToast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialData, setModalInitialData] = useState<{ categoria: string; sexo: string } | undefined>();

  const fetchAnimals = async () => {
    setLoading(true);
    try {
      const { data: response } = await apiClient.get("/livestock/batches/");
      const allBatches = response.results || response;
      setData(allBatches.filter((b: any) => b.species_code === species));
    } catch (err) {
      console.error("Error fetching animals:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnimals();
  }, [species]);

  const handleSaveAnimals = async (payload: any[]) => {
    try {
      const formattedPayload = payload.map(row => ({
        batch_code: row.numero,
        quantity: parseInt(row.quantidade, 10) || 1,
        name: row.nome || "",
        category: row.categoria,
        gender: row.sexo,
        origin: row.origem === "Comprado" ? "purchased" : row.origem === "Nascido" ? "born" : "donated",
        purchase_value: parseFloat(row.valor) || null,
        avg_weight_kg: parseFloat(row.peso) || null,
        entry_date: row.dataCompra || row.nascimento || new Date().toISOString().split('T')[0],
        status: "active",
        species_code_input: species,
        breed_name_input: row.raca
      }));

      console.log("Sending payload from SpeciesDashboard:", formattedPayload);
      await apiClient.post("/livestock/batches/bulk_create_batches/", formattedPayload);
      showToast("Registros salvos com sucesso! 🎉", "success", 15000);
      await fetchAnimals();
      setIsModalOpen(false);
    } catch (err: any) {
      console.error("Error saving animals:", err);
      console.error("Full error object:", {
        status: err.response?.status,
        data: err.response?.data,
        message: err.message,
      });
      
      // Extract error message from response
      let errorMessage = "Erro ao salvar os registros. Verifique os dados e tente novamente.";
      
      // Try to extract error from different response formats
      if (err.response?.data?.non_field_errors) {
        errorMessage = err.response.data.non_field_errors[0];
      } else if (err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      } else if (typeof err.response?.data === 'object') {
        // Try to extract from field-specific errors
        const errors = err.response.data;
        const errorEntries = Object.entries(errors)
          .filter(([key, val]: any) => val && (Array.isArray(val) || typeof val === 'string'))
          .map(([key, val]: any) => {
            const message = Array.isArray(val) ? val[0] : val;
            return `${key}: ${message}`;
          });
        
        if (errorEntries.length > 0) {
          errorMessage = errorEntries.join('\n');
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      showToast(errorMessage, "error", 15000);
    }
  };

  const handleOpenModal = (title: string) => {
    let categoria = "";
    let sexo = "Misto";

    if (species === "suinos") {
      if (title === "Matrizes") { categoria = "Matriz"; sexo = "Femea"; }
      else if (title === "Reprodutores") { categoria = "Cachaço"; sexo = "Macho"; }
      else if (title === "Lotes em Terminação") { categoria = "Terminação"; sexo = "Misto"; }
    } else if (species === "bovinos") {
      if (title === "Fêmeas") { categoria = "Matriz"; sexo = "Femea"; }
      else if (title === "Machos") { categoria = "Touro"; sexo = "Macho"; }
      else if (title === "Novos Lotes") { categoria = "Bezerro"; sexo = "Misto"; }
    } else if (species === "aves") {
      if (title === "Fêmeas") { categoria = "Poedeira"; sexo = "Femea"; }
      else if (title === "Machos") { categoria = "Matriz"; sexo = "Macho"; }
      else if (title === "Novos Lotes") { categoria = "Pinto"; sexo = "Misto"; }
    }

    setModalInitialData({ categoria, sexo });
    setIsModalOpen(true);
  };

  const kpis: KPICard[] = useMemo(() => {
    const totalBatches = data.length;
    const totalAnimals = data.reduce((acc, a) => acc + (a.quantity || 1), 0);
    
    if (species === "suinos") {
        const matrizes = data.filter(a => a.category?.toLowerCase() === 'matriz' || a.category?.toLowerCase() === 'matrizes').length;
        const reprodutores = data.filter(a => a.category?.toLowerCase() === 'reprodutor' || a.category?.toLowerCase() === 'reprodutores' || a.category?.toLowerCase() === 'cachaço').length;
        const lotes = data.filter(a => a.category?.toLowerCase().includes('lote') || a.category?.toLowerCase() === 'terminação').length;
        
        return [
            { label: "Matrizes", value: matrizes, icon: "🐷", color: "oklch(0.6 0.22 27)" },
            { label: "Reprodutores", value: reprodutores, icon: "♂️", color: "oklch(0.55 0.16 230)" },
            { label: "Lotes em Terminação", value: lotes, icon: "🐖", color: "oklch(0.78 0.15 85)" },
            { label: "Total de Suínos", value: totalAnimals, icon: "📈", color: "oklch(0.55 0.14 145)" },
        ];
    }
    
    if (species === "bovinos") {
        return [
            { label: "Total Bovinos", value: totalAnimals, icon: "🐄", color: "oklch(0.55 0.16 145)" },
            { label: "Lotes / Animais", value: totalBatches, icon: "✅", color: "oklch(0.60 0.16 150)" },
            { label: "Doentes", value: data.filter(a => a.status === 'sick').length, icon: "⚠️", color: "oklch(0.6 0.22 27)" },
            { label: "Quarentena", value: data.filter(a => a.status === 'quarantine').length, icon: "🕒", color: "oklch(0.78 0.15 75)" },
        ];
    }
    
    return [
        { label: "Total Aves", value: totalAnimals, icon: "🐔", color: "oklch(0.62 0.14 50)" },
        { label: "Lotes", value: totalBatches, icon: "✅", color: "oklch(0.60 0.16 150)" },
        { label: "Quarentena", value: data.filter(a => a.status === 'quarantine').length, icon: "🕒", color: "oklch(0.78 0.15 75)" },
        { label: "Capacidade", value: data.reduce((acc, a) => acc + (a.capacity || 0), 0).toLocaleString(), icon: "📊", color: "var(--primary)" },
    ];
  }, [species, data]);

  const speciesName = {
    suinos: "Suínos",
    aves: "Aves",
    bovinos: "Bovinos"
  }[species];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="view-transition"
    >
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small" style={{ color: "var(--muted-foreground)" }}>
          <Link href="/home" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>Rebanho</Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">{speciesName}</span>
          <ChevronRight size={14} />
          <span className="text-muted-foreground">Cadastro</span>
        </nav>
      </div>

      <div className="mb-5">
        <h1 className="fw-bold mb-1" style={{ fontSize: '2rem', letterSpacing: '-0.03em', color: "var(--foreground)" }}>
          Cadastro de {speciesName}
        </h1>
        <p className="mb-0 text-muted-foreground fw-medium">
          {species === 'suinos' 
            ? 'Cadastre matrizes, reprodutores ou lotes de leitões adquiridos'
            : 'Gerencie as informações de registro e produção do seu plantel'}
        </p>
      </div>

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
                  title: species === 'suinos' ? 'Matrizes' : 'Fêmeas', 
                  desc: 'Cadastre fêmeas para reprodução.',
                  icon: <div className="reg-card-icon" style={{ background: '#fef2f2' }}><span style={{ fontSize: '1.75rem' }}>{species === 'suinos' ? '🐷' : '🐄'}</span></div>,
                  features: ['Controle de ciclo reprodutivo', 'Histórico de partos', 'Desempenho reprodutivo']
                },
                { 
                  title: species === 'suinos' ? 'Reprodutores' : 'Machos', 
                  desc: 'Cadastre machos para reprodução.',
                  icon: <div className="reg-card-icon" style={{ background: '#eff6ff' }}><span style={{ fontSize: '1.75rem' }}>♂️</span></div>,
                  features: ['Controle de cobertura', 'Avaliação de desempenho', 'Histórico reprodutivo']
                },
                { 
                  title: species === 'suinos' ? 'Lotes em Terminação' : 'Novos Lotes', 
                  desc: 'Cadastre lotes de animais adquiridos.',
                  icon: <div className="reg-card-icon" style={{ background: '#fff7ed' }}><span style={{ fontSize: '1.75rem' }}>{species === 'suinos' ? '🐖' : '📦'}</span></div>,
                  features: ['Controle de crescimento', 'Conversão alimentar', 'Desempenho do lote']
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
                    
                    <button onClick={() => handleOpenModal(card.title)} className="btn-reg-outline">
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
            <p className="text-muted-foreground small mb-4">Visão geral do seu plantel de {speciesName.toLowerCase()}</p>
            
            <div className="row g-4">
              {kpis.map((kpi, idx) => (
                <div key={idx} className="col-12 col-sm-6 col-lg-3">
                  <div className="summary-card">
                    <div className="summary-card-body">
                      <div className="d-flex justify-content-between align-items-start">
                        <div className="summary-icon-wrapper" style={{ background: colorMix(kpi.color, 0.1), color: kpi.color }}>
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
      <AnimalFormModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        type={species}
        onSave={handleSaveAnimals}
        initialData={modalInitialData}
      />
    </motion.div>
  );
}
