"use client";

import { isAxiosError } from "axios";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, Save, Package, AlertTriangle,
  ArrowDownRight, CreditCard, ShoppingCart, 
  Utensils, Plus, MapPin
} from "lucide-react";
import { financeService, FinanceAccount, NamedOption } from "@/services/financeService";
import { apiClient } from "@/services/api";

interface InventoryItem {
  id: string;
  nome: string;
  categoria: string;
  unidade_medida: string;
  unidade_display: string;
}

interface Lote {
  id: string;
  numero_lote: string;
  quantidade_atual: string;
  data_validade: string;
}

interface Fornecedor {
  id: string;
  nome: string;
  razao_social: string;
}

interface QuickMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  item?: InventoryItem;
  type: "in" | "out";
}

const inputStyle = {
  height: '48px',
  padding: '0 1rem',
  border: '1.5px solid #e2e8f0',
  borderRadius: '12px',
  backgroundColor: '#f8fafc',
  width: '100%',
  fontSize: '0.95rem',
  fontWeight: '500',
  transition: 'all 0.2s ease',
} as const;

const labelStyle = "form-label small fw-bold text-dark mb-1 d-block";
const DESTINATION_OPTIONS = [
  "Suínos",
  "Bovinos",
  "Avicultura",
  "Plantio",
  "Almoxarifado",
  "Produção de ração",
  "Pecuária",
  "Outro",
];

