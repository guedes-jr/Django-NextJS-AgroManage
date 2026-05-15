"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  ChevronLeft, 
  Calendar, 
  Scale, 
  Activity, 
  Heart, 
  Database,
  ChevronRight,
  Loader2,
  TrendingUp,
  History,
  Info,
  Syringe,
  Microscope,
  Baby,
  Clock,
  ClipboardList
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchAnimalDetails, fetchAnimalHistory, registerWeight, registerVaccination, registerMating } from "@/services/livestockService";
import { useToast } from "@/components/ui/Toast";

import { breedDictionary } from "@/constants/breedInfo";
import { BreedInfoModal } from "@/components/animal/BreedInfoModal";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";

// ─── Sub-components ──────────────────────────────────────────────────────────

const StatCard = ({ label, value, icon, color, subValue }: any) => (
  <div className="stat-card p-3 rounded-4 border border-border shadow-sm d-flex flex-column gap-2 bg-white h-100">
    <div className="d-flex align-items-center gap-3">
      <div className="rounded-circle p-2 d-flex align-items-center justify-content-center" style={{ background: `color-mix(in srgb, ${color}, transparent 85%)`, color: color }}>
        {icon}
      </div>
      <div>
        <div className="text-muted-foreground small fw-medium">{label}</div>
        <div className="fw-bold text-foreground" style={{ fontSize: '1.2rem' }}>{value}</div>
      </div>
    </div>
    {subValue && (
      <div className="text-muted-foreground small mt-1 pt-2 border-top border-border">
        {subValue}
      </div>
    )}
  </div>
);

