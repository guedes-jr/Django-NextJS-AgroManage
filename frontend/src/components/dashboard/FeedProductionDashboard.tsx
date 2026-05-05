"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import {
  Beaker,
  ChevronRight,
  CircleDollarSign,
  Factory,
  FlaskConical,
  PackageOpen,
  Sprout,
  TrendingUp,
  Check,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { apiClient } from "@/services/api";
import "@/app/home/estoque/estoque.css";

type FormulaIngrediente = {
  id: number;
  item: number;
  item_nome: string;
  percentual: string;
  estoque_atual: string;
};

type FormulaRacao = {
  id: number;
  nome: string;
  descricao: string;
  item_final: number | null;
  item_final_nome: string | null;
  ativa: boolean;
  ingredientes: FormulaIngrediente[];
};

const ULTIMAS_PRODUCOES = [
  { data: "19/05/2025 14:30", formula: "Ração Crescimento", quantidade: 800, custoKg: 1.61, custoTotal: 1288, usuario: "João Paulo", status: "Concluída" },
  { data: "18/05/2025 09:15", formula: "Ração Engorda", quantidade: 1200, custoKg: 1.58, custoTotal: 1896, usuario: "João Paulo", status: "Concluída" },
  { data: "17/05/2025 16:45", formula: "Ração Gestação", quantidade: 600, custoKg: 1.72, custoTotal: 1032, usuario: "João Paulo", status: "Concluída" },
  { data: "16/05/2025 08:20", formula: "Ração Lactação", quantidade: 400, custoKg: 1.89, custoTotal: 756, usuario: "João Paulo", status: "Concluída" },
];

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const SPECIES_LABEL: Record<string, string> = {
  suino: "Suínos",
  ave: "Aves",
  bovino: "Bovinos",
};

interface FeedProductionDashboardProps {
  species?: string; // "suino" | "ave" | "bovino" | undefined (show all)
  showHeader?: boolean;
}

