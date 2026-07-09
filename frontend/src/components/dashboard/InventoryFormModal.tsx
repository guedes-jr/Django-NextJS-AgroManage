"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Package, Tag, Calendar, Banknote, Warehouse, Thermometer, Leaf, FileText, CheckCircle2, ChevronRight, Hash, AlertTriangle, RefreshCw, ArrowUp, ArrowDown, Clock, Activity } from "lucide-react";
import { apiClient } from "@/services/api";

export type InventoryCategory =
  | "racao"
  | "nucleo"
  | "suplemento"
  | "semente"
  | "fertilizante"
  | "foliar"
  | "fertirrigacao"
  | "defensivo"
  | "corretivo"
  | "medicamento"
  | "vacina"
  | "medicamento_vacina"
  | "material"
  | "semen"
  | "outro";

type CustomCategory = {
  id: string;
  label: string;
  unidade: string;
};

interface InventoryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: InventoryCategory;
  onSave: (items: any[]) => Promise<void>;
  initialData?: any;
}

const STEPS = [
  { id: "basic", label: "Identificação", icon: Package },
  { id: "stock", label: "Estoque & Lote", icon: Warehouse },
];

const CATEGORY_CONFIG: Record<InventoryCategory, { label: string; unidade: string; color: string }> = {
  racao:       { label: "Ração / Grão",    unidade: "kg",      color: "#f97316" },
  nucleo:      { label: "Suplementos",     unidade: "kg",      color: "#8b5cf6" },
  suplemento:  { label: "Suplemento Animal", unidade: "kg",    color: "#6366f1" },
  semente:     { label: "Sementes/mudas",  unidade: "saco",    color: "#22c55e" },
  fertilizante:{ label: "Adubos",          unidade: "kg",      color: "#84cc16" },
  foliar:      { label: "Foliares / Defensivos", unidade: "l", color: "#0ea5e9" },
  fertirrigacao:{ label: "Fertirrigação",   unidade: "l",       color: "#06b6d4" },
  defensivo:   { label: "Foliares / Defensivos", unidade: "l", color: "#0ea5e9" },
  corretivo:   { label: "Corretivo de Solo", unidade: "kg",    color: "#a16207" },
  medicamento: { label: "Medicamento",     unidade: "unidade", color: "#ef4444" },
  vacina:      { label: "Vacina",          unidade: "dose",    color: "#3b82f6" },
  medicamento_vacina: { label: "Medicamentos e Vacinas", unidade: "unidade", color: "#ef4444" },
  material:    { label: "Material",        unidade: "unidade", color: "#6b7280" },
  semen:       { label: "Sêmen / Doses",   unidade: "dose",    color: "#ec4899" },
  outro:       { label: "Outro",           unidade: "unidade", color: "#14b8a6" },
};

const UNIDADES = ["kg", "g", "l", "ml", "unidade", "dose", "saco", "caixa", "m", "m2"];
const ESPECIES = ["bovino", "suino", "ave", "ovino", "caprino", "equino", "multiplo", "outro"];
const ESPECIES_LABELS: Record<string, string> = {
  bovino: "Bovino", suino: "Suíno", ave: "Ave", ovino: "Ovino",
  caprino: "Caprino", equino: "Equino", multiplo: "Múltiplas espécies", outro: "Outro",
};
const LOCAIS = [
  { value: "deposito", label: "Depósito Geral" },
  { value: "camara_fria", label: "Câmara Fria" },
  { value: "silo", label: "Silo" },
  { value: "armario", label: "Armário / Farmácia" },
  { value: "tanque", label: "Tanque" },
  { value: "outro", label: "Outro" },
];

