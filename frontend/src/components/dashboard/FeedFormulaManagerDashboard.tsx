"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import "@/app/home/estoque/estoque.css";

type FormulaIngredient = {
  ingrediente: string;
  percentual: number;
  quantidadeKg: number;
};

type Formula = {
  nome: string;
  descricao: string;
  status: string;
  atualizado: string;
  criadoPor: string;
  ingredientes: FormulaIngredient[];
};

const INITIAL_FORMULAS: Formula[] = [
  {
    nome: "Ração Crescimento",
    descricao: "Ração para fase de crescimento dos animais.",
    status: "Ativa",
    atualizado: "20/05/2025 10:30",
    criadoPor: "João Paulo",
    ingredientes: [
      { ingrediente: "Milho", percentual: 60, quantidadeKg: 600 },
      { ingrediente: "Farelo de Soja", percentual: 25, quantidadeKg: 250 },
      { ingrediente: "Núcleo Premium", percentual: 5, quantidadeKg: 50 },
      { ingrediente: "Calcário Calcítico", percentual: 3, quantidadeKg: 30 },
      { ingrediente: "Fosfato Bicálcico", percentual: 2, quantidadeKg: 20 },
      { ingrediente: "Sal Comum", percentual: 2, quantidadeKg: 20 },
      { ingrediente: "Óleo Vegetal", percentual: 3, quantidadeKg: 30 },
    ],
  },
  { nome: "Ração Engorda", descricao: "Ração para fase final.", status: "Ativa", atualizado: "19/05/2025 09:00", criadoPor: "João Paulo", ingredientes: [
    { ingrediente: "Milho", percentual: 58, quantidadeKg: 580 },
    { ingrediente: "Farelo de Soja", percentual: 28, quantidadeKg: 280 },
    { ingrediente: "Núcleo Premium", percentual: 6, quantidadeKg: 60 },
    { ingrediente: "Calcário Calcítico", percentual: 3, quantidadeKg: 30 },
    { ingrediente: "Fosfato Bicálcico", percentual: 2, quantidadeKg: 20 },
    { ingrediente: "Sal Comum", percentual: 1, quantidadeKg: 10 },
    { ingrediente: "Óleo Vegetal", percentual: 2, quantidadeKg: 20 },
  ] },
  { nome: "Ração Gestação", descricao: "Formulação para matrizes.", status: "Ativa", atualizado: "18/05/2025 14:20", criadoPor: "João Paulo", ingredientes: [
    { ingrediente: "Milho", percentual: 54, quantidadeKg: 540 },
    { ingrediente: "Farelo de Soja", percentual: 30, quantidadeKg: 300 },
    { ingrediente: "Núcleo Premium", percentual: 6, quantidadeKg: 60 },
    { ingrediente: "Calcário Calcítico", percentual: 4, quantidadeKg: 40 },
    { ingrediente: "Fosfato Bicálcico", percentual: 2, quantidadeKg: 20 },
    { ingrediente: "Sal Comum", percentual: 2, quantidadeKg: 20 },
    { ingrediente: "Óleo Vegetal", percentual: 2, quantidadeKg: 20 },
  ] },
];

