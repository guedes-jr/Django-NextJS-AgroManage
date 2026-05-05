"use client";

import { useState, useEffect } from "react";
import { 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Eye, 
  Trash2, 
  CheckCircle,
  Clock,
  AlertCircle,
  X
} from "lucide-react";
import { apiClient } from "@/services/api";
import { useToast } from "@/components/ui/Toast";

export function TransactionManager() {
  const { showToast } = useToast();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterType, setFilterType] = useState("");

  // Form State
  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    category: "",
    bank_account: "",
    due_date: new Date().toISOString().split('T')[0],
    status: "pending",
    payment_method: "pix",
    reference: "",
    notes: ""
  });

  useEffect(() => {
    fetchData();
  }, [filterType]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = filterType ? `?type=${filterType}` : "";
      const [resTrans, resCats, resAccs] = await Promise.all([
        apiClient.get(`/finance/transactions/${params}`),
        apiClient.get("/finance/categories/"),
        apiClient.get("/finance/accounts/")
      ]);
      setTransactions(resTrans.data.results || resTrans.data);
      setCategories(resCats.data.results || resCats.data);
      setAccounts(resAccs.data.results || resAccs.data);
    } catch (err) {
      console.error("Error fetching finance data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post("/finance/transactions/", formData);
      showToast("Transação registrada com sucesso!", "success");
      setIsModalOpen(false);
      setFormData({
        description: "",
        amount: "",
        category: "",
        bank_account: "",
        due_date: new Date().toISOString().split('T')[0],
        status: "pending",
        payment_method: "pix",
        reference: "",
        notes: ""
      });
      fetchData();
    } catch (err) {
      showToast("Erro ao registrar transação.", "error");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Deseja realmente excluir esta transação?")) return;
    try {
      await apiClient.delete(`/finance/transactions/${id}/`);
      showToast("Transação excluída.", "success");
      fetchData();
    } catch (err) {
      showToast("Erro ao excluir.", "error");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid": return <span className="badge bg-success/10 text-success rounded-pill px-3 py-1 fw-semibold"><CheckCircle size={12} className="me-1" /> Pago</span>;
      case "pending": return <span className="badge bg-warning/10 text-warning rounded-pill px-3 py-1 fw-semibold"><Clock size={12} className="me-1" /> Pendente</span>;
      case "overdue": return <span className="badge bg-danger/10 text-danger rounded-pill px-3 py-1 fw-semibold"><AlertCircle size={12} className="me-1" /> Atrasado</span>;
      default: return <span className="badge bg-muted text-muted-foreground rounded-pill px-3 py-1">{status}</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Table Header / Filters */}
      <div className="dashboard-card p-4 border border-border bg-background shadow-sm">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-4">
          <div className="d-flex align-items-center gap-3">
            <h4 className="fw-bold text-foreground mb-0">Transações</h4>
            <div className="d-flex bg-muted/50 p-1 rounded-lg">
              <button 
                onClick={() => setFilterType("")}
                className={`px-3 py-1 rounded-md small fw-bold border-0 transition-all ${filterType === "" ? "bg-white text-primary shadow-sm" : "bg-transparent text-muted-foreground"}`}
              >
                Todas
              </button>
              <button 
                onClick={() => setFilterType("revenue")}
                className={`px-3 py-1 rounded-md small fw-bold border-0 transition-all ${filterType === "revenue" ? "bg-white text-success shadow-sm" : "bg-transparent text-muted-foreground"}`}
              >
                Receitas
              </button>
              <button 
                onClick={() => setFilterType("expense")}
                className={`px-3 py-1 rounded-md small fw-bold border-0 transition-all ${filterType === "expense" ? "bg-white text-danger shadow-sm" : "bg-transparent text-muted-foreground"}`}
              >
                Despesas
              </button>
            </div>
          </div>
          
          <div className="d-flex gap-2">
            <div className="position-relative flex-grow-1" style={{ minWidth: 250 }}>
              <input type="text" className="form-control ps-5 py-2" placeholder="Buscar transação..." />
              <Search className="position-absolute start-0 top-50 translate-middle-y ms-3 text-muted-foreground" size={18} />
            </div>
            <button className="btn btn-primary fw-bold px-4 d-flex align-items-center gap-2" onClick={() => setIsModalOpen(true)}>
              <Plus size={18} /> Nova Transação
            </button>
          </div>
        </div>

        <div className="table-responsive mt-4">
          <table className="table table-hover align-middle border-top border-border">
            <thead>
              <tr className="text-muted-foreground small">
                <th className="py-3 border-0">Descrição</th>
                <th className="py-3 border-0">Categoria</th>
                <th className="py-3 border-0">Vencimento</th>
                <th className="py-3 border-0">Valor</th>
                <th className="py-3 border-0">Conta</th>
                <th className="py-3 border-0">Status</th>
                <th className="py-3 border-0 text-end">Ações</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-bottom border-border">
                  <td className="py-3">
                    <span className="fw-bold text-foreground d-block">{t.description}</span>
                    <span className="text-muted-foreground small">{t.reference || "Sem referência"}</span>
                  </td>
                  <td>
                    <span className={`small fw-medium ${t.category_type === 'revenue' ? 'text-success' : 'text-danger'}`}>
                      {t.category_name}
                    </span>
                  </td>
                  <td><span className="text-muted-foreground small">{new Date(t.due_date).toLocaleDateString('pt-BR')}</span></td>
                  <td>
                    <span className={`fw-bold ${t.category_type === 'revenue' ? 'text-success' : 'text-foreground'}`}>
                      {t.category_type === 'expense' ? '- ' : '+ '}
                      R$ {Number(t.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td><span className="badge bg-light text-dark border">{t.bank_account_name || "N/A"}</span></td>
                  <td>{getStatusBadge(t.status)}</td>
                  <td className="text-end">
                    <div className="d-flex justify-content-end gap-2">
                      <button className="btn btn-icon-sm hover-bg-muted text-muted-foreground border-0"><Eye size={16} /></button>
                      <button className="btn btn-icon-sm hover-bg-danger-subtle text-danger border-0" onClick={() => handleDelete(t.id)}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && !loading && (
                <tr><td colSpan={7} className="text-center py-5 text-muted-foreground">Nenhuma transação encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nova Transação */}
      {isModalOpen && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg rounded-2xl overflow-hidden">
              <div className="modal-header bg-primary text-white border-0 py-4 px-5">
                <h5 className="modal-title fw-bold">Nova Transação Financeira</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setIsModalOpen(false)}></button>
              </div>
              <form onSubmit={handleSave}>
                <div className="modal-body p-5 bg-background">
                  <div className="row g-4">
                    <div className="col-12 col-md-8">
                      <label className="form-label fw-bold small text-muted-foreground">Descrição / Item</label>
                      <input 
                        type="text" 
                        className="form-control py-2" 
                        required 
                        value={formData.description}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                        placeholder="Ex: Compra de Ração Inicial" 
                      />
                    </div>
                    <div className="col-12 col-md-4">
                      <label className="form-label fw-bold small text-muted-foreground">Valor (R$)</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        className="form-control py-2 fw-bold" 
                        required 
                        value={formData.amount}
                        onChange={e => setFormData({...formData, amount: e.target.value})}
                        placeholder="0,00" 
                      />
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="form-label fw-bold small text-muted-foreground">Categoria</label>
                      <select 
                        className="form-select py-2" 
                        required
                        value={formData.category}
                        onChange={e => setFormData({...formData, category: e.target.value})}
                      >
                        <option value="">Selecione...</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.category_type === 'revenue' ? 'Entrada' : 'Saída'})</option>)}
                      </select>
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="form-label fw-bold small text-muted-foreground">Data de Vencimento</label>
                      <input 
                        type="date" 
                        className="form-control py-2" 
                        required 
                        value={formData.due_date}
                        onChange={e => setFormData({...formData, due_date: e.target.value})}
                      />
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="form-label fw-bold small text-muted-foreground">Conta / Caixa</label>
                      <select 
                        className="form-select py-2"
                        value={formData.bank_account}
                        onChange={e => setFormData({...formData, bank_account: e.target.value})}
                      >
                        <option value="">Selecione a conta...</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div className="col-12 col-md-6">
                      <label className="form-label fw-bold small text-muted-foreground">Meio de Pagamento</label>
                      <select 
                        className="form-select py-2"
                        value={formData.payment_method}
                        onChange={e => setFormData({...formData, payment_method: e.target.value})}
                      >
                        <option value="pix">PIX</option>
                        <option value="boleto">Boleto</option>
                        <option value="credit_card">Cartão de Crédito</option>
                        <option value="transfer">Transferência</option>
                        <option value="cash">Dinheiro</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="modal-footer p-4 border-0 bg-muted/20">
                  <button type="button" className="btn btn-outline-secondary px-4 fw-bold" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary px-5 fw-bold">Salvar Lançamento</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