function emptyRow(category?: InventoryCategory) {
  const cfg = category ? CATEGORY_CONFIG[category] : CATEGORY_CONFIG.outro;
  return {
    id: Date.now() + Math.random(),
    nome: "", categoria: category || "outro",
    categorias: (category ? [category] : ["outro"]) as InventoryCategory[],
    categoria_personalizada: "",
    categoria_personalizada_id: "",
    unidade_medida: cfg?.unidade || "unidade",
    descricao: "", fabricante: "", especie_animal: "",
    tipo_semen: "convencional",
    estoque_minimo: "",
    custo_unitario: "", ultimo_custo: 0,
    local_armazenamento: "", fornecedor: "", nota_fiscal: "",
    observacao_lote: "",
    // Medicamento / Vacina
    principio_ativo: "", concentracao: "", via_aplicacao: "",
    carencia_dias: "", registro_mapa: "",
    exige_receituario: false, medicamento_controlado: false,
    temperatura_minima: "", temperatura_maxima: "",
    doses_por_embalagem: "", volume_por_dose: "",
    // Ração / Núcleo
    composicao: "", indicacao_uso: "", modo_uso: "", peso_embalagem: "",
  };
}

type InventoryRow = ReturnType<typeof emptyRow>;

function InputField({ label, required, icon: Icon, children }: any) {
  return (
    <div className="login-input-group mb-0">
      <label className="login-label fw-semibold">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      <div className="login-input-wrapper">
        {children}
        {Icon && <Icon className="login-input-icon text-muted-foreground" size={15} />}
      </div>
    </div>
  );
}

