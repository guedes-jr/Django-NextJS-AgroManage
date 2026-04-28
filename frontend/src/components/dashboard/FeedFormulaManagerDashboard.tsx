"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Search, Trash2, Save } from "lucide-react";
import { apiClient } from "@/services/api";
import "@/app/home/estoque/estoque.css";

type FormulaIngredient = {
  item: string | number; // ID
  item_nome?: string;
  percentual: number;
};

type Formula = {
  id?: number;
  nome: string;
  descricao: string;
  item_final?: number | null;
  item_final_nome?: string | null;
  ativa: boolean;
  ingredientes: FormulaIngredient[];
};

type InventoryItem = {
  id: number;
  nome: string;
};

export function FeedFormulaManagerDashboard() {
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resFormulas, resItems] = await Promise.all([
        apiClient.get("inventory/formulas/"),
        apiClient.get("inventory/items/all_items/")
      ]);
      setFormulas(resFormulas.data.results || resFormulas.data || []);
      setInventoryItems(resItems.data || []);
    } catch (err) {
      console.error("Erro ao buscar dados", err);
    } finally {
      setLoading(false);
    }
  };

  const selected = formulas[selectedIndex];

  const filteredIndexes = useMemo(() => {
    return formulas
      .map((f, index) => ({ f, index }))
      .filter(({ f }) => f.nome.toLowerCase().includes(search.toLowerCase()))
      .map(({ index }) => index);
  }, [formulas, search]);

  const updateIngredient = (idx: number, field: "percentual" | "item", value: any) => {
    setFormulas((prev) => {
      const next = [...prev];
      const formula = { ...next[selectedIndex] };
      const ingredientes = [...formula.ingredientes];
      ingredientes[idx] = { ...ingredientes[idx], [field]: value };
      
      if (field === "item") {
        const selectedItem = inventoryItems.find(i => i.id.toString() === value.toString());
        if (selectedItem) {
          ingredientes[idx].item_nome = selectedItem.nome;
        }
      }
      
      formula.ingredientes = ingredientes;
      next[selectedIndex] = formula;
      return next;
    });
  };

  const addIngredient = () => {
    setFormulas((prev) => {
      const next = [...prev];
      const formula = { ...next[selectedIndex] };
      formula.ingredientes = [...formula.ingredientes, { item: "", percentual: 0 }];
      next[selectedIndex] = formula;
      return next;
    });
  };

  const removeIngredient = (idx: number) => {
    setFormulas((prev) => {
      const next = [...prev];
      const formula = { ...next[selectedIndex] };
      formula.ingredientes = formula.ingredientes.filter((_, i) => i !== idx);
      next[selectedIndex] = formula;
      return next;
    });
  };

  const handleCreateNew = () => {
    const nova: Formula = {
      nome: "Nova Fórmula",
      descricao: "",
      ativa: true,
      ingredientes: []
    };
    setFormulas(prev => [nova, ...prev]);
    setSelectedIndex(0);
  };

  const handleSave = async () => {
    if (!selected) return;
    if (totals.percentual !== 100) {
      alert("A soma dos percentuais deve ser exatamente 100%.");
      return;
    }
    
    try {
      setSaving(true);
      if (selected.id) {
        await apiClient.put(`inventory/formulas/${selected.id}/`, selected);
        alert("Fórmula atualizada com sucesso!");
      } else {
        const res = await apiClient.post("inventory/formulas/", selected);
        setFormulas(prev => prev.map((f, i) => i === selectedIndex ? res.data : f));
        alert("Fórmula criada com sucesso!");
      }
      fetchData();
    } catch (err) {
      alert("Erro ao salvar fórmula.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected || !selected.id) {
      setFormulas(prev => prev.filter((_, i) => i !== selectedIndex));
      setSelectedIndex(0);
      return;
    }
    
    if (confirm("Tem certeza que deseja excluir esta fórmula?")) {
      try {
        setSaving(true);
        await apiClient.delete(`inventory/formulas/${selected.id}/`);
        alert("Fórmula excluída.");
        fetchData();
        setSelectedIndex(0);
      } catch (err) {
        alert("Erro ao excluir.");
        console.error(err);
      } finally {
        setSaving(false);
      }
    }
  };

  const totals = useMemo(() => {
    if (!selected) return { percentual: 0 };
    return {
      percentual: selected.ingredientes.reduce((acc, i) => acc + Number(i.percentual || 0), 0),
    };
  }, [selected]);

  if (loading && formulas.length === 0) {
    return <div className="p-5 text-center text-muted-foreground">Carregando fórmulas...</div>;
  }

  return (
    <div className="inventory-container pb-5">
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small text-muted-foreground mb-3">
          <Link href="/home/estoque/resumo" className="text-decoration-none text-muted-foreground hover-text-primary">Estoque</Link>
          <ChevronRight size={14} />
          <Link href="/home/estoque/producao-racao" className="text-decoration-none text-muted-foreground hover-text-primary">Produção de Ração</Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">Gerenciar Fórmulas</span>
        </nav>
        <h1 className="fw-black mb-1" style={{ fontSize: "2.1rem", letterSpacing: "-0.03em" }}>Gerenciar Fórmula</h1>
        <p className="text-muted-foreground mb-0">Cadastre e edite as fórmulas das rações da sua granja.</p>
      </div>

      <div className="row g-4">
        <div className="col-12 col-xl-3">
          <div className="dashboard-card p-3">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <h4 className="fw-bold mb-0" style={{ fontSize: "0.95rem" }}>Fórmulas cadastradas</h4>
              <button onClick={handleCreateNew} className="btn btn-link text-success p-0 small fw-semibold"><Plus size={14} className="me-1" />Nova fórmula</button>
            </div>
            <div className="position-relative mb-2">
              <Search size={14} className="position-absolute text-muted-foreground" style={{ left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input className="form-control ps-5" placeholder="Buscar fórmula..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="d-flex flex-column gap-2">
              {filteredIndexes.map((idx) => {
                const f = formulas[idx];
                const active = idx === selectedIndex;
                return (
                  <button
                    key={f.nome}
                    onClick={() => setSelectedIndex(idx)}
                    className={`btn text-start p-3 rounded-3 border ${active ? "border-success bg-success-subtle" : "btn-light border-border"}`}
                  >
                    <div className="fw-semibold">{f.nome}</div>
                    <div className="small text-muted-foreground">{f.ingredientes.length} ingredientes</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-6">
          {selected ? (
          <div className="dashboard-card p-4">
            <div className="row g-3 mb-3">
              <div className="col-12">
                <label className="small fw-semibold mb-1 d-block">Nome da fórmula *</label>
                <input className="form-control" value={selected.nome} onChange={(e) => setFormulas((prev) => prev.map((f, i) => i === selectedIndex ? { ...f, nome: e.target.value } : f))} />
              </div>
              <div className="col-12">
                <label className="small fw-semibold mb-1 d-block">Descrição (opcional)</label>
                <textarea className="form-control" rows={2} value={selected.descricao} onChange={(e) => setFormulas((prev) => prev.map((f, i) => i === selectedIndex ? { ...f, descricao: e.target.value } : f))} />
              </div>
            </div>

            <h4 className="fw-bold mb-1" style={{ fontSize: "1rem" }}>Composição da fórmula</h4>
            <p className="small text-muted-foreground mb-3">Informe os ingredientes e a porcentagem de cada um na fórmula. A soma deve ser 100%.</p>
            <div className="table-responsive">
              <table className="table mb-0">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-3 py-3 border-0 small text-muted-foreground">Ingrediente</th>
                    <th className="px-3 py-3 border-0 small text-muted-foreground" style={{ width: 140 }}>% na fórmula</th>
                    <th className="px-3 py-3 border-0 small text-muted-foreground" style={{ width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {selected.ingredientes.map((ing, idx) => (
                    <tr key={idx} className="border-bottom border-border">
                      <td className="px-3 py-3 fw-semibold">
                        <select 
                          className="form-select bg-transparent border-0 fw-semibold" 
                          value={ing.item} 
                          onChange={(e) => updateIngredient(idx, "item", e.target.value)}
                        >
                          <option value="">Selecione um ingrediente...</option>
                          {inventoryItems.map(item => (
                            <option key={item.id} value={item.id}>{item.nome}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <div className="input-group">
                          <input type="number" step="0.1" className="form-control" value={ing.percentual} onChange={(e) => updateIngredient(idx, "percentual", Number(e.target.value || 0))} />
                          <span className="input-group-text">%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-end">
                        <button onClick={() => removeIngredient(idx)} className="btn btn-light p-2 text-danger hover-bg-danger hover-text-white transition-all"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                  {selected.ingredientes.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center py-4 text-muted-foreground small">
                        Nenhum ingrediente adicionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <button onClick={addIngredient} className="btn btn-light w-100 mt-3 fw-semibold"><Plus size={14} className="me-1" />Adicionar ingrediente</button>

            <div className={`mt-3 p-3 rounded-3 d-flex justify-content-between align-items-center ${totals.percentual === 100 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
              <span className="fw-bold">Total da fórmula</span>
              <div className="d-flex gap-4 fw-black fs-5">
                <span>{totals.percentual.toFixed(2).replace(".", ",")} %</span>
              </div>
            </div>
            {totals.percentual !== 100 && (
              <div className="small text-danger fw-semibold mt-2 text-end">
                A soma dos percentuais deve ser exatamente 100%. (Falta { (100 - totals.percentual).toFixed(2) }%)
              </div>
            )}
          </div>
          ) : (
            <div className="dashboard-card p-5 text-center text-muted-foreground d-flex align-items-center justify-content-center h-100">
              Selecione ou crie uma fórmula para gerenciar.
            </div>
          )}
        </div>

        <div className="col-12 col-xl-3">
          {selected && (
            <>
          <div className="dashboard-card p-4 mb-4">
            <h4 className="fw-bold mb-3" style={{ fontSize: "1rem" }}>Informações da fórmula</h4>
            <div className="small text-muted-foreground mb-1">Status</div>
            <div className="fw-semibold text-success mb-3">{selected.ativa ? "Ativa" : "Inativa"}</div>
            
            <div className="mt-4 p-3 rounded-3" style={{ background: "oklch(0.98 0.03 90)" }}>
              <div className="small fw-bold mb-1" style={{ color: "oklch(0.55 0.14 85)" }}>Dica</div>
              <div className="small text-muted-foreground">
                Somente as fórmulas ativas e com 100% dos ingredientes validados ficarão disponíveis na produção de ração.
              </div>
            </div>
          </div>

          <div className="dashboard-card p-4">
            <button onClick={handleDelete} disabled={saving} className="btn btn-light w-100 mb-2 text-danger fw-semibold">
              Excluir fórmula
            </button>
            <button 
              onClick={handleSave} 
              disabled={saving || totals.percentual !== 100} 
              className={`btn w-100 fw-semibold d-flex align-items-center justify-content-center gap-2 ${totals.percentual !== 100 ? 'opacity-50' : ''}`} 
              style={{ background: "var(--primary)", color: "white" }}
            >
              <Save size={16} />
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