export function FeedProductionDashboard({ species, showHeader = true }: FeedProductionDashboardProps = {}) {

  const [formulas, setFormulas] = useState<FormulaRacao[]>([]);
  const [formulaId, setFormulaId] = useState<string>("");
  const [quantidade, setQuantidade] = useState(1000);
  const [quantidadeReal, setQuantidadeReal] = useState(1000);
  const [dataProducao, setDataProducao] = useState(new Date().toISOString().split('T')[0]);
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [produzindo, setProduzindo] = useState(false);
  const [loteNumber, setLoteNumber] = useState("");

  useEffect(() => {
    setLoteNumber(new Date().getTime().toString().slice(-6));
    const fetchFormulas = async () => {
      try {
        setLoading(true);
        const params = species ? `?especie=${species}` : "";
        const { data } = await apiClient.get(`/inventory/formulas/${params}`);
        const formulasList = data.results || data || [];
        setFormulas(formulasList);
        if (formulasList.length > 0) {
          setFormulaId(formulasList[0].id.toString());
        }
      } catch (err) {
        console.error("Erro ao carregar fórmulas:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchFormulas();
  }, [species]);

  const formulaSelecionada = useMemo(() => formulas.find(f => f.id.toString() === formulaId), [formulas, formulaId]);

  const calculado = useMemo(() => {
    if (!formulaSelecionada) {
      return { itens: [], custoTotal: 0, custoKg: 0, estoqueSuficiente: false, progress: 0, checkedCount: 0, eficiencia: 0 };
    }
    const composicao = formulaSelecionada.ingredientes;
    const itens = composicao.map((item) => {
      const percentual = parseFloat(item.percentual);
      const estoque = parseFloat(item.estoque_atual);
      const quantidadeNecessaria = (quantidade * percentual) / 100;
      const custoEstimado = 1.5; 
      const custoTotal = quantidadeNecessaria * custoEstimado;
      const suficiente = estoque >= quantidadeNecessaria;
      return { ...item, quantidadeNecessaria, custoTotal, suficiente, percentual, estoque };
    });
    const custoTotal = itens.reduce((acc, i) => acc + i.custoTotal, 0);
    const custoKg = quantidade > 0 ? custoTotal / quantidade : 0;
    const estoqueSuficiente = itens.every((i) => i.suficiente);
    const checkedCount = Object.values(checkedIngredients).filter(Boolean).length;
    const progress = composicao.length > 0 ? (checkedCount / composicao.length) * 100 : 0;
    const eficiencia = quantidade > 0 ? (quantidadeReal / quantidade) * 100 : 0;
    return { itens, custoTotal, custoKg, estoqueSuficiente, progress, checkedCount, eficiencia, composicao };
  }, [formulaSelecionada, quantidade, checkedIngredients, quantidadeReal]);

  const toggleIngredient = (name: string) => {
    setCheckedIngredients(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handleProduce = async () => {
    if (!formulaSelecionada || !calculado.estoqueSuficiente) return;
    
    try {
      setProduzindo(true);
      const payload = {
        formula_id: formulaSelecionada.id,
        quantidade_teorica: quantidade,
        quantidade_real: quantidadeReal
      };
      
      const { data } = await apiClient.post("/inventory/producoes/produzir/", payload);
      alert(data.status || "Produção registrada com sucesso!");
      
      // Resetar form
      setCheckedIngredients({});
      setQuantidade(1000);
      setQuantidadeReal(1000);
      
      // Recarregar fórmulas para atualizar saldos
      const result = await apiClient.get("/inventory/formulas/");
      setFormulas(result.data.results || result.data || []);
      
    } catch (err: any) {
      alert(err.response?.data?.error || "Erro ao registrar produção.");
    } finally {
      setProduzindo(false);
    }
  };

  return (
    <div className="inventory-container pb-5">
      {showHeader && (
        <div className="mb-4">
          <nav className="d-flex align-items-center gap-2 small text-muted-foreground mb-3">
            <Link href="/home" className="text-decoration-none text-muted-foreground hover-text-primary">Rebanho</Link>
            {species && (
              <>
                <ChevronRight size={14} />
                <span>{SPECIES_LABEL[species] ?? species}</span>
              </>
            )}
            <ChevronRight size={14} />
            <span className="fw-semibold text-foreground">Ração</span>
          </nav>
          <h1 className="fw-black mb-1" style={{ fontSize: "2.1rem", letterSpacing: "-0.03em" }}>
            Produzir Ração{species ? ` — ${SPECIES_LABEL[species] ?? species}` : ""}
          </h1>
          <p className="text-muted-foreground mb-0">Produza rações de forma rápida e controle os custos com eficiência.</p>
        </div>
      )}


      <div className="row g-4">
        <div className="col-12 col-xl-9">
          <div className="dashboard-card p-4 mb-4 border-2 shadow-sm" style={{ borderColor: "var(--primary)" }}>
            <div className="d-flex justify-content-between align-items-start mb-4">
              <div>
                <h3 className="fw-black mb-1" style={{ fontSize: "1.25rem", color: "var(--primary)" }}>Estação de Mistura</h3>
                <p className="small text-muted-foreground mb-0">Configure a produção e siga o checklist de ingredientes.</p>
              </div>
              <div className="badge bg-primary/10 text-primary px-3 py-2 rounded-pill fw-black">
                Lote #{loteNumber || "000000"}
              </div>
            </div>
            
            <div className="row g-3 align-items-end">
              <div className="col-12 col-md-5">
                <label className="small fw-black text-uppercase mb-2 d-block" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>Fórmula de Ração</label>
                <select className="login-input bg-transparent text-foreground rounded-xl" value={formulaId} onChange={(e) => {
                  setFormulaId(e.target.value);
                  setCheckedIngredients({});
                }} disabled={loading}>
                  {loading ? (
                    <option>Carregando...</option>
                  ) : formulas.length > 0 ? (
                    formulas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)
                  ) : (
                    <option value="">Nenhuma fórmula cadastrada</option>
                  )}
                </select>
              </div>
              <div className="col-12 col-md-3">
                <label className="small fw-black text-uppercase mb-2 d-block" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>Total Teórico (kg)</label>
                <input className="login-input bg-transparent text-foreground rounded-xl" type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value || 0))} />
              </div>
              <div className="col-12 col-md-4">
                <label className="small fw-black text-uppercase mb-2 d-block" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>Data e Hora</label>
                <input className="login-input bg-transparent text-foreground rounded-xl" type="date" value={dataProducao} onChange={(e) => setDataProducao(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Mixing Progress & Efficiency */}
          <div className="row g-4 mb-4">
            <div className="col-12 col-md-8">
              <div className="dashboard-card p-4 h-100">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h4 className="fw-bold m-0" style={{ fontSize: '0.95rem' }}>Progresso da Mistura</h4>
                  <span className="small fw-bold text-primary">{calculado.checkedCount} de {calculado.itens.length || 0} itens</span>
                </div>
                <div className="progress rounded-pill mb-2" style={{ height: 12, background: 'var(--muted)/20' }}>
                  <motion.div 
                    className="progress-bar bg-primary rounded-pill shadow-sm"
                    initial={{ width: 0 }}
                    animate={{ width: `${calculado.progress}%` }}
                    transition={{ type: "spring", stiffness: 50 }}
                  />
                </div>
                <div className="text-muted-foreground" style={{ fontSize: '0.7rem' }}>
                  {calculado.progress === 100 ? "Pronto para misturar!" : "Adicione os ingredientes e marque no checklist."}
                </div>
              </div>
            </div>
            <div className="col-12 col-md-4">
              <div className="dashboard-card p-4 h-100">
                <h4 className="fw-bold mb-3" style={{ fontSize: '0.95rem' }}>Eficiência Real</h4>
                <label className="small text-muted-foreground d-block mb-1">Total Produzido (kg)</label>
                <input 
                  className="login-input bg-transparent text-foreground rounded-xl py-1" 
                  type="number" 
                  value={quantidadeReal} 
                  onChange={(e) => setQuantidadeReal(Number(e.target.value || 0))} 
                />
                <div className="mt-2 d-flex align-items-center gap-2">
                  <span className={`small fw-bold ${calculado.eficiencia < 95 ? 'text-danger' : 'text-success'}`}>
                    {calculado.eficiencia.toFixed(1)}% de rendimento
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="dashboard-card p-0 mb-4 overflow-hidden shadow-sm">
            <div className="p-4 border-bottom border-border bg-muted/5">
              <h3 className="fw-black mb-1" style={{ fontSize: "1rem", textTransform: 'uppercase', letterSpacing: '0.02em' }}>Checklist de Ingredientes</h3>
              <p className="small text-muted-foreground mb-0">Marque cada item à medida que for adicionado ao misturador.</p>
            </div>
            <div className="table-responsive">
              <table className="table mb-0 table-hover">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-4 py-3 border-0 small text-muted-foreground" style={{ width: '40px' }}></th>
                    <th className="px-2 py-3 border-0 small text-muted-foreground">Ingrediente</th>
                    <th className="px-3 py-3 border-0 small text-muted-foreground text-center">Quantidade</th>
                    <th className="px-3 py-3 border-0 small text-muted-foreground">Estoque</th>
                    <th className="px-3 py-3 border-0 small text-muted-foreground">Custo Previsto</th>
                  </tr>
                </thead>
                <tbody>
                  {calculado.itens.length > 0 ? (
                    calculado.itens.map((i) => (
                    <tr 
                      key={i.item_nome} 
                      className={`border-bottom border-border transition-all ${checkedIngredients[i.item_nome] ? 'bg-emerald-50/20' : ''}`}
                      onClick={() => toggleIngredient(i.item_nome)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="px-4 py-3">
                        <div className={`rounded-circle d-flex align-items-center justify-content-center transition-all ${checkedIngredients[i.item_nome] ? 'bg-success text-white' : 'border border-2'}`} style={{ width: 22, height: 22 }}>
                          {checkedIngredients[i.item_nome] && <Check size={14} />}
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <div className={`fw-bold ${checkedIngredients[i.item_nome] ? 'text-muted-foreground text-decoration-line-through' : 'text-foreground'}`}>
                          {i.item_nome}
                        </div>
                        <div className="text-xs text-muted-foreground">{i.percentual}% da fórmula</div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="badge bg-muted text-foreground rounded-pill px-3 py-2 fw-black" style={{ fontSize: '0.85rem' }}>
                          {i.quantidadeNecessaria.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} kg
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className={`small fw-bold ${i.suficiente ? 'text-success' : 'text-danger'}`}>
                          {i.estoque.toLocaleString("pt-BR", { minimumFractionDigits: 0 })} kg disponíveis
                        </div>
                        <div className="progress mt-1" style={{ height: 4 }}>
                          <div className={`progress-bar ${i.suficiente ? 'bg-success' : 'bg-danger'}`} style={{ width: `${Math.min((i.estoque / i.quantidadeNecessaria) * 100, 100)}%` }} />
                        </div>
                      </td>
                      <td className="px-3 py-3 fw-bold text-foreground">
                         <span className="text-muted-foreground fw-normal fst-italic small">Variável (Real)</span>
                      </td>
                    </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-4 text-center text-muted-foreground">
                        Nenhum ingrediente na fórmula selecionada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dashboard-card p-0 overflow-hidden">
            <div className="p-4 border-bottom border-border">
              <h3 className="fw-bold mb-1" style={{ fontSize: "1.05rem" }}>Últimas produções</h3>
            </div>
            <div className="table-responsive">
              <table className="table mb-0">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-4 py-3 border-0 small text-muted-foreground">Data</th>
                    <th className="px-3 py-3 border-0 small text-muted-foreground">Fórmula</th>
                    <th className="px-3 py-3 border-0 small text-muted-foreground">Quantidade</th>
                    <th className="px-3 py-3 border-0 small text-muted-foreground">Custo por kg</th>
                    <th className="px-3 py-3 border-0 small text-muted-foreground">Custo total</th>
                    <th className="px-3 py-3 border-0 small text-muted-foreground">Usuário</th>
                    <th className="px-3 py-3 border-0 small text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ULTIMAS_PRODUCOES.map((p) => (
                    <tr key={`${p.data}-${p.formula}`} className="border-bottom border-border">
                      <td className="px-4 py-3">{p.data}</td>
                      <td className="px-3 py-3 fw-semibold">{p.formula}</td>
                      <td className="px-3 py-3">{p.quantidade.toLocaleString("pt-BR")} kg</td>
                      <td className="px-3 py-3">{money(p.custoKg)}</td>
                      <td className="px-3 py-3">{money(p.custoTotal)}</td>
                      <td className="px-3 py-3">{p.usuario}</td>
                      <td className="px-3 py-3"><span className="text-success fw-semibold">{p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-3">
          <div className="dashboard-card p-4 mb-4 bg-primary text-white border-0 shadow-lg">
            <h4 className="fw-black mb-4 text-uppercase" style={{ fontSize: "0.85rem", letterSpacing: '0.1em' }}>Resumo Final</h4>
            <div className="d-flex flex-column gap-4">
              <div className="d-flex align-items-center gap-3">
                <div className="p-3 rounded-2xl bg-white/20">
                  <PackageOpen size={24} />
                </div>
                <div>
                  <div className="small opacity-80">Total Teórico</div>
                  <div className="fw-black fs-4">{quantidade.toLocaleString("pt-BR")} kg</div>
                </div>
              </div>

              <div className="d-flex align-items-center gap-3">
                <div className="p-3 rounded-2xl bg-white/20">
                  <CircleDollarSign size={24} />
                </div>
                <div>
                  <div className="small opacity-80">Custo da Batida</div>
                  <div className="fw-black fs-4">Calculado na Baixa</div>
                </div>
              </div>

              <div className="d-flex align-items-center gap-3">
                <div className="p-3 rounded-2xl bg-white/20">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <div className="small opacity-80">Rendimento</div>
                  <div className="fw-black fs-4">{calculado.eficiencia.toFixed(1)}%</div>
                </div>
              </div>
            </div>

            <button 
              className={`btn btn-white w-100 mt-5 fw-black py-3 rounded-xl shadow-sm d-flex align-items-center justify-content-center gap-2 ${(!calculado.estoqueSuficiente || calculado.progress < 100 || produzindo || formulas.length === 0) ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!calculado.estoqueSuficiente || calculado.progress < 100 || produzindo || formulas.length === 0}
              onClick={handleProduce}
            >
              <Zap size={18} />
              {produzindo ? "REGISTRANDO..." : "FINALIZAR PRODUÇÃO"}
            </button>
            {calculado.progress < 100 && (
              <div className="text-center small mt-2 opacity-80 italic">Complete o checklist para finalizar</div>
            )}
          </div>

          <div className="dashboard-card p-4">
            <h4 className="fw-bold mb-3" style={{ fontSize: "1rem" }}>Dicas rápidas</h4>
            <div className="p-3 rounded-3 mb-3" style={{ background: "oklch(0.98 0.03 140)" }}>
              <div className="d-flex gap-2">
                <Sprout size={16} className="text-success mt-1" />
                <div className="small text-muted-foreground">Cadastre e mantenha suas fórmulas atualizadas para garantir precisão nos custos.</div>
              </div>
            </div>
            <Link 
              href={species ? `/home/rebanho/${species === 'suino' ? 'suinos' : species === 'ave' ? 'aves' : 'bovinos'}/racao/gerenciar-formulas` : "/home/estoque/producao-racao/gerenciar-formulas"} 
              className="btn btn-light w-100 fw-semibold d-flex align-items-center justify-content-between"
            >
              <span>Gerenciar fórmulas</span>
              <FlaskConical size={16} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