export function InventoryFormModal({ isOpen, onClose, category, onSave, initialData }: InventoryFormModalProps) {
  const [rows, setRows] = useState([emptyRow(category)]);
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [categoryDialogRowId, setCategoryDialogRowId] = useState<number | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryUnit, setNewCategoryUnit] = useState("unidade");
  const isEditing = Boolean(initialData?.item_id);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setRows([{ 
          ...emptyRow(category || initialData.categoria), 
          ...initialData,
          id: Date.now() // Unique ID for the row
        }]);
      } else {
        setRows([emptyRow(category)]);
      }
      setCurrentStep(0);
      fetchSuppliers();
    }
  }, [isOpen, category, initialData]);

  const addRow = () => setRows(r => [...r, emptyRow(category)]);
  const removeRow = (id: number) => rows.length > 1 && setRows(r => r.filter(x => x.id !== id));
  const update = (id: number, field: string, value: any) =>
    setRows(r => r.map(x => x.id === id ? { ...x, [field]: value } : x));
  const updateCategory = (id: number, nextCategory: InventoryCategory) => {
    const nextConfig = CATEGORY_CONFIG[nextCategory];
    setRows(r => r.map(x => x.id === id ? {
      ...x,
      categoria: nextCategory,
      categorias: [nextCategory],
      categoria_personalizada: "",
      categoria_personalizada_id: "",
      unidade_medida: nextConfig.unidade,
    } : x));
  };

  const updateCustomCategory = (id: number, customCategory: CustomCategory) => {
    setRows(r => r.map(x => x.id === id ? {
      ...x,
      categoria: "outro",
      categorias: x.categorias.includes("outro") ? x.categorias : [...x.categorias, "outro" as InventoryCategory],
      categoria_personalizada: customCategory.label,
      categoria_personalizada_id: customCategory.id,
      unidade_medida: customCategory.unidade,
    } : x));
  };

  const updateCategories = (id: number, selectedCategories: InventoryCategory[]) => {
    const categories: InventoryCategory[] = selectedCategories.length > 0 ? selectedCategories : ["outro"];
    const primaryCategory = categories[0];
    const nextConfig = CATEGORY_CONFIG[primaryCategory];
    setRows(r => r.map(x => x.id === id ? {
      ...x,
      categoria: primaryCategory,
      categorias: categories,
      categoria_personalizada: categories.includes("outro") ? x.categoria_personalizada : "",
      categoria_personalizada_id: categories.includes("outro") ? x.categoria_personalizada_id : "",
      unidade_medida: x.unidade_medida || nextConfig.unidade,
    } : x));
  };

  const categorySelectValue = (row: InventoryRow) => row.categorias || [row.categoria || "outro"];

  const openCategoryDialog = (rowId: number) => {
    setCategoryDialogRowId(rowId);
    setNewCategoryName("");
    setNewCategoryUnit("unidade");
  };

  const closeCategoryDialog = () => {
    setCategoryDialogRowId(null);
    setNewCategoryName("");
    setNewCategoryUnit("unidade");
  };

  const handleCreateCategory = () => {
    const label = newCategoryName.trim();
    if (!label || categoryDialogRowId === null) return;

    const customCategory: CustomCategory = {
      id: `${Date.now()}-${label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
      label,
      unidade: newCategoryUnit,
    };

    setCustomCategories((current) => [...current, customCategory]);
    updateCustomCategory(categoryDialogRowId, customCategory);
    closeCategoryDialog();
  };

  const fetchSuppliers = async () => {
    try {
      const { data } = await apiClient.get("/inventory/fornecedores/");
      setSuppliers(Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []));
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("Erro ao buscar fornecedores para o modal:", err);
      }
    }
  };

  const nextStep = () => setCurrentStep(s => Math.min(s + 1, STEPS.length - 1));
  const prevStep = () => setCurrentStep(s => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const payload = rows.map(row => {
        const categoriaPersonalizada = row.categoria_personalizada;
        return {
          ...row,
          categoria_personalizada: undefined,
          categoria_personalizada_id: undefined,
          descricao: row.descricao || (categoriaPersonalizada ? `Categoria personalizada: ${categoriaPersonalizada}` : row.descricao),
          fornecedor: row.fornecedor || null
        };
      });
      await onSave(payload);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const cfg = category ? CATEGORY_CONFIG[category] : null;
  const categoryEntries = Object.entries(CATEGORY_CONFIG).filter(([value]) => {
    if (value === "foliar") return rows.some((row) => row.categoria === value || row.categorias.includes(value as InventoryCategory));
    if (!["medicamento", "vacina"].includes(value)) return true;
    return rows.some((row) => row.categoria === value || row.categorias.includes(value as InventoryCategory));
  });
  const isLastStep = currentStep === STEPS.length - 1;

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Editar produto" : cfg ? `Cadastrar — ${cfg.label}` : "Cadastrar Item de Estoque"}
      description={isEditing ? "Atualize os dados do produto cadastrado." : "Preencha os dados seguindo as etapas de cadastro."}
      maxWidth="max-w-6xl"
      footer={
        <div className="d-flex align-items-center justify-content-between w-100 p-3 bg-muted/5">
          <div className="d-flex align-items-center gap-2 text-muted-foreground fw-semibold small">
            <span className="badge bg-primary/10 text-primary px-3 py-1 rounded-pill">{rows.length}</span>
            <span>{rows.length === 1 ? "item" : "itens"} sendo configurados</span>
          </div>
          <div className="d-flex gap-2">
            <Button variant="outline-secondary" onClick={onClose} disabled={loading} className="rounded-xl">Cancelar</Button>
            
            {currentStep > 0 && (
              <Button variant="outline-primary" onClick={prevStep} disabled={loading} className="rounded-xl">Voltar</Button>
            )}

            {!isLastStep ? (
              <Button onClick={nextStep} style={{ background: "var(--primary)", color: "white" }} className="rounded-xl">
                Próximo
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading} style={{ background: "var(--primary)", color: "white" }} className="rounded-xl shadow-lg">
                {loading ? "Salvando..." : isEditing ? "Salvar alterações" : "Finalizar Cadastro"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="p-0" style={{ background: "var(--background)", minHeight: "50vh" }}>
        {/* Visual Stepper */}
        <div className="px-5 pt-4 pb-0 bg-muted/5 border-bottom">
          <div className="d-flex justify-content-between mb-4">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isActive = idx === currentStep;
              const isPast = idx < currentStep;
              return (
                <div key={step.id} className="d-flex flex-column align-items-center gap-2" style={{ flex: 1, position: 'relative' }}>
                  <div 
                    className={`rounded-circle d-flex align-items-center justify-content-center shadow-sm transition-all`}
                    style={{ 
                      width: 42, 
                      height: 42, 
                      background: isActive || isPast ? 'var(--primary)' : 'white',
                      color: isActive || isPast ? 'white' : 'var(--muted-foreground)',
                      border: isActive ? '4px solid color-mix(in srgb, var(--primary), white 80%)' : '1px solid var(--border)',
                      zIndex: 2
                    }}
                  >
                    {isPast ? <CheckCircle2 size={20} /> : <Icon size={20} />}
                  </div>
                  <span className={`small text-uppercase fw-black ${isActive ? 'text-primary' : 'text-muted-foreground'}`} style={{ letterSpacing: '0.05em', fontSize: '0.6rem' }}>
                    {step.label}
                  </span>
                  
                  {idx < STEPS.length - 1 && (
                    <div 
                      className="position-absolute" 
                      style={{ 
                        height: 2, 
                        width: 'calc(100% - 42px)', 
                        background: isPast ? 'var(--primary)' : 'var(--border)', 
                        top: 21, 
                        left: 'calc(50% + 21px)',
                        zIndex: 1
                      }} 
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-3 p-md-5">
          <div className="d-flex flex-column gap-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${currentStep}-${rows.length}`}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                {rows.map((row, index) => (
                  <div
                    key={row.id}
                    className="dashboard-card p-3 p-md-4 mb-4"
                    style={{ border: "1px solid var(--border)", borderRadius: "0.75rem" }}
                  >
                    {/* Header item */}
                    <div className="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom border-border">
                      <div className="d-flex align-items-center gap-2">
                        <span className="badge bg-primary text-white rounded-circle p-0 d-flex align-items-center justify-content-center" style={{ width: 22, height: 22, fontSize: '0.7rem' }}>
                          {index + 1}
                        </span>
                        <h5 className="fw-black mb-0 text-uppercase small" style={{ letterSpacing: '0.05em' }}>
                          {cfg ? cfg.label : "Item de Estoque"}
                        </h5>
                      </div>
                      <button
                        className={`btn btn-sm border-0 rounded-circle p-2 transition-colors ${rows.length === 1 ? "text-muted opacity-20" : "text-danger bg-danger/5 hover-bg-danger/10"}`}
                        onClick={() => removeRow(row.id as any)}
                        disabled={rows.length === 1}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Step Content Rendering */}
                    {currentStep === 0 && (
                      <div className="animate-in fade-in slide-in-from-right-2">
                        <p className="small fw-black text-muted-foreground text-uppercase mb-4" style={{ letterSpacing: "0.1em", fontSize: "0.6rem" }}>
                          <Package size={14} className="me-1" /> Informações Básicas de Identidade
                        </p>
                        <div className="row g-4">
                          <div className="col-12 col-md-6">
                            <InputField label="Nome do item" required icon={Tag}>
                              <input type="text" className="login-input login-input-icon-left bg-transparent text-foreground"
                                placeholder="Ex: Milho Grão, Vacina Aftosa..." value={row.nome}
                                onChange={e => update(row.id as any, "nome", e.target.value)} />
                            </InputField>
                          </div>

                          {!category && (
                            <div className="col-12 col-md-3">
                              <div className="login-input-group mb-0">
                                <label className="login-label fw-semibold text-xs">Categoria <span className="text-danger">*</span></label>
                                <div className="d-flex gap-2">
                                  <select
                                    multiple
                                    className="login-input bg-transparent text-foreground rounded-xl"
                                    style={{ paddingLeft: "1rem", minHeight: 92 }}
                                    value={categorySelectValue(row)}
                                    onChange={e => {
                                      const selectedCategories = Array.from(e.target.selectedOptions)
                                        .map((option) => option.value)
                                        .filter((value) => !value.startsWith("custom:")) as InventoryCategory[];
                                      const selectedCustom = Array.from(e.target.selectedOptions)
                                        .map((option) => option.value)
                                        .find((value) => value.startsWith("custom:"));
                                      updateCategories(row.id, selectedCategories);
                                      if (selectedCustom) {
                                        const customCategory = customCategories.find((item) => item.id === selectedCustom.replace("custom:", ""));
                                        if (customCategory) updateCustomCategory(row.id, customCategory);
                                      }
                                    }}
                                  >
                                    {categoryEntries.map(([v, c]) => (
                                      <option key={v} value={v}>{c.label}</option>
                                    ))}
                                    {customCategories.length > 0 && (
                                      <optgroup label="Categorias cadastradas">
                                        {customCategories.map((item) => (
                                          <option key={item.id} value={`custom:${item.id}`}>{item.label}</option>
                                        ))}
                                      </optgroup>
                                    )}
                                  </select>
                                  <button
                                    type="button"
                                    className="btn btn-outline-primary d-flex align-items-center justify-content-center"
                                    title="Cadastrar nova categoria"
                                    aria-label="Cadastrar nova categoria"
                                    onClick={() => openCategoryDialog(row.id)}
                                    style={{ width: 46, height: 46, borderRadius: 12, flex: "0 0 46px" }}
                                  >
                                    <Plus size={18} />
                                  </button>
                                </div>
                                <div className="d-flex flex-wrap gap-1 mt-2">
                                  {categorySelectValue(row).map((value) => (
                                    <span key={value} className="badge bg-primary/10 text-primary border border-primary/10">
                                      {CATEGORY_CONFIG[value as InventoryCategory]?.label || value}
                                    </span>
                                  ))}
                                  {row.categoria_personalizada && (
                                    <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle">
                                      {row.categoria_personalizada}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="col-12 col-md-3">
                            <div className="login-input-group mb-0">
                              <label className="login-label fw-semibold text-xs">Unidade <span className="text-danger">*</span></label>
                              <select className="login-input bg-transparent text-foreground rounded-xl" style={{ paddingLeft: "1rem" }}
                                value={row.unidade_medida} onChange={e => update(row.id as any, "unidade_medida", e.target.value)}>
                                {UNIDADES.map(u => <option key={u} value={u}>{u.toUpperCase()}</option>)}
                              </select>
                            </div>
                          </div>
                          <div className="col-12 col-md-4">
                            <InputField label="Fabricante">
                              <input type="text" className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }}
                                placeholder="Fabricante..." value={row.fabricante}
                                onChange={e => update(row.id as any, "fabricante", e.target.value)} />
                            </InputField>
                          </div>
                          <div className="col-12 col-md-4">
                            <div className="login-input-group mb-0">
                              <label className="login-label fw-semibold text-xs">Espécie Animal</label>
                              <select className="login-input bg-transparent text-foreground rounded-xl" style={{ paddingLeft: "1rem" }}
                                value={row.especie_animal} onChange={e => update(row.id as any, "especie_animal", e.target.value)}>
                                <option value="">Todas / N/A</option>
                                {ESPECIES.map(e => <option key={e} value={e}>{ESPECIES_LABELS[e]}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {currentStep === 1 && (
                      <div className="animate-in fade-in slide-in-from-right-2">
                        <p className="small fw-black text-muted-foreground text-uppercase mb-4" style={{ letterSpacing: "0.1em", fontSize: "0.6rem" }}>
                          <Warehouse size={14} className="me-1" /> Entrada Inicial de Estoque
                        </p>
                        <div className="row g-4">
                          <div className="col-12 col-md-3">
                            <InputField label="Custo Unitário (R$)" icon={Banknote}>
                              <div className="position-relative">
                                <input type="number" step="0.01" className="login-input login-input-icon-left bg-transparent text-foreground"
                                  placeholder="0,00" value={row.custo_unitario}
                                  onChange={e => update(row.id as any, "custo_unitario", e.target.value)} />
                                
                                {(row.ultimo_custo ?? 0) > 0 && row.custo_unitario && (
                                  <div className="position-absolute top-50 translate-middle-y" style={{ right: '10px' }}>
                                    {parseFloat(row.custo_unitario) > (row.ultimo_custo ?? 0) ? (
                                      <span className="badge bg-danger/10 text-danger border border-danger/20 d-flex align-items-center gap-1" style={{ fontSize: '0.65rem' }}>
                                        <ArrowUp size={10} /> {(((parseFloat(row.custo_unitario) / (row.ultimo_custo ?? 1)) - 1) * 100).toFixed(1)}%
                                      </span>
                                    ) : (
                                      <span className="badge bg-success/10 text-success border border-success/20 d-flex align-items-center gap-1" style={{ fontSize: '0.65rem' }}>
                                        <ArrowDown size={10} /> {((1 - (parseFloat(row.custo_unitario) / (row.ultimo_custo ?? 1))) * 100).toFixed(1)}%
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </InputField>
                            {(row.ultimo_custo ?? 0) > 0 && (
                              <div className="text-xs text-muted-foreground mt-1 px-1">
                                Última compra: <strong>R$ {(row.ultimo_custo ?? 0).toFixed(2)}</strong>
                              </div>
                            )}
                          </div>
                          <div className="col-12 col-md-3">
                            <InputField label="Estoque Mínimo" icon={AlertTriangle}>
                              <input type="number" step="0.01" className="login-input login-input-icon-left bg-transparent text-foreground"
                                placeholder="Alerta em..." value={row.estoque_minimo}
                                onChange={e => update(row.id as any, "estoque_minimo", e.target.value)} />
                            </InputField>
                          </div>
                          <div className="col-12 col-md-4">
                            <div className="login-input-group mb-0">
                              <label className="login-label fw-semibold text-xs">Fornecedor</label>
                              <select 
                                className="login-input bg-transparent text-foreground rounded-xl" 
                                style={{ paddingLeft: "1rem" }}
                                value={row.fornecedor} 
                                onChange={e => update(row.id as any, "fornecedor", e.target.value)}
                              >
                                <option value="">Selecione um fornecedor...</option>
                                {suppliers.map(s => (
                                  <option key={s.id} value={s.id}>{s.nome}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="col-12 col-md-4">
                            <div className="login-input-group mb-0">
                              <label className="login-label fw-semibold text-xs">Local de Armazenamento</label>
                              <select className="login-input bg-transparent text-foreground rounded-xl" style={{ paddingLeft: "1rem" }}
                                value={row.local_armazenamento} onChange={e => update(row.id as any, "local_armazenamento", e.target.value)}>
                                <option value="">Selecione...</option>
                                {LOCAIS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>

          {currentStep === 0 && !isEditing && (
            <button
              className="w-100 py-4 mt-2 rounded-2xl dashboard-card border-border d-flex align-items-center justify-content-center gap-2 hover-bg-muted transition-all text-primary fw-black shadow-sm"
              onClick={addRow}
              style={{ borderStyle: "dashed", backgroundColor: 'var(--muted-foreground-5)' }}
            >
              <Plus size={20} /> ADICIONAR OUTRO ITEM AO LOTE
            </button>
          )}
        </div>
      </div>
    </Modal>

    <Modal
      isOpen={categoryDialogRowId !== null}
      onClose={closeCategoryDialog}
      title="Cadastrar nova categoria"
      description="Crie uma opção personalizada para usar no cadastro deste item."
      maxWidth="max-w-md"
      footer={
        <div className="d-flex justify-content-end gap-2 w-100">
          <Button variant="outline-secondary" onClick={closeCategoryDialog}>Cancelar</Button>
          <Button onClick={handleCreateCategory} disabled={!newCategoryName.trim()}>
            <Plus size={16} />
            Cadastrar
          </Button>
        </div>
      }
    >
      <div className="p-4">
        <div className="login-input-group mb-3">
          <label className="login-label fw-semibold">Nome da categoria <span className="text-danger">*</span></label>
          <input
            className="login-input bg-transparent text-foreground"
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.target.value)}
            placeholder="Ex: Inoculantes, Peças, Combustíveis..."
            style={{ paddingLeft: "1rem" }}
          />
        </div>
        <div className="login-input-group mb-0">
          <label className="login-label fw-semibold">Unidade padrão</label>
          <select
            className="login-input bg-transparent text-foreground rounded-xl"
            value={newCategoryUnit}
            onChange={(event) => setNewCategoryUnit(event.target.value)}
            style={{ paddingLeft: "1rem" }}
          >
            {UNIDADES.map(u => <option key={u} value={u}>{u.toUpperCase()}</option>)}
          </select>
        </div>
        <p className="text-muted-foreground small mb-0 mt-3">
          A categoria personalizada será usada nesta tela e salva tecnicamente como Outro.
        </p>
      </div>
    </Modal>
    </>
  );
}
