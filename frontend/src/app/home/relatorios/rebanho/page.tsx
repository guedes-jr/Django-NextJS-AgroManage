"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { apiClient } from "@/services/api";
import { Beef, TrendingUp, TrendingDown, ArrowDown, ArrowUp, Search, Filter, Tag, Activity, Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface LivestockReport {
  total_animals: number;
  items: {
    id: string;
    farm: string;
    species: string;
    species_code: string;
    breed: string | null;
    batch_code: string;
    name: string | null;
    category: string | null;
    origin: string | null;
    quantity: number;
    status: string;
    entry_date: string | null;
    avg_weight: number | null;
  }[];
  by_species: { species: string; total: number; batches: number }[];
  by_farm: { farm: string; total: number; batches: number }[];
  by_status: { status: string; total: number; batches: number }[];
}

function RebanhoReportsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL Params State
  const initialSpecies = searchParams.get("species") || "";
  const initialCategory = searchParams.get("category") || "";
  const initialStatus = searchParams.get("status") || "";
  const initialSearch = searchParams.get("search") || "";

  const [data, setData] = useState<LivestockReport | null>(null);
  const [organization, setOrganization] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'inventario' | 'movimentacao'>('movimentacao');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get("/organizations/me/").then(res => {
      setOrganization(res.data);
    }).catch(err => console.error("Error fetching org:", err));
  }, []);

  // Local filter states
  const [species, setSpecies] = useState(initialSpecies);
  const [category, setCategory] = useState(initialCategory);
  const [status, setStatus] = useState(initialStatus);
  const [search, setSearch] = useState(initialSearch);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (species) params.append("species", species);
      if (category) params.append("category", category);
      if (status) params.append("status", status);
      if (search) params.append("search", search);

      const res = await apiClient.get(`/reports/livestock/inventory/?${params.toString()}`);
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [species, category, status, searchParams]); // re-fetch when params change

  // Apply filters via URL
  const applyFilters = () => {
    const params = new URLSearchParams();
    if (species) params.append("species", species);
    if (category) params.append("category", category);
    if (status) params.append("status", status);
    if (search) params.append("search", search);
    router.push(`${pathname}?${params.toString()}`);
  };

  // Listen to enter key on search
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') applyFilters();
  };

  // Debounced search effect (optional, or just use applyFilters button/enter)
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (search !== initialSearch) applyFilters();
    }, 600);
    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  const exportToPDF = () => {
    if (!data) return;
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.text(organization?.name || "Relatório de Rebanho", 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Documento: ${organization?.document || 'N/A'}`, 14, 30);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 35);
    
    // Summary
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text("Resumo:", 14, 45);
    doc.setFontSize(10);
    doc.text(`Total de Animais: ${data.total_animals}`, 14, 52);
    doc.text(`Total de Lotes/Registros: ${data.items.length}`, 14, 57);
    doc.text(`Espécies: ${data.by_species.map(s => s.species).join(", ") || 'N/A'}`, 14, 62);

    // Table
    const tableData = data.items.map(item => [
      item.batch_code,
      item.quantity.toString(),
      item.species,
      item.category || "N/A",
      item.farm,
      item.entry_date ? new Date(item.entry_date).toLocaleDateString('pt-BR') : "-",
      item.status
    ]);

    autoTable(doc, {
      startY: 70,
      head: [["Identificação", "Qtd", "Espécie", "Categoria", "Fazenda", "Data", "Status"]],
      body: tableData,
    });

    doc.save("relatorio_rebanho.pdf");
  };

  const exportToXLSX = () => {
    if (!data) return;
    
    // Summary Sheet
    const summaryData = [
      ["Organização", organization?.name || "N/A"],
      ["Documento", organization?.document || "N/A"],
      ["Data de Geração", new Date().toLocaleString('pt-BR')],
      [""],
      ["Total de Animais", data.total_animals],
      ["Total de Registros", data.items.length]
    ];
    
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    
    // Details Sheet
    const detailsData = data.items.map(item => ({
      "Identificação": item.batch_code,
      "Nome": item.name || "",
      "Quantidade": item.quantity,
      "Espécie": item.species,
      "Categoria": item.category || "",
      "Raça": item.breed || "",
      "Fazenda": item.farm,
      "Data de Referência": item.entry_date ? new Date(item.entry_date).toLocaleDateString('pt-BR') : "",
      "Status": item.status
    }));
    
    const wsDetails = XLSX.utils.json_to_sheet(detailsData);
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo");
    XLSX.utils.book_append_sheet(wb, wsDetails, "Detalhado");
    
    XLSX.writeFile(wb, "relatorio_rebanho.xlsx");
  };

  return (
    <div className="p-4 p-md-5">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-5 gap-3">
        <div>
          <h1 className="fw-bold mb-1" style={{ fontSize: '2rem', letterSpacing: '-0.03em', color: "var(--foreground)" }}>
            Relatório de Rebanho
          </h1>
          <p className="text-muted-foreground mb-0 fw-medium">Análise detalhada do seu plantel com filtros avançados</p>
        </div>
        <div className="d-flex gap-2">
          <button 
            className="btn btn-outline-primary px-3 fw-medium d-flex align-items-center gap-2"
            onClick={exportToPDF}
            disabled={loading || !data?.items?.length}
          >
            <Download size={16} /> PDF
          </button>
          <button 
            className="btn btn-outline-success px-3 fw-medium d-flex align-items-center gap-2"
            onClick={exportToXLSX}
            disabled={loading || !data?.items?.length}
          >
            <Download size={16} /> Excel
          </button>
          <button 
            className="btn btn-light px-4 fw-medium border shadow-sm"
            onClick={() => {
              setSpecies(""); setCategory(""); setStatus(""); setSearch("");
              router.push(pathname);
            }}
          >
            Limpar Filtros
          </button>
        </div>
      </div>

      {/* KPIs Resumo */}
      <div className="row g-4 mb-5">
        <div className="col-12 col-md-4">
          <div className="dashboard-card p-4" style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
            <div className="d-flex align-items-center gap-3">
              <div className="d-flex align-items-center justify-content-center rounded-circle bg-primary/10 text-primary" style={{ width: '48px', height: '48px' }}>
                <Beef size={24} />
              </div>
              <div>
                <div className="text-muted-foreground fw-semibold small text-uppercase" style={{ letterSpacing: '0.05em' }}>Total Animais</div>
                <div className="fw-bold text-foreground" style={{ fontSize: '1.75rem' }}>{loading ? "..." : data?.total_animals || 0}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="dashboard-card p-4" style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
            <div className="d-flex align-items-center gap-3">
              <div className="d-flex align-items-center justify-content-center rounded-circle bg-success/10 text-success" style={{ width: '48px', height: '48px' }}>
                <TrendingUp size={24} />
              </div>
              <div>
                <div className="text-muted-foreground fw-semibold small text-uppercase" style={{ letterSpacing: '0.05em' }}>Lotes / Registros</div>
                <div className="fw-bold text-foreground" style={{ fontSize: '1.75rem' }}>{loading ? "..." : data?.items?.length || 0}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="dashboard-card p-4" style={{ border: '1px solid var(--border)', background: 'var(--card)' }}>
            <div className="d-flex align-items-center gap-3">
              <div className="d-flex align-items-center justify-content-center rounded-circle bg-warning/10 text-warning" style={{ width: '48px', height: '48px' }}>
                <Activity size={24} />
              </div>
              <div>
                <div className="text-muted-foreground fw-semibold small text-uppercase" style={{ letterSpacing: '0.05em' }}>Espécies Encontradas</div>
                <div className="fw-bold text-foreground" style={{ fontSize: '1.75rem' }}>{loading ? "..." : data?.by_species?.length || 0}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 border-bottom border-border">
        <ul className="nav nav-tabs border-0 gap-3" style={{ marginBottom: '-1px' }}>
          <li className="nav-item">
            <button 
              className={`nav-link border-0 fw-semibold pb-3 px-1 ${activeTab === 'movimentacao' ? 'active border-bottom border-2 border-primary text-primary' : 'text-muted-foreground'}`}
              onClick={() => setActiveTab('movimentacao')}
              style={{ background: 'transparent' }}
            >
              Listagem Detalhada
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link border-0 fw-semibold pb-3 px-1 ${activeTab === 'inventario' ? 'active border-bottom border-2 border-primary text-primary' : 'text-muted-foreground'}`}
              onClick={() => setActiveTab('inventario')}
              style={{ background: 'transparent' }}
            >
              Resumo Agrupado
            </button>
          </li>
        </ul>
      </div>

      {/* Área Principal de Filtros e Tabela */}
      {activeTab === 'movimentacao' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="dashboard-card overflow-hidden p-0 shadow-sm" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
          
          {/* Header & Filters */}
          <div className="p-4 border-bottom border-border bg-muted/10">
            <div className="row g-3 align-items-center">
              <div className="col-12 col-md-4">
                <div className="position-relative">
                  <Search className="position-absolute text-muted-foreground" size={18} style={{ left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input 
                    type="text" 
                    className="form-control shadow-none transition-all focus-ring" 
                    placeholder="Buscar lote, brinco, identificação..." 
                    style={{ paddingLeft: '44px', height: '46px', borderRadius: '2rem', border: '1px solid var(--border)', backgroundColor: '#ffffff', color: '#000000' }}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                </div>
              </div>
              <div className="col-12 col-md-8">
                <div className="d-flex flex-wrap gap-2 justify-content-md-end">
                  <select 
                    className="form-select shadow-none bg-background text-foreground" 
                    style={{ width: 'auto', minWidth: '150px', borderRadius: '2rem', height: '46px' }}
                    value={species}
                    onChange={(e) => { setSpecies(e.target.value); applyFilters(); }}
                  >
                    <option value="">Todas as Espécies</option>
                    <option value="bovinos">Bovinos</option>
                    <option value="suinos">Suínos</option>
                    <option value="aves">Aves</option>
                  </select>
                  
                  <select 
                    className="form-select shadow-none bg-background text-foreground" 
                    style={{ width: 'auto', minWidth: '150px', borderRadius: '2rem', height: '46px' }}
                    value={category}
                    onChange={(e) => { setCategory(e.target.value); applyFilters(); }}
                  >
                    <option value="">Todas Categorias</option>
                    <option value="Matriz">Matrizes</option>
                    <option value="Reprodutor">Reprodutores (Bov)</option>
                    <option value="Cachaço">Cachaços (Suíno)</option>
                    <option value="Bezerro">Bezerros</option>
                    <option value="Leitão">Leitões</option>
                    <option value="Terminação">Terminação</option>
                    <option value="Lote">Lotes</option>
                  </select>

                  <select 
                    className="form-select shadow-none bg-background text-foreground" 
                    style={{ width: 'auto', minWidth: '140px', borderRadius: '2rem', height: '46px' }}
                    value={status}
                    onChange={(e) => { setStatus(e.target.value); applyFilters(); }}
                  >
                    <option value="">Status (Todos)</option>
                    <option value="active">Ativos</option>
                    <option value="sold">Vendidos</option>
                    <option value="dead">Óbito</option>
                    <option value="sick">Doentes</option>
                    <option value="quarantine">Quarentena</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle text-nowrap" style={{ minWidth: '800px' }}>
              <thead>
                <tr style={{ background: 'var(--muted)', borderBottom: '2px solid var(--border)' }}>
                  <th className="fw-bold text-muted-foreground border-0 py-3 ps-4" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Identificação</th>
                  <th className="fw-bold text-muted-foreground border-0 py-3" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Qtd</th>
                  <th className="fw-bold text-muted-foreground border-0 py-3" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Espécie / Categoria</th>
                  <th className="fw-bold text-muted-foreground border-0 py-3" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fazenda</th>
                  <th className="fw-bold text-muted-foreground border-0 py-3" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Data Ref.</th>
                  <th className="fw-bold text-muted-foreground border-0 py-3 pe-4" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-5">
                      <div className="spinner-border text-primary" role="status" />
                    </td>
                  </tr>
                ) : !data?.items || data.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-5">
                      <div className="d-flex flex-column align-items-center justify-content-center text-muted-foreground opacity-75">
                        <Filter size={48} className="mb-3 opacity-50" strokeWidth={1} />
                        <h5 className="fw-semibold text-foreground mb-1">Nenhum resultado encontrado</h5>
                        <p className="small mb-0">Seus filtros não retornaram nenhum animal ou lote.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <AnimatePresence>
                    {data.items.map((row, idx) => (
                      <motion.tr 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, delay: idx > 15 ? 0 : idx * 0.03 }}
                        key={row.id || idx} 
                        style={{ borderBottom: '1px solid var(--border)' }}
                        className="bg-background hover-bg-muted/50 transition-colors"
                      >
                        <td className="py-3 ps-4">
                          <div className="d-flex align-items-center gap-3">
                            <div className="d-flex align-items-center justify-content-center rounded-circle bg-primary/10 text-primary" style={{ width: '40px', height: '40px' }}>
                              <Tag size={18} />
                            </div>
                            <div>
                              <div className="fw-bold text-foreground" style={{ fontSize: '0.95rem' }}>{row.batch_code}</div>
                              <div className="text-muted-foreground" style={{ fontSize: '0.75rem' }}>{row.name || 'Sem nome alternativo'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="fw-bold text-foreground bg-secondary/10 text-secondary d-inline-block text-center rounded-pill px-2 py-1" style={{ fontSize: '0.85rem', minWidth: '32px' }}>
                            {row.quantity || 1}
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="d-flex flex-column">
                            <span className="fw-semibold text-foreground mb-1" style={{ fontSize: '0.9rem' }}>{row.species}</span>
                            <span className="text-muted-foreground" style={{ fontSize: '0.75rem' }}>{row.category || 'N/A'} {row.breed ? `• ${row.breed}` : ''}</span>
                          </div>
                        </td>
                        <td className="py-3">
                          <span className="fw-medium text-foreground">{row.farm}</span>
                        </td>
                        <td className="py-3 text-muted-foreground fw-medium" style={{ fontSize: '0.9rem' }}>
                          {row.entry_date ? new Date(row.entry_date).toLocaleDateString('pt-BR') : '-'}
                        </td>
                        <td className="py-3 pe-4">
                          <span className={`badge rounded-pill px-3 py-2 fw-semibold d-inline-flex align-items-center gap-1 ${
                            row.status === 'Ativo' || row.status === 'active' ? 'bg-success/15 text-success border border-success/20' : 
                            row.status === 'Vendido' || row.status === 'sold' ? 'bg-primary/15 text-primary border border-primary/20' : 
                            'bg-muted text-muted-foreground border border-border'
                          }`}>
                            <div className={`rounded-circle ${
                              row.status === 'Ativo' || row.status === 'active' ? 'bg-success' : 
                              row.status === 'Vendido' || row.status === 'sold' ? 'bg-primary' : 
                              'bg-muted-foreground'
                            }`} style={{ width: '6px', height: '6px' }}></div>
                            {row.status}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {activeTab === 'inventario' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="row">
          <div className="col-md-6 mb-4">
            <div className="dashboard-card h-100 p-4" style={{ borderRadius: '0.75rem', border: '1px solid var(--border)', background: 'var(--card)' }}>
              <h5 className="fw-bold mb-4">Animais por Espécie</h5>
              {loading ? (
                <div className="text-center py-4"><div className="spinner-border text-primary" role="status" /></div>
              ) : data?.by_species?.map(s => (
                <div key={s.species} className="d-flex justify-content-between align-items-center mb-3 pb-3 border-bottom border-border">
                  <div className="d-flex align-items-center gap-2">
                    <div className="bg-primary/10 text-primary p-2 rounded"><Beef size={16}/></div>
                    <span className="fw-medium">{s.species}</span>
                  </div>
                  <div className="text-end">
                    <div className="fw-bold">{s.total}</div>
                    <div className="small text-muted-foreground">{s.batches} registros</div>
                  </div>
                </div>
              ))}
              {!loading && (!data?.by_species || data.by_species.length === 0) && (
                <p className="text-muted-foreground text-center py-4">Nenhum animal registrado</p>
              )}
            </div>
          </div>
          <div className="col-md-6 mb-4">
            <div className="dashboard-card h-100 p-4" style={{ borderRadius: '0.75rem', border: '1px solid var(--border)', background: 'var(--card)' }}>
              <h5 className="fw-bold mb-4">Animais por Fazenda</h5>
              {loading ? (
                <div className="text-center py-4"><div className="spinner-border text-primary" role="status" /></div>
              ) : data?.by_farm?.map(f => (
                <div key={f.farm} className="d-flex justify-content-between align-items-center mb-3 pb-3 border-bottom border-border">
                  <div className="d-flex align-items-center gap-2">
                    <div className="bg-success/10 text-success p-2 rounded"><Activity size={16}/></div>
                    <span className="fw-medium">{f.farm}</span>
                  </div>
                  <div className="text-end">
                    <div className="fw-bold">{f.total}</div>
                    <div className="small text-muted-foreground">{f.batches} registros</div>
                  </div>
                </div>
              ))}
              {!loading && (!data?.by_farm || data.by_farm.length === 0) && (
                <p className="text-muted-foreground text-center py-4">Nenhuma fazenda encontrada</p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default function RebanhoReportsPage() {
  return (
    <Suspense fallback={
      <div className="d-flex justify-content-center align-items-center" style={{ height: '50vh' }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    }>
      <RebanhoReportsContent />
    </Suspense>
  );
}