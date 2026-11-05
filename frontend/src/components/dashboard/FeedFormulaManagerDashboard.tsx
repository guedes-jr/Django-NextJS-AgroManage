"use client";
import { useCattleSegment } from "@/components/cattle/CattleSegmentContext";
import { cattleHome } from "@/services/cattleNavigation";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Search, Trash2, Save } from "lucide-react";
import { apiClient } from "@/services/api";
import { useOrganizationLocale } from "@/lib/locale";
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
  especie_animal?: string;
  item_final?: number | null;
  item_final_nome?: string | null;
  ativa: boolean;
  ingredientes: FormulaIngredient[];
};

type InventoryItem = {
  id: number;
  nome: string;
};

interface FeedFormulaManagerDashboardProps {
  species?: string;
}

export function FeedFormulaManagerDashboard({ species }: FeedFormulaManagerDashboardProps = {}) {
  const { language, t } = useOrganizationLocale();
  const segment = useCattleSegment();
  const speciesLabel: Record<string, string> = {
    suino: t("inventory.feed.swine"),
    ave: t("inventory.feed.birds"),
    bovino: t("inventory.feed.beef"),
  };
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
      const params = species ? `?especie=${species}` : "";
      const [resFormulas, resItems] = await Promise.all([
        apiClient.get(`/inventory/formulas/${params}`),
        apiClient.get("/inventory/items/all_items/")
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
      .filter(({ f }) => f.nome.toLocaleLowerCase(language).includes(search.toLocaleLowerCase(language)))
      .map(({ index }) => index);
  }, [formulas, search, language]);

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
      nome: t("inventory.formulas.newFormula"),
      descricao: "",
      especie_animal: species ?? "",
      ativa: true,
      ingredientes: []
    };
    setFormulas(prev => [nova, ...prev]);
    setSelectedIndex(0);
  };

  const handleSave = async () => {
    if (!selected) return;
    if (totals.percentual !== 100) {
      alert(t("inventory.formulas.percentValidation"));
      return;
    }
    
    try {
      setSaving(true);
      if (selected.id) {
        await apiClient.put(`inventory/formulas/${selected.id}/`, selected);
        alert(t("inventory.formulas.updated"));
      } else {
        const res = await apiClient.post("/inventory/formulas/", selected);
        setFormulas(prev => prev.map((f, i) => i === selectedIndex ? res.data : f));
        alert(t("inventory.formulas.created"));
      }
      fetchData();
    } catch (err) {
      alert(t("inventory.formulas.saveFailed"));
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
    
    if (confirm(t("inventory.formulas.deleteConfirm"))) {
      try {
        setSaving(true);
        await apiClient.delete(`inventory/formulas/${selected.id}/`);
        alert(t("inventory.formulas.deleted"));
        fetchData();
        setSelectedIndex(0);
      } catch (err) {
        alert(t("inventory.formulas.deleteFailed"));
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
    return <div className="p-5 text-center text-muted-foreground">{t("inventory.formulas.loading")}</div>;
  }

  return (
    <div className="inventory-container pb-5">
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small text-muted-foreground mb-3">
          <Link href="/home" className="text-decoration-none text-muted-foreground hover-text-primary">{t("inventory.formulas.breadcrumbHome")}</Link>
          {species && (
            <>
              <ChevronRight size={14} />
              <span>{speciesLabel[species] ?? species}</span>
              <ChevronRight size={14} />
              <Link
                href={species === "bovino" ? `${cattleHome(segment || "beef")}/racao` : `/home/seguimento/${species === "suino" ? "suinos" : "aves"}/racao`}
                className="text-decoration-none text-muted-foreground hover-text-primary"
              >{t("inventory.formulas.feed")}</Link>
            </>
          )}
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">{t("inventory.formulas.manage")}</span>
        </nav>
        <h1 className="fw-black mb-1" style={{ fontSize: "2.1rem", letterSpacing: "-0.03em" }}>
          {t("inventory.formulas.title")}{species ? ` — ${speciesLabel[species] ?? species}` : ""}
        </h1>
        <p className="text-muted-foreground mb-0">{t("inventory.formulas.description")}</p>
      </div>

      <div className="row g-4">
        <div className="col-12 col-xl-3">
          <div className="dashboard-card p-3">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <h4 className="fw-bold mb-0" style={{ fontSize: "0.95rem" }}>{t("inventory.formulas.registered")}</h4>
              <button onClick={handleCreateNew} className="btn btn-link text-success p-0 small fw-semibold"><Plus size={14} className="me-1" />{t("inventory.formulas.new")}</button>
            </div>
            <div className="position-relative mb-2">
              <Search size={14} className="position-absolute text-muted-foreground" style={{ left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input className="form-control ps-5" placeholder={t("inventory.formulas.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
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
                    <div className="small text-muted-foreground">{t("inventory.formulas.ingredients", { count: f.ingredientes.length.toLocaleString(language) })}</div>
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
                <label className="small fw-semibold mb-1 d-block">{t("inventory.formulas.name")}</label>
                <input className="form-control" value={selected.nome} onChange={(e) => setFormulas((prev) => prev.map((f, i) => i === selectedIndex ? { ...f, nome: e.target.value } : f))} />
              </div>
              <div className="col-12">
                <label className="small fw-semibold mb-1 d-block">{t("inventory.formulas.optionalDescription")}</label>
                <textarea className="form-control" rows={2} value={selected.descricao} onChange={(e) => setFormulas((prev) => prev.map((f, i) => i === selectedIndex ? { ...f, descricao: e.target.value } : f))} />
              </div>
              <div className="col-12">
                <label className="small fw-semibold mb-1 d-block">{t("inventory.formulas.generatedItem")}</label>
                <select 
                  className="form-select" 
                  value={selected.item_final || ""} 
                  onChange={(e) => setFormulas((prev) => prev.map((f, i) => i === selectedIndex ? { ...f, item_final: Number(e.target.value) || null } : f))}
                >
                  <option value="">{t("inventory.formulas.selectStockItem")}</option>
                  {inventoryItems.map(item => (
                    <option key={item.id} value={item.id}>{item.nome}</option>
                  ))}
                </select>
                <small className="text-muted-foreground mt-1 d-block">{t("inventory.formulas.stockEntryHelp")}</small>
              </div>
            </div>

            <h4 className="fw-bold mb-1" style={{ fontSize: "1rem" }}>{t("inventory.formulas.composition")}</h4>
            <p className="small text-muted-foreground mb-3">{t("inventory.formulas.compositionHelp")}</p>
            <div className="table-responsive">
              <table className="table mb-0">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-3 py-3 border-0 small text-muted-foreground">{t("inventory.formulas.ingredient")}</th>
                    <th className="px-3 py-3 border-0 small text-muted-foreground" style={{ width: 140 }}>{t("inventory.formulas.percent")}</th>
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
                          <option value="">{t("inventory.formulas.selectIngredient")}</option>
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
                        {t("inventory.formulas.noneAdded")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <button onClick={addIngredient} className="btn btn-light w-100 mt-3 fw-semibold"><Plus size={14} className="me-1" />{t("inventory.formulas.addIngredient")}</button>

            <div className={`mt-3 p-3 rounded-3 d-flex justify-content-between align-items-center ${totals.percentual === 100 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
              <span className="fw-bold">{t("inventory.formulas.total")}</span>
              <div className="d-flex gap-4 fw-black fs-5">
                <span>{totals.percentual.toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</span>
              </div>
            </div>
            {totals.percentual !== 100 && (
              <div className="small text-danger fw-semibold mt-2 text-end">
                {t("inventory.formulas.percentError")} ({t("inventory.formulas.missingPercent", { percent: (100 - totals.percentual).toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })})
              </div>
            )}
          </div>
          ) : (
            <div className="dashboard-card p-5 text-center text-muted-foreground d-flex align-items-center justify-content-center h-100">
              {t("inventory.formulas.emptySelection")}
            </div>
          )}
        </div>

        <div className="col-12 col-xl-3">
          {selected && (
            <>
          <div className="dashboard-card p-4 mb-4">
            <h4 className="fw-bold mb-3" style={{ fontSize: "1rem" }}>{t("inventory.formulas.information")}</h4>
            <div className="small text-muted-foreground mb-1">{t("inventory.formulas.status")}</div>
            <div className="fw-semibold text-success mb-3">{selected.ativa ? t("inventory.formulas.active") : t("inventory.formulas.inactive")}</div>
            
            <div className="mt-4 p-3 rounded-3" style={{ background: "oklch(0.98 0.03 90)" }}>
              <div className="small fw-bold mb-1" style={{ color: "oklch(0.55 0.14 85)" }}>{t("inventory.formulas.tip")}</div>
              <div className="small text-muted-foreground">
                {t("inventory.formulas.activeOnly")}
              </div>
            </div>
          </div>

          <div className="dashboard-card p-4">
            <button onClick={handleDelete} disabled={saving} className="btn btn-light w-100 mb-2 text-danger fw-semibold">
              {t("inventory.formulas.delete")}
            </button>
            <button 
              onClick={handleSave} 
              disabled={saving || totals.percentual !== 100} 
              className={`btn w-100 fw-semibold d-flex align-items-center justify-content-center gap-2 ${totals.percentual !== 100 ? 'opacity-50' : ''}`} 
              style={{ background: "var(--primary)", color: "white" }}
            >
              <Save size={16} />
              {saving ? t("inventory.formulas.saving") : t("inventory.formulas.save")}
            </button>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