export function FeedFormulaManagerDashboard() {
  const [formulas, setFormulas] = useState<Formula[]>(INITIAL_FORMULAS);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [search, setSearch] = useState("");

  const selected = formulas[selectedIndex];

  const filteredIndexes = useMemo(() => {
    return formulas
      .map((f, index) => ({ f, index }))
      .filter(({ f }) => f.nome.toLowerCase().includes(search.toLowerCase()))
      .map(({ index }) => index);
  }, [formulas, search]);

  const updateIngredient = (idx: number, field: "percentual" | "quantidadeKg", value: number) => {
    setFormulas((prev) => {
      const next = [...prev];
      const formula = { ...next[selectedIndex] };
      const ingredientes = [...formula.ingredientes];
      ingredientes[idx] = { ...ingredientes[idx], [field]: value };
      formula.ingredientes = ingredientes;
      next[selectedIndex] = formula;
      return next;
    });
  };

  const totals = useMemo(() => {
    if (!selected) return { percentual: 0, quantidade: 0 };
    return {
      percentual: selected.ingredientes.reduce((acc, i) => acc + i.percentual, 0),
      quantidade: selected.ingredientes.reduce((acc, i) => acc + i.quantidadeKg, 0),
    };
  }, [selected]);

  if (!selected) return null;

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
              <button className="btn btn-link text-success p-0 small fw-semibold"><Plus size={14} className="me-1" />Nova fórmula</button>
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
                    <th className="px-3 py-3 border-0 small text-muted-foreground">% na fórmula</th>
                    <th className="px-3 py-3 border-0 small text-muted-foreground">Quantidade (kg)</th>
                    <th className="px-3 py-3 border-0 small text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.ingredientes.map((ing, idx) => (
                    <tr key={`${ing.ingrediente}-${idx}`} className="border-bottom border-border">
                      <td className="px-3 py-3 fw-semibold">
                        <span className="d-inline-flex align-items-center gap-2">
                          <span className="rounded-circle" style={{ width: 8, height: 8, background: "oklch(0.55 0.16 145)" }} />
                          {ing.ingrediente}
                        </span>
                      </td>
                      <td className="px-3 py-3" style={{ maxWidth: 140 }}>
                        <div className="input-group">
                          <input type="number" className="form-control" value={ing.percentual} onChange={(e) => updateIngredient(idx, "percentual", Number(e.target.value || 0))} />
                          <span className="input-group-text">%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3" style={{ maxWidth: 160 }}>
                        <div className="input-group">
                          <input type="number" className="form-control" value={ing.quantidadeKg} onChange={(e) => updateIngredient(idx, "quantidadeKg", Number(e.target.value || 0))} />
                          <span className="input-group-text">kg</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <button className="btn btn-light p-2"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-light w-100 mt-3 fw-semibold"><Plus size={14} className="me-1" />Adicionar ingrediente</button>

            <div className="mt-3 p-3 rounded-3 d-flex justify-content-between align-items-center bg-muted/40">
              <span className="fw-semibold">Total da fórmula</span>
              <div className="d-flex gap-4 fw-bold">
                <span className={totals.percentual === 100 ? "text-success" : "text-warning"}>{totals.percentual.toFixed(2).replace(".", ",")} %</span>
                <span>{totals.quantidade.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} kg</span>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-3">
          <div className="dashboard-card p-4 mb-4">
            <h4 className="fw-bold mb-3" style={{ fontSize: "1rem" }}>Informações da fórmula</h4>
            <div className="small text-muted-foreground mb-1">Status</div>
            <div className="fw-semibold text-success mb-3">{selected.status}</div>
            <div className="small text-muted-foreground mb-1">Última atualização</div>
            <div className="fw-semibold mb-3">{selected.atualizado}</div>
            <div className="small text-muted-foreground mb-1">Criado por</div>
            <div className="fw-semibold">{selected.criadoPor}</div>

            <div className="mt-4 p-3 rounded-3" style={{ background: "oklch(0.98 0.03 90)" }}>
              <div className="small fw-bold mb-1" style={{ color: "oklch(0.55 0.14 85)" }}>Dica</div>
              <div className="small text-muted-foreground">
                As fórmulas criadas ficarão disponíveis na produção de ração.
              </div>
            </div>
          </div>

          <div className="dashboard-card p-4">
            <button className="btn btn-light w-100 mb-2 text-danger fw-semibold">Excluir fórmula</button>
            <button className="btn w-100 fw-semibold" style={{ background: "var(--primary)", color: "white" }}>Salvar alterações</button>
          </div>
        </div>
      </div>
    </div>
  );
}