const TimelineItem = ({ event }: { event: any }) => {
  const getIcon = (type: string) => {
    switch (type) {
      case 'weight': return <Scale size={16} />;
      case 'vaccination': return <Syringe size={16} />;
      case 'mating': return <Heart size={16} />;
      case 'pregnancy': return <Microscope size={16} />;
      case 'birth': return <Baby size={16} />;
      case 'health': return <Activity size={16} />;
      default: return <History size={16} />;
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case 'weight': return 'oklch(0.6 0.15 220)';
      case 'vaccination': return 'oklch(0.6 0.15 150)';
      case 'mating': return 'oklch(0.6 0.15 340)';
      case 'pregnancy': return 'oklch(0.6 0.15 280)';
      case 'birth': return 'oklch(0.6 0.15 110)';
      case 'health': return 'oklch(0.6 0.22 27)';
      default: return 'var(--muted-foreground)';
    }
  };

  return (
    <div className="timeline-item d-flex gap-4 pb-4 position-relative">
      <div className="timeline-line position-absolute h-100 border-start border-border opacity-50" style={{ left: '16px', top: '32px' }}></div>
      <div className="timeline-icon-wrapper flex-shrink-0 z-1">
        <div className="rounded-circle p-2 d-flex align-items-center justify-content-center border border-border shadow-sm bg-card" style={{ color: getColor(event.type) }}>
          {getIcon(event.type)}
        </div>
      </div>
      <div className="timeline-content pb-2 w-100">
        <div className="d-flex align-items-center justify-content-between mb-1">
          <div className="d-flex align-items-center gap-2">
            <span className="small fw-semibold text-muted-foreground">{new Date(event.date).toLocaleDateString('pt-BR')}</span>
            <span className="badge bg-muted text-muted-foreground border-0 rounded-pill small" style={{ fontSize: '0.65rem' }}>{event.status}</span>
          </div>
        </div>
        <div className="dashboard-card p-3 rounded-4 bg-muted/20 border border-border mt-2">
          <h6 className="fw-bold text-foreground mb-1">{event.title}</h6>
          <p className="text-muted-foreground small mb-0">{event.subtitle}</p>
        </div>
      </div>
    </div>
  );
};

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function AnimalDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  
  const [animal, setAnimal] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("geral");
  const [showBreedInfo, setShowBreedInfo] = useState(false);

  // Quick Action State
  const [qaModal, setQaModal] = useState<{ open: boolean; type: string; title: string }>({ open: false, type: '', title: '' });
  const [qaFormData, setQaFormData] = useState<any>({});

  const loadData = async () => {
    try {
      const [details, fullHistory] = await Promise.all([
        fetchAnimalDetails(id as string),
        fetchAnimalHistory(id as string)
      ]);
      setAnimal(details);
      setHistory(fullHistory);
    } catch (err) {
      showToast("Erro ao carregar dados do animal", "error");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleQuickActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (qaModal.type === 'weight') {
        await registerWeight(animal.id, { weight_kg: parseFloat(qaFormData.weight), weighing_date: qaFormData.date });
      } else if (qaModal.type === 'vaccine') {
        await registerVaccination(animal.id, { vaccine_name: qaFormData.name, application_date: qaFormData.date });
      } else if (qaModal.type === 'mating') {
        await registerMating(animal.id, { mating_date: qaFormData.date, mating_type: qaFormData.mating_type, sire_info: qaFormData.sire });
      }
      showToast("Ação registrada com sucesso!", "success");
      setQaModal({ open: false, type: '', title: '' });
      setQaFormData({});
      loadData(); // Refetch
    } catch (err) {
      showToast("Erro ao registrar ação", "error");
    }
  };

  if (loading) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center min-vh-100 gap-3">
        <Loader2 className="spin-animation text-primary" size={40} />
        <span className="text-muted-foreground fw-medium">Carregando ficha premium do animal...</span>
      </div>
    );
  }

  if (!animal) return null;

  const breedInfo = animal.breed_name ? breedDictionary[animal.breed_name] : null;

  // --- Calculations ---
  const isFemale = animal.gender === 'F';
  const entryDate = new Date(animal.entry_date);
  const birthDate = animal.birth_date ? new Date(animal.birth_date) : null;
  const now = new Date();
  
  const ageDays = birthDate ? Math.floor((now.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24)) : null;
  const ageString = ageDays ? `${Math.floor(ageDays / 30)}m ${ageDays % 30}d` : 'N/A';

  const birthsCount = history.filter(e => e.type === 'birth').length;
  const ordemDeParto = isFemale ? birthsCount + 1 : 'N/A';

  const lastMating = history.find(e => e.type === 'mating');
  const isVazia = animal.reproductive_status === 'vazia';
  const diasAbertos = isFemale && isVazia && lastMating ? Math.floor((now.getTime() - new Date(lastMating.date).getTime()) / (1000 * 60 * 60 * 24)) : 'N/A';

  const weights = history.filter(e => e.type === 'weight').sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let gpd = '0.00';
  if (weights.length > 1) {
    const firstW = weights[0];
    const lastW = weights[weights.length - 1];
    const days = Math.floor((new Date(lastW.date).getTime() - new Date(firstW.date).getTime()) / (1000 * 60 * 60 * 24));
    if (days > 0) gpd = ((parseFloat(lastW.subtitle.match(/\\d+(\\.\\d+)?/)?.[0] || '0') - parseFloat(firstW.subtitle.match(/\\d+(\\.\\d+)?/)?.[0] || '0')) / days).toFixed(2);
  } else if (animal.initial_weight_kg && animal.current_weight_kg) {
    const days = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
    if (days > 0) gpd = ((animal.current_weight_kg - animal.initial_weight_kg) / days).toFixed(2);
  }

  const weightChartData = weights.map(w => ({
    data: new Date(w.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    peso: parseFloat(w.subtitle.match(/\\d+(\\.\\d+)?/)?.[0] || '0')
  }));

  if (weightChartData.length === 0 && animal.initial_weight_kg) {
    weightChartData.push({ data: entryDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }), peso: animal.initial_weight_kg });
    if (animal.current_weight_kg && animal.current_weight_kg !== animal.initial_weight_kg) {
        weightChartData.push({ data: now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }), peso: animal.current_weight_kg });
    }
  }

  return (
    <>
      <style>{`
        .full-bleed-banner {
          margin-top: -1rem;
          margin-left: -1rem;
          margin-right: -1rem;
        }
        @media (min-width: 992px) {
          .full-bleed-banner {
            margin-top: -3rem;
            margin-left: -3rem;
            margin-right: -3rem;
          }
        }
      `}</style>
      <div className="min-vh-100 bg-background position-relative full-bleed-banner">
        {/* Background Banner */}
        {breedInfo?.imageUrl && (
          <div className="position-absolute top-0 start-0 w-100 overflow-hidden pe-none" style={{ height: '400px', zIndex: 0 }}>
            {/* Fade out at the bottom */}
            <div className="position-absolute top-0 start-0 w-100 h-100" style={{ background: 'linear-gradient(to bottom, transparent 40%, var(--background) 100%)', zIndex: 1 }}></div>
            {/* Fade out at the left, keeping right clear */}
            <div className="position-absolute top-0 start-0 w-100 h-100" style={{ background: 'linear-gradient(to right, var(--background) 0%, transparent 60%)', zIndex: 1 }}></div>
            <img 
              src={breedInfo.imageUrl} 
              alt={breedInfo.name} 
              className="w-100 h-100 object-fit-cover" 
              style={{ objectPosition: 'center 30%', opacity: 0.9, mixBlendMode: 'darken' }} 
            />
          </div>
        )}

      <div className="p-4 p-md-5 position-relative z-1">
        {/* Navigation */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div className="d-flex align-items-center gap-2">
          <button onClick={() => router.back()} className="btn btn-light rounded-circle p-2 border-border shadow-sm">
            <ChevronLeft size={20} />
          </button>
          <div className="d-flex align-items-center gap-2 text-muted-foreground small">
            <span>Rebanho</span>
            <ChevronRight size={14} />
            <span>Suínos</span>
            <ChevronRight size={14} />
            <span className="text-foreground fw-semibold">{animal.identifier}</span>
          </div>
        </div>
        
        {/* Quick Actions Bar */}
        <div className="d-flex gap-2">
          <button className="btn btn-primary d-flex align-items-center gap-2 rounded-pill px-3 py-2 shadow-sm" onClick={() => setQaModal({ open: true, type: 'weight', title: 'Registrar Peso' })}>
            <Scale size={16} /> <span className="d-none d-sm-inline">Pesar</span>
          </button>
          <button className="btn btn-light border border-border text-foreground hover-bg-muted d-flex align-items-center gap-2 rounded-pill px-3 py-2 shadow-sm" onClick={() => setQaModal({ open: true, type: 'vaccine', title: 'Registrar Vacina' })}>
            <Syringe size={16} /> <span className="d-none d-sm-inline">Vacinar</span>
          </button>
          {isFemale && (
            <button className="btn btn-light border border-border text-foreground hover-bg-muted d-flex align-items-center gap-2 rounded-pill px-3 py-2 shadow-sm" onClick={() => setQaModal({ open: true, type: 'mating', title: 'Registrar Cobertura' })}>
              <Heart size={16} /> <span className="d-none d-sm-inline">Cobertura</span>
            </button>
          )}
        </div>
      </div>

      {/* Premium Header */}
      <div className="row g-4 mb-4">
        <div className="col-lg-7">
          <div className="dashboard-card p-4 rounded-4 bg-card shadow-sm border border-border h-100 position-relative overflow-hidden">
            <div className="position-absolute top-0 end-0 w-50 h-100 bg-primary/5" style={{ borderRadius: '50% 0 0 50%', transform: 'translateX(20%)' }}></div>
            <div className="d-flex flex-column flex-md-row align-items-md-center gap-4 position-relative z-1">
              <div className="animal-avatar rounded-circle bg-background d-flex align-items-center justify-content-center border border-border shadow-sm" style={{ width: '90px', height: '90px' }}>
                <span className="display-4">{isFemale ? '🐷' : '🐗'}</span>
              </div>
              <div className="flex-grow-1">
                <div className="d-flex align-items-center gap-3 mb-2">
                  <h1 className="display-6 fw-bold text-foreground mb-0">{animal.identifier}</h1>
                  <span className={`badge rounded-pill px-3 py-1 fw-semibold ${animal.status === 'active' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                    {animal.status === 'active' ? 'Ativo' : animal.status}
                  </span>
                </div>
                <div className="d-flex flex-wrap align-items-center gap-x-4 gap-y-2 text-muted-foreground mt-3">
                  <div className="d-flex align-items-center gap-1 bg-muted/30 px-2 py-1 rounded-pill">
                    <Database size={14} />
                    <span className="small fw-medium">{animal.category || 'N/A'}</span>
                  </div>
                  <div 
                    className="d-flex align-items-center gap-1 bg-muted/30 px-2 py-1 rounded-pill cursor-pointer hover-bg-muted transition-colors" 
                    onClick={() => breedInfo && setShowBreedInfo(true)}
                    title={breedInfo ? "Clique para ver a Ficha Zootécnica completa desta raça" : "Raça sem ficha detalhada"}
                  >
                    <Info size={14} className={breedInfo ? "text-primary" : "text-muted-foreground opacity-50"} />
                    <span className="small fw-medium">{animal.breed_name || 'Raça Indefinida'}</span>
                  </div>
                  <div className="d-flex align-items-center gap-1 bg-muted/30 px-2 py-1 rounded-pill">
                    <Activity size={14} />
                    <span className="text-capitalize small fw-medium">{animal.reproductive_status?.replace('_', ' ') || 'Normal'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-lg-5">
          <div className="row g-3 h-100">
            <div className="col-6">
              <StatCard label="Peso Atual" value={`${animal.current_weight_kg || 0} kg`} icon={<Scale size={20} />} color="oklch(0.6 0.15 220)" subValue={`GPD: ${gpd} kg/dia`} />
            </div>
            <div className="col-6">
              <StatCard label="Idade" value={ageString} icon={<Calendar size={20} />} color="oklch(0.6 0.15 150)" subValue={`Entrada: ${entryDate.toLocaleDateString('pt-BR')}`} />
            </div>
            {isFemale && (
              <>
                <div className="col-6">
                  <StatCard label="Ordem de Parto" value={ordemDeParto} icon={<Baby size={20} />} color="oklch(0.6 0.15 340)" subValue={isVazia ? "Aguardando cobertura" : "Em reprodução"} />
                </div>
                <div className="col-6">
                  <StatCard label="Dias Abertos" value={diasAbertos} icon={<Clock size={20} />} color="oklch(0.6 0.22 27)" subValue="Desde a última cobertura" />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4 border-bottom w-100 flex-nowrap overflow-auto hide-scrollbar" style={{ borderBottom: '1px solid var(--border)' }}>
        {["geral", "reproducao", "alimentacao", "clinico"].map((t) => {
          const isActive = activeTab === t;
          return (
            <li className="nav-item" key={t}>
              <button
                onClick={() => setActiveTab(t)}
                className={`nav-link d-flex align-items-center gap-2 py-3 px-4 fw-semibold border-0 border-bottom border-3 rounded-0 text-capitalize whitespace-nowrap ${
                  isActive
                    ? "active text-success border-success bg-transparent"
                    : "text-muted border-transparent hover-bg-light"
                }`}
                style={{ fontSize: '0.9rem', marginBottom: '-1px' }}
              >
                {t}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Tab Content */}
      <div className="tab-content pt-2">
        <AnimatePresence mode="wait">
          {activeTab === 'geral' && (
            <motion.div key="geral" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="row g-4">
              <div className="col-lg-8">
                <div className="dashboard-card p-4 rounded-4 bg-card shadow-sm border border-border h-100">
                  <div className="d-flex align-items-center gap-2 mb-4">
                    <History size={20} className="text-primary" />
                    <h5 className="fw-bold mb-0">Linha do Tempo Completa</h5>
                  </div>
                  <div className="timeline-container ps-2 mt-4" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                    {history.length > 0 ? (
                      history.map((event, i) => <TimelineItem key={i} event={event} />)
                    ) : (
                      <div className="text-center py-5 text-muted-foreground">Nenhum registro histórico encontrado.</div>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-lg-4">
                <div className="dashboard-card p-4 rounded-4 bg-card shadow-sm border border-border mb-4">
                  <h6 className="fw-bold mb-3 d-flex align-items-center gap-2"><ClipboardList size={18} className="text-primary"/> Ficha Cadastral</h6>
                  <ul className="list-unstyled mb-0 d-flex flex-column gap-3">
                    <li className="d-flex justify-content-between border-bottom border-border pb-2">
                      <span className="text-muted-foreground small">Lote de Origem</span>
                      <span className="fw-medium">{animal.batch_code || '—'}</span>
                    </li>
                    <li className="d-flex justify-content-between border-bottom border-border pb-2">
                      <span className="text-muted-foreground small">Data de Nascimento</span>
                      <span className="fw-medium">{birthDate ? birthDate.toLocaleDateString('pt-BR') : '—'}</span>
                    </li>
                    <li className="d-flex justify-content-between border-bottom border-border pb-2">
                      <span className="text-muted-foreground small">Peso Inicial</span>
                      <span className="fw-medium">{animal.initial_weight_kg || 0} kg</span>
                    </li>
                    <li className="d-flex justify-content-between pb-1">
                      <span className="text-muted-foreground small">Origem</span>
                      <span className="fw-medium text-capitalize">{animal.origin || '—'}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'reproducao' && (
            <motion.div key="reproducao" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <div className="row g-4">
                {history.filter(e => ['mating', 'pregnancy', 'birth'].includes(e.type)).map((event, i) => (
                  <div key={i} className="col-md-6 col-lg-4">
                    <div className="dashboard-card p-4 rounded-4 bg-card shadow-sm border border-border h-100 position-relative overflow-hidden">
                      <div className="position-absolute top-0 start-0 w-2 h-100 bg-primary/50"></div>
                      <div className="d-flex justify-content-between mb-3 ps-2">
                        <span className="small fw-semibold text-muted-foreground">{new Date(event.date).toLocaleDateString('pt-BR')}</span>
                        <span className="badge bg-primary/10 text-primary border-0 rounded-pill small">{event.type}</span>
                      </div>
                      <h6 className="fw-bold mb-2 ps-2">{event.title}</h6>
                      <p className="text-muted-foreground small mb-0 ps-2">{event.subtitle}</p>
                    </div>
                  </div>
                ))}
                {history.filter(e => ['mating', 'pregnancy', 'birth'].includes(e.type)).length === 0 && (
                  <div className="col-12 text-center py-5 text-muted-foreground">Sem histórico reprodutivo.</div>
                )}
              </div>
            </motion.div>
          )}
          
          {activeTab === 'alimentacao' && (
             <motion.div key="alimentacao" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="row g-4">
               <div className="col-12">
                 <div className="dashboard-card p-4 rounded-4 bg-card shadow-sm border border-border">
                    <div className="d-flex align-items-center gap-2 mb-4">
                      <TrendingUp size={20} className="text-primary" />
                      <h5 className="fw-bold mb-0">Evolução de Peso</h5>
                    </div>
                    {weightChartData.length > 1 ? (
                      <div style={{ height: '350px', width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={weightChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorPeso" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="oklch(0.55 0.16 230)" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="oklch(0.55 0.16 230)" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                            <XAxis dataKey="data" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} dx={-10} domain={['auto', 'auto']} />
                            <RechartsTooltip 
                              contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                              itemStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
                            />
                            <Area type="monotone" dataKey="peso" name="Peso (kg)" stroke="oklch(0.55 0.16 230)" strokeWidth={3} fillOpacity={1} fill="url(#colorPeso)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="text-center py-5 text-muted-foreground d-flex flex-column align-items-center gap-2">
                        <Scale size={32} className="opacity-50" />
                        <span>Dados insuficientes para gerar o gráfico. Registre mais pesagens.</span>
                      </div>
                    )}
                 </div>
               </div>
             </motion.div>
          )}

          {activeTab === 'clinico' && (
            <motion.div key="clinico" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <div className="row g-4">
                {history.filter(e => ['vaccination', 'health'].includes(e.type)).map((event, i) => (
                  <div key={i} className="col-md-6">
                    <div className="dashboard-card p-4 rounded-4 bg-card shadow-sm border border-border h-100 d-flex gap-4 align-items-center">
                      <div className="rounded-circle p-3 bg-muted/20 text-muted-foreground">
                        {event.type === 'vaccination' ? <Syringe size={24} /> : <Activity size={24} />}
                      </div>
                      <div>
                        <div className="d-flex align-items-center gap-2 mb-1">
                          <h6 className="fw-bold mb-0">{event.title}</h6>
                          <span className="badge bg-muted text-muted-foreground border-0 rounded-pill" style={{ fontSize: '0.65rem' }}>{new Date(event.date).toLocaleDateString('pt-BR')}</span>
                        </div>
                        <p className="text-muted-foreground small mb-0">{event.subtitle}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {history.filter(e => ['vaccination', 'health'].includes(e.type)).length === 0 && (
                  <div className="col-12 text-center py-5 text-muted-foreground">Sem registros clínicos.</div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {breedInfo && (
        <BreedInfoModal isOpen={showBreedInfo} onClose={() => setShowBreedInfo(false)} breed={breedInfo} />
      )}

      {/* Quick Action Modal */}
      <Modal 
        isOpen={qaModal.open} 
        onClose={() => setQaModal({ open: false, type: '', title: '' })} 
        title={qaModal.title}
        footer={
          <div className="d-flex justify-content-end gap-2 w-100">
            <button type="button" className="btn btn-light rounded-pill px-4" onClick={() => setQaModal({ open: false, type: '', title: '' })}>Cancelar</button>
            <button type="submit" form="quick-action-form" className="btn btn-primary rounded-pill px-4">Salvar Registro</button>
          </div>
        }
      >
        <form id="quick-action-form" onSubmit={handleQuickActionSubmit} className="d-flex flex-column gap-3 p-4">
          {qaModal.type === 'weight' && (
            <>
              <Input label="Peso (kg)" type="number" step="0.01" required value={qaFormData.weight || ''} onChange={e => setQaFormData({...qaFormData, weight: e.target.value})} />
              <Input label="Data" type="date" required value={qaFormData.date || new Date().toISOString().split('T')[0]} onChange={e => setQaFormData({...qaFormData, date: e.target.value})} />
            </>
          )}
          {qaModal.type === 'vaccine' && (
            <>
              <Input label="Nome da Vacina" required value={qaFormData.name || ''} onChange={e => setQaFormData({...qaFormData, name: e.target.value})} />
              <Input label="Data" type="date" required value={qaFormData.date || new Date().toISOString().split('T')[0]} onChange={e => setQaFormData({...qaFormData, date: e.target.value})} />
            </>
          )}
          {qaModal.type === 'mating' && (
            <>
              <Input label="Data da Cobertura" type="date" required value={qaFormData.date || new Date().toISOString().split('T')[0]} onChange={e => setQaFormData({...qaFormData, date: e.target.value})} />
              <div className="form-group mb-3">
                <label className="form-label small fw-medium text-foreground">Tipo de Cobertura</label>
                <select className="form-select bg-card text-foreground border-border rounded-3" value={qaFormData.mating_type || 'ai'} onChange={e => setQaFormData({...qaFormData, mating_type: e.target.value})}>
                  <option value="ai">Inseminação Artificial</option>
                  <option value="natural">Monta Natural</option>
                </select>
              </div>
              <Input label="Reprodutor" required value={qaFormData.sire || ''} onChange={e => setQaFormData({...qaFormData, sire: e.target.value})} />
            </>
          )}
        </form>
      </Modal>

      </div>
    </div>
    </>
  );
}
