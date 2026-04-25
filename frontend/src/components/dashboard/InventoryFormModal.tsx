"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Package, Tag, Calendar, Banknote, Warehouse, FlaskConical, Thermometer, Leaf, FileText } from "lucide-react";
import { apiClient } from "@/services/api";

export type InventoryCategory = "racao" | "nucleo" | "medicamento" | "vacina" | "material" | "suplemento" | "outro";

interface InventoryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: InventoryCategory;
  onSave: (items: any[]) => Promise<void>;
}

const CATEGORY_CONFIG: Record<string, { label: string; unidade: string; color: string }> = {
  racao:       { label: "Ração / Grão",    unidade: "kg",      color: "#f97316" },
  nucleo:      { label: "Núcleo / Premix", unidade: "kg",      color: "#8b5cf6" },
  suplemento:  { label: "Suplemento",      unidade: "kg",      color: "#6366f1" },
  medicamento: { label: "Medicamento",     unidade: "unidade", color: "#ef4444" },
  vacina:      { label: "Vacina",          unidade: "dose",    color: "#3b82f6" },
  material:    { label: "Material",        unidade: "unidade", color: "#6b7280" },
  outro:       { label: "Outro",           unidade: "unidade", color: "#14b8a6" },
};

const UNIDADES = ["kg", "g", "l", "ml", "unidade", "dose", "saco", "caixa", "m", "m2"];
const ESPECIES = ["bovino", "suino", "ave", "ovino", "caprino", "equino", "multiplo", "outro"];
const ESPECIES_LABELS: Record<string, string> = {
  bovino: "Bovino", suino: "Suíno", ave: "Ave", ovino: "Ovino",
  caprino: "Caprino", equino: "Equino", multiplo: "Múltiplas espécies", outro: "Outro",
};
const VIAS = ["oral", "injetavel", "topica", "subcutanea", "intramuscular", "intravenosa", "outra"];
const VIAS_LABELS: Record<string, string> = {
  oral: "Oral", injetavel: "Injetável", topica: "Tópica",
  subcutanea: "Subcutânea", intramuscular: "Intramuscular", intravenosa: "Intravenosa", outra: "Outra",
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
    nome: "", codigo: "",
    categoria: category || "outro",
    unidade_medida: cfg?.unidade || "unidade",
    descricao: "", marca: "", fabricante: "", especie_animal: "",
    estoque_minimo: "",
    // Lote
    numero_lote: "", data_fabricacao: "", data_validade: "",
    quantidade_inicial: "", custo_unitario: "",
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

export function InventoryFormModal({ isOpen, onClose, category, onSave }: InventoryFormModalProps) {
  const [rows, setRows] = useState([emptyRow(category)]);
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      setRows([emptyRow(category)]);
      fetchSuppliers();
    }
  }, [isOpen, category]);

  const fetchSuppliers = async () => {
    try {
      const { data } = await apiClient.get("/inventory/fornecedores/");
      setSuppliers(Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []));
    } catch (err) {
      console.error("Erro ao buscar fornecedores para o modal:", err);
    }
  };

  const addRow = () => setRows(r => [...r, emptyRow(category)]);
  const removeRow = (id: number) => rows.length > 1 && setRows(r => r.filter(x => x.id !== id));
  const update = (id: number, field: string, value: any) =>
    setRows(r => r.map(x => x.id === id ? { ...x, [field]: value } : x));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const payload = rows.map(row => ({
        ...row,
        fornecedor: row.fornecedor || null
      }));
      await onSave(payload);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const cfg = category ? CATEGORY_CONFIG[category] : null;
  const isMed = (cat: string) => cat === "medicamento";
  const isVac = (cat: string) => cat === "vacina";
  const isMedOrVac = (cat: string) => cat === "medicamento" || cat === "vacina";
  const isFeed = (cat: string) => ["racao", "nucleo", "suplemento"].includes(cat);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={cfg ? `Cadastrar — ${cfg.label}` : "Cadastrar Item de Estoque"}
      description="Preencha os dados do item e do lote inicial."
      maxWidth="max-w-6xl"
      footer={
        <>
          <div className="d-flex align-items-center gap-2 text-muted-foreground fw-semibold small">
            <span className="badge bg-primary/10 text-primary px-3 py-1 rounded-pill">{rows.length}</span>
            <span>{rows.length === 1 ? "item" : "itens"}</span>
          </div>
          <div className="d-flex gap-2">
            <Button variant="outline-secondary" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={loading} style={{ background: "var(--primary)", color: "white" }}>
              {loading ? "Salvando..." : "Salvar Itens"}
            </Button>
          </div>
        </>
      }
    >
      <div className="p-3 p-md-5" style={{ background: "var(--background)", minHeight: "50vh" }}>
        <div className="d-flex flex-column gap-5 mb-4">
          <AnimatePresence initial={false}>
            {rows.map((row, index) => (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.97 }}
                transition={{ duration: 0.2 }}
                className="dashboard-card p-3 p-md-4"
                style={{ border: "1px solid var(--border)", borderRadius: "1rem" }}
              >
                {/* Header row */}
                <div className="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom border-border">
                  <h5 className="fw-bold mb-0" style={{ fontSize: "1rem" }}>
                    <span className="text-primary me-2">#{index + 1}</span>
                    {cfg ? cfg.label : "Item"}
                  </h5>
                  <button
                    className={`btn btn-sm border-0 rounded p-2 ${rows.length === 1 ? "text-muted-foreground bg-muted" : "text-danger bg-danger/10"}`}
                    onClick={() => removeRow(row.id as any)}
                    disabled={rows.length === 1}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {/* ── SEÇÃO 1: Dados básicos ── */}
                <p className="small fw-bold text-muted-foreground text-uppercase mb-3" style={{ letterSpacing: "0.08em", fontSize: "0.65rem" }}>
                  <Package size={12} className="me-1" /> Dados Básicos
                </p>
                <div className="row g-3 mb-4">
                  <div className="col-12 col-md-4">
                    <InputField label="Nome do item" required icon={Tag}>
                      <input type="text" className="login-input login-input-icon-left bg-transparent text-foreground"
                        placeholder="Ex: Milho Grão, Vacina Aftosa..." value={row.nome}
                        onChange={e => update(row.id as any, "nome", e.target.value)} />
                    </InputField>
                  </div>
                  <div className="col-12 col-md-2">
                    <InputField label="Código / SKU" icon={FileText}>
                      <input type="text" className="login-input login-input-icon-left bg-transparent text-foreground"
                        placeholder="Ex: MIL-001" value={row.codigo}
                        onChange={e => update(row.id as any, "codigo", e.target.value)} />
                    </InputField>
                  </div>

                  {!category && (
                    <div className="col-12 col-md-2">
                      <div className="login-input-group mb-0">
                        <label className="login-label fw-semibold">Categoria <span className="text-danger">*</span></label>
                        <select className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }}
                          value={row.categoria} onChange={e => update(row.id as any, "categoria", e.target.value)}>
                          {Object.entries(CATEGORY_CONFIG).map(([v, c]) => (
                            <option key={v} value={v}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="col-6 col-md-2">
                    <div className="login-input-group mb-0">
                      <label className="login-label fw-semibold">Unidade <span className="text-danger">*</span></label>
                      <select className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }}
                        value={row.unidade_medida} onChange={e => update(row.id as any, "unidade_medida", e.target.value)}>
                        {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="col-6 col-md-2">
                    <InputField label="Estoque mínimo">
                      <input type="number" step="0.01" className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }}
                        placeholder="0" value={row.estoque_minimo}
                        onChange={e => update(row.id as any, "estoque_minimo", e.target.value)} />
                    </InputField>
                  </div>

                  <div className="col-12 col-md-3">
                    <InputField label="Marca">
                      <input type="text" className="login-input login-input-icon-left bg-transparent text-foreground"
                        placeholder="Marca..." value={row.marca}
                        onChange={e => update(row.id as any, "marca", e.target.value)} />
                    </InputField>
                  </div>
                  <div className="col-12 col-md-3">
                    <InputField label="Fabricante">
                      <input type="text" className="login-input login-input-icon-left bg-transparent text-foreground"
                        placeholder="Fabricante..." value={row.fabricante}
                        onChange={e => update(row.id as any, "fabricante", e.target.value)} />
                    </InputField>
                  </div>
                  <div className="col-12 col-md-3">
                    <div className="login-input-group mb-0">
                      <label className="login-label fw-semibold">Espécie animal</label>
                      <select className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }}
                        value={row.especie_animal} onChange={e => update(row.id as any, "especie_animal", e.target.value)}>
                        <option value="">Todas / N/A</option>
                        {ESPECIES.map(e => <option key={e} value={e}>{ESPECIES_LABELS[e]}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="col-12 col-md-3">
                    <div className="login-input-group mb-0">
                      <label className="login-label fw-semibold">Descrição</label>
                      <input type="text" className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }}
                        placeholder="Descrição opcional..." value={row.descricao}
                        onChange={e => update(row.id as any, "descricao", e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* ── SEÇÃO 2: Campos técnicos por categoria ── */}
                <AnimatePresence>
                  {isMedOrVac(row.categoria) && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                      <p className="small fw-bold text-muted-foreground text-uppercase mb-3" style={{ letterSpacing: "0.08em", fontSize: "0.65rem" }}>
                        <FlaskConical size={12} className="me-1" /> Informações Técnicas
                      </p>
                      <div className="row g-3 mb-4">
                        <div className="col-12 col-md-4">
                          <InputField label="Princípio ativo">
                            <input type="text" className="login-input login-input-icon-left bg-transparent text-foreground"
                              placeholder="Ex: Oxitetraciclina..." value={row.principio_ativo}
                              onChange={e => update(row.id as any, "principio_ativo", e.target.value)} />
                          </InputField>
                        </div>
                        <div className="col-12 col-md-3">
                          <InputField label="Concentração">
                            <input type="text" className="login-input login-input-icon-left bg-transparent text-foreground"
                              placeholder="Ex: 200mg/mL" value={row.concentracao}
                              onChange={e => update(row.id as any, "concentracao", e.target.value)} />
                          </InputField>
                        </div>
                        <div className="col-12 col-md-3">
                          <div className="login-input-group mb-0">
                            <label className="login-label fw-semibold">Via de aplicação</label>
                            <select className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }}
                              value={row.via_aplicacao} onChange={e => update(row.id as any, "via_aplicacao", e.target.value)}>
                              <option value="">Selecione...</option>
                              {VIAS.map(v => <option key={v} value={v}>{VIAS_LABELS[v]}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="col-6 col-md-2">
                          <InputField label="Reg. MAPA">
                            <input type="text" className="login-input login-input-icon-left bg-transparent text-foreground"
                              placeholder="Nº registro" value={row.registro_mapa}
                              onChange={e => update(row.id as any, "registro_mapa", e.target.value)} />
                          </InputField>
                        </div>

                        {isMed(row.categoria) && (
                          <>
                            <div className="col-6 col-md-2">
                              <InputField label="Carência (dias)">
                                <input type="number" className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }}
                                  placeholder="0" value={row.carencia_dias}
                                  onChange={e => update(row.id as any, "carencia_dias", e.target.value)} />
                              </InputField>
                            </div>
                            <div className="col-6 col-md-2 d-flex align-items-end pb-1">
                              <label className="d-flex align-items-center gap-2 cursor-pointer">
                                <input type="checkbox" className="form-check-input mt-0" checked={row.exige_receituario}
                                  onChange={e => update(row.id as any, "exige_receituario", e.target.checked)} />
                                <span className="small fw-semibold">Exige receituário</span>
                              </label>
                            </div>
                            <div className="col-6 col-md-2 d-flex align-items-end pb-1">
                              <label className="d-flex align-items-center gap-2 cursor-pointer">
                                <input type="checkbox" className="form-check-input mt-0" checked={row.medicamento_controlado}
                                  onChange={e => update(row.id as any, "medicamento_controlado", e.target.checked)} />
                                <span className="small fw-semibold">Controlado</span>
                              </label>
                            </div>
                          </>
                        )}

                        {isVac(row.categoria) && (
                          <>
                            <div className="col-6 col-md-2">
                              <InputField label="Doses/embalagem">
                                <input type="number" className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }}
                                  placeholder="Ex: 50" value={row.doses_por_embalagem}
                                  onChange={e => update(row.id as any, "doses_por_embalagem", e.target.value)} />
                              </InputField>
                            </div>
                            <div className="col-6 col-md-2">
                              <InputField label="Volume/dose">
                                <input type="text" className="login-input login-input-icon-left bg-transparent text-foreground"
                                  placeholder="Ex: 2 mL" value={row.volume_por_dose}
                                  onChange={e => update(row.id as any, "volume_por_dose", e.target.value)} />
                              </InputField>
                            </div>
                            <div className="col-6 col-md-2">
                              <InputField label="Temp. mín. (°C)" icon={Thermometer}>
                                <input type="number" step="0.1" className="login-input login-input-icon-left bg-transparent text-foreground"
                                  placeholder="Ex: 2" value={row.temperatura_minima}
                                  onChange={e => update(row.id as any, "temperatura_minima", e.target.value)} />
                              </InputField>
                            </div>
                            <div className="col-6 col-md-2">
                              <InputField label="Temp. máx. (°C)" icon={Thermometer}>
                                <input type="number" step="0.1" className="login-input login-input-icon-left bg-transparent text-foreground"
                                  placeholder="Ex: 8" value={row.temperatura_maxima}
                                  onChange={e => update(row.id as any, "temperatura_maxima", e.target.value)} />
                              </InputField>
                            </div>
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {isFeed(row.categoria) && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                      <p className="small fw-bold text-muted-foreground text-uppercase mb-3" style={{ letterSpacing: "0.08em", fontSize: "0.65rem" }}>
                        <Leaf size={12} className="me-1" /> Informações Nutricionais
                      </p>
                      <div className="row g-3 mb-4">
                        <div className="col-12 col-md-6">
                          <div className="login-input-group mb-0">
                            <label className="login-label fw-semibold">Composição / Garantias</label>
                            <textarea className="login-input bg-transparent text-foreground" rows={2} style={{ paddingLeft: "1rem", height: "auto" }}
                              placeholder="Proteína bruta, energia, fibra..." value={row.composicao}
                              onChange={e => update(row.id as any, "composicao", e.target.value)} />
                          </div>
                        </div>
                        <div className="col-12 col-md-3">
                          <div className="login-input-group mb-0">
                            <label className="login-label fw-semibold">Indicação de uso</label>
                            <textarea className="login-input bg-transparent text-foreground" rows={2} style={{ paddingLeft: "1rem", height: "auto" }}
                              placeholder="Para qual fase/espécie..." value={row.indicacao_uso}
                              onChange={e => update(row.id as any, "indicacao_uso", e.target.value)} />
                          </div>
                        </div>
                        <div className="col-6 col-md-2">
                          <InputField label="Peso embalagem">
                            <input type="number" step="0.01" className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }}
                              placeholder="kg" value={row.peso_embalagem}
                              onChange={e => update(row.id as any, "peso_embalagem", e.target.value)} />
                          </InputField>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── SEÇÃO 3: Lote inicial ── */}
                <p className="small fw-bold text-muted-foreground text-uppercase mb-3" style={{ letterSpacing: "0.08em", fontSize: "0.65rem" }}>
                  <Warehouse size={12} className="me-1" /> Lote Inicial
                </p>
                <div className="row g-3">
                  <div className="col-6 col-md-2">
                    <InputField label="Qtd. inicial" required>
                      <input type="number" step="0.01" className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }}
                        placeholder="0" value={row.quantidade_inicial}
                        onChange={e => update(row.id as any, "quantidade_inicial", e.target.value)} />
                    </InputField>
                  </div>
                  <div className="col-6 col-md-2">
                    <InputField label="Custo unitário (R$)" icon={Banknote}>
                      <input type="number" step="0.01" className="login-input login-input-icon-left bg-transparent text-foreground"
                        placeholder="0,00" value={row.custo_unitario}
                        onChange={e => update(row.id as any, "custo_unitario", e.target.value)} />
                    </InputField>
                  </div>
                  <div className="col-12 col-md-3">
                    <InputField label="Nº Lote">
                      <input type="text" className="login-input login-input-icon-left bg-transparent text-foreground"
                        placeholder="Ex: LOT-2025-001" value={row.numero_lote}
                        onChange={e => update(row.id as any, "numero_lote", e.target.value)} />
                    </InputField>
                  </div>
                  <div className="col-6 col-md-2">
                    <InputField label="Data fabricação" icon={Calendar}>
                      <input type="date" className="login-input login-input-icon-left bg-transparent text-muted-foreground"
                        value={row.data_fabricacao} onChange={e => update(row.id as any, "data_fabricacao", e.target.value)} />
                    </InputField>
                  </div>
                  <div className="col-6 col-md-2">
                    <InputField label="Data validade" icon={Calendar}>
                      <input type="date" className="login-input login-input-icon-left bg-transparent text-muted-foreground"
                        value={row.data_validade} onChange={e => update(row.id as any, "data_validade", e.target.value)} />
                    </InputField>
                  </div>
                  <div className="col-12 col-md-3">
                    <div className="login-input-group mb-0">
                      <label className="login-label fw-semibold">Fornecedor</label>
                      <select 
                        className="login-input bg-transparent text-foreground" 
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
                  <div className="col-6 col-md-2">
                    <InputField label="Nota fiscal">
                      <input type="text" className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }}
                        placeholder="Nº NF" value={row.nota_fiscal}
                        onChange={e => update(row.id as any, "nota_fiscal", e.target.value)} />
                    </InputField>
                  </div>
                  <div className="col-6 col-md-2">
                    <div className="login-input-group mb-0">
                      <label className="login-label fw-semibold">Local armazenamento</label>
                      <select className="login-input bg-transparent text-foreground" style={{ paddingLeft: "1rem" }}
                        value={row.local_armazenamento} onChange={e => update(row.id as any, "local_armazenamento", e.target.value)}>
                        <option value="">Selecione...</option>
                        {LOCAIS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <button
          className="w-100 py-3 mt-2 rounded dashboard-card border-border d-flex align-items-center justify-content-center gap-2 hover-bg-muted transition-all text-primary fw-bold shadow-sm"
          onClick={addRow}
          style={{ borderStyle: "dashed" }}
        >
          <Plus size={18} /> Adicionar outro item ao lote
        </button>
      </div>
    </Modal>
  );
}
