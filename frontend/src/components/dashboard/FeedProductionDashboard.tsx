"use client";

import { useMemo, useState } from "react";
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
} from "lucide-react";
import "@/app/home/estoque/estoque.css";

type FormulaItem = {
  ingrediente: string;
  percentual: number;
  estoque: number;
  custoKg: number;
};

const FORMULAS: Record<string, FormulaItem[]> = {
  "Ração Crescimento": [
    { ingrediente: "Milho", percentual: 60, estoque: 8800, custoKg: 1.2 },
    { ingrediente: "Farelo de Soja", percentual: 25, estoque: 3450, custoKg: 1.8 },
    { ingrediente: "Núcleo Premium", percentual: 5, estoque: 250, custoKg: 6.0 },
    { ingrediente: "Calcário Calcítico", percentual: 3, estoque: 200, custoKg: 0.6 },
    { ingrediente: "Fosfato Bicálcico", percentual: 2, estoque: 80, custoKg: 2.2 },
    { ingrediente: "Sal Comum", percentual: 2, estoque: 150, custoKg: 0.8 },
    { ingrediente: "Óleo Vegetal", percentual: 3, estoque: 60, custoKg: 3.2 },
  ],
  "Ração Engorda": [
    { ingrediente: "Milho", percentual: 58, estoque: 8800, custoKg: 1.2 },
    { ingrediente: "Farelo de Soja", percentual: 28, estoque: 3450, custoKg: 1.8 },
    { ingrediente: "Núcleo Premium", percentual: 6, estoque: 250, custoKg: 6.0 },
    { ingrediente: "Calcário Calcítico", percentual: 3, estoque: 200, custoKg: 0.6 },
    { ingrediente: "Fosfato Bicálcico", percentual: 2, estoque: 80, custoKg: 2.2 },
    { ingrediente: "Sal Comum", percentual: 1, estoque: 150, custoKg: 0.8 },
    { ingrediente: "Óleo Vegetal", percentual: 2, estoque: 60, custoKg: 3.2 },
  ],
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

export function FeedProductionDashboard() {
  const [formula, setFormula] = useState<keyof typeof FORMULAS>("Ração Crescimento");
  const [quantidade, setQuantidade] = useState(1000);
  const [dataProducao, setDataProducao] = useState("2025-05-20");

  const composicao = FORMULAS[formula];

  const calculado = useMemo(() => {
    const itens = composicao.map((item) => {
      const quantidadeNecessaria = (quantidade * item.percentual) / 100;
      const custoTotal = quantidadeNecessaria * item.custoKg;
      const suficiente = item.estoque >= quantidadeNecessaria;
      return { ...item, quantidadeNecessaria, custoTotal, suficiente };
    });
    const custoTotal = itens.reduce((acc, i) => acc + i.custoTotal, 0);
    const custoKg = quantidade > 0 ? custoTotal / quantidade : 0;
    const estoqueSuficiente = itens.every((i) => i.suficiente);
    return { itens, custoTotal, custoKg, estoqueSuficiente };
  }, [composicao, quantidade]);

  return (
    <div className="inventory-container pb-5">
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small text-muted-foreground mb-3">
          <Link href="/home/estoque/resumo" className="text-decoration-none text-muted-foreground hover-text-primary">Estoque</Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">Produção de Ração</span>
        </nav>
        <h1 className="fw-black mb-1" style={{ fontSize: "2.1rem", letterSpacing: "-0.03em" }}>Produzir Ração</h1>
        <p className="text-muted-foreground mb-0">Produza rações de forma rápida e controle os custos com eficiência.</p>
      </div>

      <div className="row g-4">
        <div className="col-12 col-xl-9">
          <div className="dashboard-card p-4 mb-4" style={{ borderColor: "oklch(0.78 0.09 150)" }}>
            <h3 className="fw-bold mb-1" style={{ fontSize: "1.05rem" }}>Produzir agora</h3>
            <p className="small text-muted-foreground mb-3">Selecione a fórmula, informe a quantidade e produza sua ração.</p>
            <div className="row g-3 align-items-end">
              <div className="col-12 col-md-4">
                <label className="small fw-semibold mb-1 d-block">Fórmula de ração</label>
                <select className="form-select" value={formula} onChange={(e) => setFormula(e.target.value as keyof typeof FORMULAS)}>
                  {Object.keys(FORMULAS).map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="col-12 col-md-3">
                <label className="small fw-semibold mb-1 d-block">Quantidade a produzir (kg)</label>
                <input className="form-control" type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value || 0))} />
              </div>
              <div className="col-12 col-md-3">
                <label className="small fw-semibold mb-1 d-block">Data da produção</label>
                <input className="form-control" type="date" value={dataProducao} onChange={(e) => setDataProducao(e.target.value)} />
              </div>
              <div className="col-12 col-md-2">
                <button className="btn w-100 fw-bold py-2" style={{ background: "var(--primary)", color: "white" }}>
                  Produzir Ração
                </button>
              </div>
            </div>
          </div>

          <div className="dashboard-card p-0 mb-4 overflow-hidden">
            <div className="p-4 border-bottom border-border">
              <h3 className="fw-bold mb-1" style={{ fontSize: "1.05rem" }}>Composição da fórmula selecionada</h3>
              <p className="small text-muted-foreground mb-0">Veja os ingredientes e quantidades que serão utilizados nesta produção.</p>
            </div>
            <div className="table-responsive">
              <table className="table mb-0">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-4 py-3 border-0 small text-muted-foreground">Ingrediente</th>
                    <th className="px-3 py-3 border-0 small text-muted-foreground">% na fórmula</th>
                    <th className="px-3 py-3 border-0 small text-muted-foreground">Quantidade necessária</th>
                    <th className="px-3 py-3 border-0 small text-muted-foreground">Estoque disponível</th>
                    <th className="px-3 py-3 border-0 small text-muted-foreground">Custo (R$/kg)</th>
                    <th className="px-3 py-3 border-0 small text-muted-foreground">Custo total</th>
                  </tr>
                </thead>
                <tbody>
                  {calculado.itens.map((i) => (
                    <tr key={i.ingrediente} className="border-bottom border-border">
                      <td className="px-4 py-3 fw-semibold">
                        <span className="d-inline-flex align-items-center gap-2">
                          <span className="rounded-circle" style={{ width: 8, height: 8, background: "oklch(0.55 0.16 145)" }} />
                          {i.ingrediente}
                        </span>
                      </td>
                      <td className="px-3 py-3">{i.percentual.toFixed(2).replace(".", ",")} %</td>
                      <td className="px-3 py-3">{i.quantidadeNecessaria.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} kg</td>
                      <td className={`px-3 py-3 ${i.suficiente ? "text-success" : "text-danger"} fw-semibold`}>
                        {i.estoque.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} kg
                      </td>
                      <td className="px-3 py-3">{money(i.custoKg)}</td>
                      <td className="px-3 py-3">{money(i.custoTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={`px-4 py-3 small fw-semibold ${calculado.estoqueSuficiente ? "text-success" : "text-danger"} bg-muted/30`}>
              {calculado.estoqueSuficiente
                ? "Todos os ingredientes possuem estoque suficiente para esta produção."
                : "Atenção: alguns ingredientes não possuem estoque suficiente."}
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
          <div className="dashboard-card p-4 mb-4">
            <h4 className="fw-bold mb-3" style={{ fontSize: "1rem" }}>Resumo da produção</h4>
            <div className="d-flex flex-column gap-3">
              <div className="d-flex align-items-start gap-2"><PackageOpen size={16} className="text-success mt-1" /><div><div className="small text-muted-foreground">Quantidade a produzir</div><div className="fw-bold">{quantidade.toLocaleString("pt-BR")} kg</div></div></div>
              <div className="d-flex align-items-start gap-2"><CircleDollarSign size={16} className="text-warning mt-1" /><div><div className="small text-muted-foreground">Custo total da produção</div><div className="fw-bold">{money(calculado.custoTotal)}</div></div></div>
              <div className="d-flex align-items-start gap-2"><Beaker size={16} className="text-primary mt-1" /><div><div className="small text-muted-foreground">Custo por kg</div><div className="fw-bold">{money(calculado.custoKg)} / kg</div></div></div>
              <div className="d-flex align-items-start gap-2"><TrendingUp size={16} className="text-info mt-1" /><div><div className="small text-muted-foreground">Rendimento esperado</div><div className="fw-bold">{quantidade.toLocaleString("pt-BR")} kg</div></div></div>
              <div className="d-flex align-items-start gap-2"><Factory size={16} className="text-success mt-1" /><div><div className="small text-muted-foreground">Fórmula utilizada</div><div className="fw-bold">{formula}</div></div></div>
            </div>
          </div>

          <div className="dashboard-card p-4">
            <h4 className="fw-bold mb-3" style={{ fontSize: "1rem" }}>Dicas rápidas</h4>
            <div className="p-3 rounded-3 mb-3" style={{ background: "oklch(0.98 0.03 140)" }}>
              <div className="d-flex gap-2">
                <Sprout size={16} className="text-success mt-1" />
                <div className="small text-muted-foreground">Cadastre e mantenha suas fórmulas atualizadas para garantir precisão nos custos.</div>
              </div>
            </div>
            <Link href="/home/estoque/producao-racao/gerenciar-formulas" className="btn btn-light w-100 fw-semibold d-flex align-items-center justify-content-between">
              <span>Gerenciar fórmulas</span>
              <FlaskConical size={16} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