export function QuickMovementModal({ isOpen, onClose, item: initialItem, type: initialType }: QuickMovementModalProps) {
  const [loading, setLoading] = useState(false);
  const [mainType, setMainType] = useState<"in" | "out">(initialType);
  const [subType, setSubType] = useState<string>("");
  
  const [quantidade, setQuantidade] = useState("");
  const [destino, setDestino] = useState("");
  const [observacao, setObservacao] = useState("");
  const [error, setError] = useState("");

  // Product Selection
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(initialItem || null);
  const [productSearch, setProductSearch] = useState("");
  const [suggestions, setSuggestions] = useState<InventoryItem[]>([]);
  const [, setSearching] = useState(false);

  // Options
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [loteId, setLoteId] = useState<string>("");
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);

  const [farms, setFarms] = useState<NamedOption[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [farmId, setFarmId] = useState("");
  const [purchasePaymentMethod, setPurchasePaymentMethod] = useState("pix");
  const [paymentStatus, setPaymentStatus] = useState("pending");
  const [purchaseDueDate, setPurchaseDueDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [purchasePaymentDate, setPurchasePaymentDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [accountId, setAccountId] = useState("");

  // Entrance fields
  const [numeroLote, setNumeroLote] = useState("");
  const localToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`; };
  const [receiptDate, setReceiptDate] = useState(localToday);
  const [dataValidade, setDataValidade] = useState("");
  const [custoUnitario, setCustoUnitario] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");

  async function fetchFornecedores() {
    try {
      const { data } = await apiClient.get("/inventory/fornecedores/");
      setFornecedores(data.results || data);
    } catch (err) {
      console.error("Erro fornecedores:", err);
    }
  };

  async function fetchLotes(itemId: string) {
    try {
      const { data } = await apiClient.get(`/inventory/items/${itemId}/lots/`);
      setLotes(data);
      if (data.length > 0) setLoteId(data[0].id);
      else setLoteId("");
    } catch (err) {
      console.error("Erro lotes:", err);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (isOpen) queueMicrotask(() => {
      if (cancelled) return;
      setMainType(initialType);
      setSelectedItem(initialItem || null);
      setProductSearch("");
      setSuggestions([]);
      setError("");
      setQuantidade("");
      setDestino("");
      setObservacao("");
      setNumeroLote("");
      setReceiptDate(localToday());
      setDataValidade("");
      setCustoUnitario("");
      setFornecedorId("");
      setSubType(initialType === "in" ? "compra" : "consumo");
      
      fetchFornecedores();
      setPaymentStatus("pending"); setFarmId(""); setAccountId("");
      Promise.all([financeService.farms(), financeService.accounts()]).then(([farms, accounts]) => { setFarms(farms); setAccounts(accounts); }).catch(() => setError("Não foi possível carregar propriedades e contas."));
    });
    return () => { cancelled = true; };
  }, [isOpen, initialItem, initialType]);

  useEffect(() => {
    if (isOpen && selectedItem && mainType === "out") {
      queueMicrotask(() => void fetchLotes(selectedItem.id));
    }
  }, [isOpen, selectedItem, mainType]);

  const handleProductSearch = async (query: string) => {
    setProductSearch(query);
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    try {
      const { data } = await apiClient.get("/inventory/items/all_items/", {
        params: { search: query }
      });
      setSuggestions(data || []);
    } catch (err) {
      console.error("Erro busca:", err);
    } finally {
      setSearching(false);
    }
  };

  const parseDecimalValue = (value: string): number => {
    return Number(value.replace(",", "."));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) { setError("Selecione um produto."); return; }
    const quantidadeNumber = parseDecimalValue(quantidade);

    if (!quantidade || Number.isNaN(quantidadeNumber) || quantidadeNumber <= 0) {
      setError("Informe uma quantidade válida.");
      return;
    }
    if (mainType === "out" && !destino.trim()) {
      setError("Informe o destino da saída.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const payload: Record<string, string | number | null> = {
        item: selectedItem.id,
        tipo: subType,
        quantidade: quantidadeNumber,
        observacao,
        farm: farmId || null,
      };

      if (mainType === "out") {
        if (loteId) payload.lote = loteId;
        payload.destino = destino.trim();
      } else {
        // Para entradas, sempre tentamos enviar numero_lote para o backend criar/vincular o lote
        payload.data_entrada = receiptDate;
        payload.numero_lote = numeroLote || `LOTE-${new Date().getTime().toString().slice(-6)}`;
        if (dataValidade) payload.data_validade = dataValidade;
        if (custoUnitario) payload.custo_unitario = parseDecimalValue(custoUnitario);
        if (fornecedorId) payload.fornecedor = fornecedorId;
      }

      if (subType === "compra") {
        payload.purchase_payment_status = paymentStatus;
        payload.purchase_due_date = purchaseDueDate;
        if (paymentStatus === "paid") {
          payload.purchase_bank_account = accountId;
          payload.purchase_payment_date = purchasePaymentDate;
          payload.purchase_payment_method = purchasePaymentMethod;
        }
      }
      await apiClient.post("/inventory/movimentacoes/", payload);
      onClose();
    } catch (err: unknown) {
      const errorData: unknown = isAxiosError(err) ? err.response?.data : null;
      const describe = (value: unknown): string => {
        if (typeof value === "string") return value;
        if (Array.isArray(value)) return value.map(describe).filter(Boolean).join(" ");
        if (value && typeof value === "object") return Object.values(value).map(describe).filter(Boolean).join(" ");
        return "";
      };
      setError(describe(errorData) || "Erro ao processar a movimentação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="modal-root" style={{ position: 'relative', zIndex: 1100 }}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="modal-backdrop"
          style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0, 0, 0, 0.2)", backdropFilter: "blur(4px)", zIndex: 1040 
          }}
          onClick={onClose}
        />
        <div 
          className="modal-container"
          style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050,
            pointerEvents: 'none', padding: '1rem'
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            className="modal-content"
            style={{ 
              maxWidth: "520px", width: "100%", pointerEvents: 'auto',
              background: "#fdfdfb", borderRadius: "1.5rem",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              overflow: "hidden", display: "flex", flexDirection: "column",
              maxHeight: "95vh", border: "1px solid #e2e8f0"
            }}
          >
            {/* Header */}
            <div className="p-4 border-bottom d-flex justify-content-between align-items-center">
              <div>
                <h2 className="fw-bold mb-0 text-dark" style={{ fontSize: "1.25rem" }}>Registrar Movimentação</h2>
                <p className="text-muted small mb-0">Entrada ou saída de itens do estoque</p>
              </div>
              <button onClick={onClose} className="btn btn-link text-dark p-2 border-0">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="overflow-auto flex-grow-1 p-4">
              
              {/* Main Type Selector (Entrada / Saída) */}
              <div className="d-flex p-1 bg-light rounded-pill border mb-4" style={{ height: '56px' }}>
                <button 
                  type="button"
                  onClick={() => { setMainType("in"); setSubType("compra"); }}
                  className={`flex-grow-1 rounded-pill border-0 fw-bold d-flex align-items-center justify-content-center gap-2 transition-all ${mainType === "in" ? "bg-success text-white shadow-sm" : "bg-transparent text-muted"}`}
                >
                  <Plus size={18} /> Entrada
                </button>
                <button 
                  type="button"
                  onClick={() => { setMainType("out"); setSubType("consumo"); }}
                  className={`flex-grow-1 rounded-pill border-0 fw-bold d-flex align-items-center justify-content-center gap-2 transition-all ${mainType === "out" ? "bg-danger-subtle text-danger shadow-sm" : "bg-transparent text-muted"}`}
                  style={mainType === "out" ? { backgroundColor: "#d66b7a", color: "white" } : {}}
                >
                  <ArrowDownRight size={18} /> Saída
                </button>
              </div>

              {/* Sub-type Specific */}
              <div className="mb-4">
                <label className={labelStyle}>Tipo Específico</label>
                <div className="row g-2">
                  {mainType === "in" ? (
                    <>
                      <div className="col-6">
                        <button type="button" onClick={() => setSubType("compra")} className={`btn w-100 py-3 rounded-xl border d-flex align-items-center gap-2 fw-bold transition-all ${subType === "compra" ? "bg-success-subtle border-success text-success" : "bg-light border-light text-muted"}`}>
                          <ShoppingCart size={18} /> Compra
                        </button>
                      </div>
                      <div className="col-6">
                        <button type="button" onClick={() => setSubType("entrada")} className={`btn w-100 py-3 rounded-xl border d-flex align-items-center gap-2 fw-bold transition-all ${subType === "entrada" ? "bg-success-subtle border-success text-success" : "bg-light border-light text-muted"}`}>
                          <Plus size={18} /> Entrada avulsa
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="col-4">
                        <button type="button" onClick={() => setSubType("consumo")} className={`btn w-100 py-3 rounded-xl border d-flex align-items-center gap-2 fw-bold transition-all ${subType === "consumo" ? "bg-danger-subtle border-danger text-danger" : "bg-light border-light text-muted"}`} style={subType === "consumo" ? { backgroundColor: "#fce7e9", borderColor: "#fecaca" } : {}}>
                          <Utensils size={18} /> Consumo
                        </button>
                      </div>
                      <div className="col-4">
                        <button type="button" onClick={() => setSubType("venda")} className={`btn w-100 py-3 rounded-xl border d-flex align-items-center gap-2 fw-bold transition-all ${subType === "venda" ? "bg-light border-light text-dark" : "bg-light border-light text-muted"}`}>
                          <ArrowDownRight size={18} /> Venda
                        </button>
                      </div>
                      <div className="col-4">
                        <button type="button" onClick={() => setSubType("perda")} className={`btn w-100 py-3 rounded-xl border d-flex align-items-center gap-2 fw-bold transition-all ${subType === "perda" ? "bg-light border-light text-dark" : "bg-light border-light text-muted"}`}>
                          <AlertTriangle size={18} /> Perda
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Product Selection */}
              <div className="mb-4">
                <label className={labelStyle}>Produto</label>
                {!selectedItem ? (
                  <div className="position-relative">
                    <input
                      type="text"
                      style={inputStyle}
                      placeholder="Selecione o produto..."
                      value={productSearch}
                      onChange={(e) => handleProductSearch(e.target.value)}
                    />
                    <Package size={18} className="position-absolute end-0 top-0 mt-3 me-3 text-muted" />
                    {suggestions.length > 0 && (
                      <div className="position-absolute w-100 mt-1 bg-white border rounded-xl shadow-lg z-3 overflow-hidden">
                        {suggestions.map(s => (
                          <button key={s.id} type="button" className="w-100 p-3 text-start border-0 border-bottom bg-transparent hover-bg-light" onClick={() => setSelectedItem(s)}>
                            <div className="fw-bold small">{s.nome}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="d-flex align-items-center justify-content-between p-3 border rounded-xl bg-light">
                    <div className="fw-bold">{selectedItem.nome}</div>
                    <button type="button" onClick={() => setSelectedItem(null)} className="btn btn-sm p-0 text-muted"><X size={16} /></button>
                  </div>
                )}
              </div>

              {/* Qty & Lot */}
              <div className="row g-3 mb-4">
                <div className="col-6">
                  <label className={labelStyle}>Quantidade</label>
                  <input type="number" style={inputStyle} placeholder="0.00" value={quantidade} onChange={e => setQuantidade(e.target.value)} />
                </div>
                <div className="col-6">
                  <label className={labelStyle}>{mainType === "in" ? "Nº do Lote" : "Lote (Opcional)"}</label>
                  {mainType === "in" ? (
                    <input type="text" style={inputStyle} placeholder="Ex: LOT-001" value={numeroLote} onChange={e => setNumeroLote(e.target.value)} />
                  ) : (
                    <select style={inputStyle} value={loteId} onChange={e => setLoteId(e.target.value)}>
                      <option value="">Padrão (FIFO)</option>
                      {lotes.map(l => (
                        <option key={l.id} value={l.id}>{l.numero_lote} - Saldo: {l.quantidade_atual}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {mainType === "in" && <div className="mb-3"><label className={labelStyle}>Data de recebimento no estoque</label><input required type="date" className="form-control" max={localToday()} value={receiptDate} onChange={e => setReceiptDate(e.target.value)} /><small className="text-muted">Para lançamentos retroativos, informe quando o produto foi realmente recebido.</small></div>}
              {/* Specific Purchase Section */}
              {mainType === "in" && subType === "compra" && (
                <div className="p-4 rounded-xl border mb-4 bg-white">
                  <div className="d-flex align-items-center gap-2 mb-3 text-success fw-bold small">
                    <CreditCard size={16} /> Dados da Compra
                  </div>
                  <div className="row g-3 mb-3">
                    <div className="col-6">
                      <label className={labelStyle}>Custo Unitário (R$)</label>
                      <input type="number" style={inputStyle} placeholder="0.00" value={custoUnitario} onChange={e => setCustoUnitario(e.target.value)} step="0.01" />
                    </div>
                    <div className="col-6">
                      <label className={labelStyle}>Data Validade</label>
                      <input type="date" style={inputStyle} value={dataValidade} onChange={e => setDataValidade(e.target.value)} />
                    </div>
                  </div>
                  <div className="mb-0">
                    <label className={labelStyle}>Fornecedor</label>
                    <select style={inputStyle} value={fornecedorId} onChange={e => setFornecedorId(e.target.value)}>
                      <option value="">Selecione...</option>
                      {fornecedores.map(f => (
                        <option key={f.id} value={f.id}>{f.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {mainType === "out" && (
                <div className="mb-4">
                  <label className={labelStyle}>Destino</label>
                  <div className="position-relative">
                    <input
                      type="text"
                      list="quick-stock-destinations"
                      style={{ ...inputStyle, paddingRight: "2.75rem" }}
                      placeholder="Ex: Suínos, Plantio, Almoxarifado..."
                      value={destino}
                      onChange={(e) => setDestino(e.target.value)}
                      required
                    />
                    <MapPin size={18} className="position-absolute end-0 top-0 mt-3 me-3 text-muted" />
                    <datalist id="quick-stock-destinations">
                      {DESTINATION_OPTIONS.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  </div>
                </div>
              )}

              <div className="mb-3">
                <label className={labelStyle}>Propriedade da movimentação</label>
                <select style={inputStyle} value={farmId} onChange={e => setFarmId(e.target.value)}><option value="">Estoque geral da organização</option>{farms.map(farm => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select>
              </div>
              {subType === "compra" && <div className="row g-3 mb-4">
                <label className={`col-12 col-md-6 ${labelStyle}`}>Condição de pagamento<select style={inputStyle} value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}><option value="pending">A pagar / a prazo</option><option value="paid">Pago à vista</option></select></label>
                <label className={`col-12 col-md-6 ${labelStyle}`}>Vencimento<input style={inputStyle} type="date" required value={purchaseDueDate} onChange={e => setPurchaseDueDate(e.target.value)} /></label>
                {paymentStatus === "paid" && <>
                  <label className={`col-12 ${labelStyle}`}>Forma de pagamento<select style={inputStyle} value={purchasePaymentMethod} onChange={e => setPurchasePaymentMethod(e.target.value)}>{Object.entries({ pix: "PIX", boleto: "Boleto", transfer: "Transferência", cash: "Dinheiro", credit_card: "Cartão de crédito" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className={`col-12 col-md-6 ${labelStyle}`}>Conta do pagamento<select style={inputStyle} required value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Selecione</option>{accounts.filter(account => account.is_active).map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                  <label className={`col-12 col-md-6 ${labelStyle}`}>Data do pagamento<input style={inputStyle} type="date" required max={new Date().toLocaleDateString("en-CA")} value={purchasePaymentDate} onChange={e => setPurchasePaymentDate(e.target.value)} /></label>
                </>}
                <p className="small text-muted mb-0">Compras com custo geram um título financeiro. Somente pagamentos confirmados alteram o saldo da conta.</p>
              </div>}

              {/* Observation */}
              <div className="mb-0">
                <label className={labelStyle}>Observação / Motivo</label>
                <textarea
                  style={{ ...inputStyle, height: '100px', padding: '0.75rem', resize: 'none' }}
                  placeholder="Descreva o motivo desta movimentação..."
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                />
              </div>

              {error && (
                <div className="mt-4 p-3 rounded-xl bg-danger-subtle text-danger small fw-bold d-flex align-items-center gap-2">
                  <AlertTriangle size={16} /> {error}
                </div>
              )}
            </form>

            {/* Footer */}
            <div className="p-4 border-top d-flex align-items-center justify-content-end gap-3">
              <button type="button" onClick={onClose} className="btn border-0 fw-bold text-dark">
                Cancelar
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={loading}
                className={`btn py-3 px-4 rounded-xl fw-bold text-white shadow-sm d-flex align-items-center gap-2 border-0 ${mainType === "in" ? "bg-success" : "bg-danger"}`}
                style={mainType === "out" ? { backgroundColor: "#d66b7a" } : {}}
              >
                {loading ? <div className="spinner-border spinner-border-sm" /> : <><Save size={18} /> Confirmar Registro</>}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
