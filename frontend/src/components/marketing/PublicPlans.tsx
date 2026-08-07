"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, LoaderCircle } from "lucide-react";

interface PublicPlan {
  id: string;
  code: string;
  name: string;
  description: string;
  monthly_price: string;
  yearly_price: string;
  trial_days: number;
  max_users: number | null;
  max_farms: number | null;
  max_storage_mb: number | null;
  max_reports_per_month: number | null;
}

const money = (value: string) => Number(value).toLocaleString("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function PublicPlans({ compact = false, showBillingToggle = false }: { compact?: boolean; showBillingToggle?: boolean }) {
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

  useEffect(() => {
    let active = true;
    fetch("/api/v1/public/plans/")
      .then((response) => {
        if (!response.ok) throw new Error("plans unavailable");
        return response.json() as Promise<PublicPlan[]>;
      })
      .then((data) => { if (active) setPlans(data); })
      .catch(() => { if (active) setPlans([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <div className="marketing-loading"><LoaderCircle className="spin" size={24} /> Carregando planos</div>;
  if (!plans.length) return <div className="marketing-empty">Fale com nossa equipe para conhecer os planos disponíveis.</div>;

  const landingPlanCodes = ["essencial", "profissional", "gestao-plus"];
  const landingPlans = landingPlanCodes
    .map((code) => plans.find((plan) => plan.code === code))
    .filter((plan): plan is PublicPlan => Boolean(plan));
  const visible = compact
    ? (landingPlans.length === landingPlanCodes.length ? landingPlans : plans.slice(0, 3))
    : plans;
  return <>{showBillingToggle && <div className="billing-toggle" aria-label="Ciclo de cobrança">
    <button className={billing === "monthly" ? "active" : ""} onClick={() => setBilling("monthly")}>Mensal</button>
    <button className={billing === "yearly" ? "active" : ""} onClick={() => setBilling("yearly")}>Anual</button>
  </div>}<div className="pricing-grid">
    {visible.map((plan, index) => {
      const featured = visible.length > 1 && index === Math.min(1, visible.length - 1);
      return <article className={`pricing-card ${featured ? "featured" : ""}`} key={plan.id}>
        {featured && <span className="pricing-highlight">Mais escolhido</span>}
        <div className="pricing-code">{plan.code}</div>
        <h3>{plan.name}</h3>
        <p>{plan.description || "Gestão rural organizada para sua operação."}</p>
        <div className="pricing-price"><strong>{billing === "yearly" && Number(plan.yearly_price) > 0 ? money(plan.yearly_price) : money(plan.monthly_price)}</strong><span>/{billing === "yearly" && Number(plan.yearly_price) > 0 ? "ano" : "mês"}</span></div>
        {billing === "monthly" && Number(plan.yearly_price) > 0 && <div className="pricing-yearly">ou {money(plan.yearly_price)} por ano</div>}
        {billing === "yearly" && Number(plan.yearly_price) <= 0 && <div className="pricing-yearly">Cobrança anual sob consulta</div>}
        <ul>
          <li><Check size={16} /> {plan.max_users ? `Até ${plan.max_users} usuários` : "Usuários ilimitados"}</li>
          <li><Check size={16} /> {plan.max_farms ? `Até ${plan.max_farms} fazendas` : "Fazendas ilimitadas"}</li>
          <li><Check size={16} /> Estoque, financeiro e relatórios</li>
          {plan.trial_days > 0 && <li><Check size={16} /> {plan.trial_days} dias para testar</li>}
        </ul>
        <Link href={`/contato?plano=${plan.code}`} className={featured ? "marketing-button primary" : "marketing-button secondary"}>Quero este plano</Link>
      </article>;
    })}
  </div>{showBillingToggle&&<div className="plan-comparison"><h2>Compare os principais limites</h2><div className="table-responsive"><table><thead><tr><th>Plano</th><th>Usuários</th><th>Fazendas</th><th>Armazenamento</th><th>Relatórios/mês</th><th>Teste</th></tr></thead><tbody>{plans.filter(plan=>landingPlanCodes.includes(plan.code)).map(plan=><tr key={plan.id}><th>{plan.name}</th><td>{plan.max_users||"Ilimitado"}</td><td>{plan.max_farms||"Ilimitado"}</td><td>{plan.max_storage_mb?`${Math.round(plan.max_storage_mb/1024)} GB`:"Ilimitado"}</td><td>{plan.max_reports_per_month||"Ilimitado"}</td><td>{plan.trial_days?`${plan.trial_days} dias`:"Sob consulta"}</td></tr>)}</tbody></table></div></div>}</>;
}
