"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgePercent,
  BarChart3,
  Check,
  CheckCircle2,
  ClipboardList,
  Headphones,
  Leaf,
  LockKeyhole,
  PiggyBank,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Sprout,
  Trash2,
} from "lucide-react";

type Tier = { id: string; label: string; price: number | null };
type Segment = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  accent: "wine" | "green";
  Icon: typeof Sprout;
  annualDiscountPercent: number;
  tiers: Tier[];
};

type ApiSegment = {
  code: string;
  name: string;
  subtitle: string;
  description: string;
  image_path: string;
  icon: string;
  accent: "wine" | "green";
  annual_discount_percent: string;
  tiers: Array<{ id: string; label: string; monthly_price: string | null; requires_quote: boolean }>;
};

const defaultSegments: Segment[] = [
  {
    id: "suinocultura-ciclo-completo",
    title: "Suinocultura",
    subtitle: "Ciclo completo",
    description: "Gerencie reprodução, maternidade, crescimento e terminação em uma única rotina.",
    image: "/landing-livestock.png",
    accent: "wine",
    Icon: PiggyBank,
    annualDiscountPercent: 15,
    tiers: [
      { id: "fallback-ciclo-1", label: "1 a 10 matrizes", price: 39.9 },
      { id: "fallback-ciclo-2", label: "11 a 50 matrizes", price: 59.9 },
      { id: "fallback-ciclo-3", label: "51 a 100 matrizes", price: 89.9 },
      { id: "fallback-ciclo-4", label: "101 a 200 matrizes", price: 129.9 },
      { id: "fallback-ciclo-5", label: "Acima de 200 matrizes", price: null },
    ],
  },
  {
    id: "suinocultura-engorda",
    title: "Suinocultura",
    subtitle: "Engorda",
    description: "Acompanhe lotes, consumo e desempenho da fase de crescimento à terminação.",
    image: "/images/reproduction/crescimento.png",
    accent: "wine",
    Icon: PiggyBank,
    annualDiscountPercent: 15,
    tiers: [
      { id: "fallback-engorda-1", label: "Até 200 animais", price: 39.9 },
      { id: "fallback-engorda-2", label: "201 a 1.000 animais", price: 59.9 },
      { id: "fallback-engorda-3", label: "Acima de 1.000 animais", price: null },
    ],
  },
  {
    id: "plantacoes",
    title: "Plantações",
    subtitle: "Planejamento e produtividade",
    description: "Controle cultivos, insumos, operações e custos do plantio à colheita.",
    image: "/landing-agriculture.png",
    accent: "green",
    Icon: Sprout,
    annualDiscountPercent: 15,
    tiers: [
      { id: "fallback-plantacoes-1", label: "Até 1 hectare", price: 39.9 },
      { id: "fallback-plantacoes-2", label: "1 a 3 hectares", price: 59.9 },
      { id: "fallback-plantacoes-3", label: "4 a 9 hectares", price: 99.9 },
      { id: "fallback-plantacoes-4", label: "10 a 30 hectares", price: 169.9 },
      { id: "fallback-plantacoes-5", label: "Acima de 30 hectares", price: null },
    ],
  },
];

const planSteps = [
  { number: 1, title: "Selecione os planos", text: "Escolha um ou mais segmentos" },
  { number: 2, title: "Revise seu pedido", text: "Confira os planos escolhidos" },
  { number: 3, title: "Finalize", text: "Faça sua assinatura" },
] as const;

const formatMoney = (value: number) => value.toLocaleString("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

export function PlanBuilder() {
  const [segments, setSegments] = useState<Segment[]>(defaultSegments);
  const [step, setStep] = useState<1 | 2>(1);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [selected, setSelected] = useState<Record<string, number>>({
    "suinocultura-ciclo-completo": 0,
    plantacoes: 0,
  });

  useEffect(() => {
    let active = true;
    fetch("/api/v1/public/plan-segments/")
      .then((response) => {
        if (!response.ok) throw new Error("plan segment catalog unavailable");
        return response.json() as Promise<ApiSegment[]>;
      })
      .then((catalog) => {
        if (!active || !catalog.length) return;
        const mapped = catalog.map((segment): Segment => ({
          id: segment.code,
          title: segment.name,
          subtitle: segment.subtitle,
          description: segment.description,
          image: segment.image_path || "/farm-hero.jpg",
          accent: segment.accent,
          Icon: segment.icon === "pig" ? PiggyBank : Sprout,
          annualDiscountPercent: Number(segment.annual_discount_percent),
          tiers: segment.tiers.map((tier) => ({
            id: tier.id,
            label: tier.label,
            price: tier.requires_quote || tier.monthly_price === null ? null : Number(tier.monthly_price),
          })),
        })).filter((segment) => segment.tiers.length > 0);
        if (mapped.length) setSegments(mapped);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const chosen = useMemo(() => segments.flatMap((segment) => {
    const tierIndex = selected[segment.id];
    const tier = tierIndex === undefined ? undefined : segment.tiers[tierIndex];
    return tier ? [{ segment, tier }] : [];
  }), [selected, segments]);
  const subtotal = chosen.reduce((sum, item) => sum + (item.tier.price ?? 0), 0);
  const total = chosen.reduce((sum, item) => {
    if (item.tier.price === null) return sum;
    const multiplier = billing === "yearly" ? 1 - item.segment.annualDiscountPercent / 100 : 1;
    return sum + item.tier.price * multiplier;
  }, 0);
  const hasCustomPrice = chosen.some((item) => item.tier.price === null);

  const selectTier = (segmentId: string, tierIndex: number) => {
    setSelected((current) => ({ ...current, [segmentId]: tierIndex }));
  };
  const toggleSegment = (segmentId: string) => {
    setSelected((current) => {
      const next = { ...current };
      if (next[segmentId] === undefined) next[segmentId] = 0;
      else delete next[segmentId];
      return next;
    });
  };

  const checkoutHref = `/contato?plano=${encodeURIComponent(chosen.map(({ segment, tier }) => `${segment.title} ${segment.subtitle} - ${tier.label}`).join(", "))}&ciclo=${billing}`;

  const continueToCheckout = async () => {
    setQuoteLoading(true);
    setQuoteError("");
    try {
      const response = await fetch("/api/v1/public/subscription-quotes/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier_ids: chosen.map(({ tier }) => tier.id), billing_cycle: billing }),
      });
      if (!response.ok) throw new Error("quote unavailable");
      const quote = await response.json() as { public_token: string; requires_contact: boolean };
      window.location.assign(`${checkoutHref}&orcamento=${quote.public_token}${quote.requires_contact ? "&atendimento=1" : ""}`);
    } catch {
      const usingFallback = chosen.some(({ tier }) => tier.id.startsWith("fallback-"));
      if (usingFallback) window.location.assign(`${checkoutHref}&atendimento=1`);
      else setQuoteError("Não foi possível registrar o orçamento agora. Tente novamente em instantes.");
    } finally {
      setQuoteLoading(false);
    }
  };

  return <div className="plan-builder">
    <section className="plan-builder-hero">
      <div className="marketing-container plan-builder-hero-inner">
        <div>
          <span>Planos Fazenda Mais</span>
          <h1>Monte seu plano<br/><em>do seu jeito.</em></h1>
        </div>
        <p>Escolha somente os segmentos que fazem sentido para a sua realidade. O valor acompanha o tamanho da sua operação.</p>
        <div className="plan-builder-secure"><ShieldCheck/><strong>Compra segura</strong><small>Seus dados protegidos</small></div>
      </div>
    </section>

    <div className="marketing-container">
      <nav className="plan-steps" aria-label="Etapas da contratação">
        {planSteps.map(({ number, title, text }) => <div className={step === number ? "active" : step > number ? "done" : ""} key={number}>
          <span>{step > number ? <Check size={19}/> : number}</span><p><strong>{title}</strong><small>{text}</small></p>
        </div>)}
      </nav>

      {step === 1 ? <>
        <header className="plan-builder-heading">
          <div><span>Plano sob medida</span><h2>Escolha os segmentos da sua operação</h2><p>Você pode combinar quantos módulos quiser em uma única assinatura.</p></div>
          <div><ShoppingCart/><strong>{chosen.length}</strong><span>{chosen.length === 1 ? "segmento selecionado" : "segmentos selecionados"}</span></div>
        </header>

        <div className="segment-grid">
          {segments.map((segment) => {
            const isSelected = selected[segment.id] !== undefined;
            return <article className={`segment-card ${segment.accent} ${isSelected ? "selected" : ""}`} key={segment.id}>
              <button className="segment-toggle" onClick={() => toggleSegment(segment.id)} aria-label={`${isSelected ? "Remover" : "Adicionar"} ${segment.title} ${segment.subtitle}`} aria-pressed={isSelected}>
                {isSelected && <Check/>}
              </button>
              <div className="segment-image"><Image src={segment.image} alt="" fill sizes="(max-width: 850px) 100vw, 33vw"/></div>
              <div className="segment-content">
                <div className="segment-title"><span><segment.Icon/></span><div><h3>{segment.title}</h3><strong>{segment.subtitle}</strong></div></div>
                <p>{segment.description}</p>
                <div className="segment-tiers">
                  {segment.tiers.map((tier, tierIndex) => <label className={selected[segment.id] === tierIndex ? "active" : ""} key={tier.label}>
                    <input type="radio" name={segment.id} checked={selected[segment.id] === tierIndex} onChange={() => selectTier(segment.id, tierIndex)}/>
                    <span>{tier.label}</span>
                    <strong>{tier.price === null ? "Fale com a equipe" : <>{formatMoney(tier.price)}<small>/mês</small></>}</strong>
                  </label>)}
                </div>
                <div className="segment-discount"><BadgePercent/><span><strong>{segment.annualDiscountPercent}% de desconto no plano anual</strong><small>Economia aplicada a qualquer faixa.</small></span></div>
              </div>
            </article>;
          })}
        </div>

        <section className="plan-selection-bar">
          <div className="selection-summary">
            <h3><ShoppingCart/> Seu plano selecionado</h3>
            {chosen.length ? chosen.map(({ segment, tier }) => <div className={`selected-plan ${segment.accent}`} key={segment.id}>
              <segment.Icon/><span><strong>{segment.title} {segment.subtitle}</strong><small>{tier.label}</small></span>
              <b>{tier.price === null ? "Sob consulta" : formatMoney(tier.price)}</b>
              <button onClick={() => toggleSegment(segment.id)} aria-label={`Remover ${segment.title}`}><Trash2/></button>
            </div>) : <p className="empty-selection">Selecione ao menos um segmento para montar seu plano.</p>}
            <div className="selection-total"><span>Total mensal</span><strong>{hasCustomPrice ? "Sob consulta" : formatMoney(total)}<small>/mês</small></strong></div>
          </div>
          <div className="selection-checkout">
            <BillingChoice billing={billing} setBilling={setBilling}/>
            <button className="plan-primary-button" disabled={!chosen.length} onClick={() => { setStep(2); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Revisar meu plano <ArrowRight/></button>
            <small><LockKeyhole/> Ambiente seguro. Seus dados protegidos.</small>
          </div>
        </section>
      </> : <>
        <header className="plan-builder-heading review-heading">
          <div><span>Quase lá</span><h2>Revise seu pedido</h2><p>Confira os segmentos selecionados e escolha o tipo de assinatura.</p></div>
          <div><ShoppingCart/><span>Você pode adicionar quantos segmentos quiser ao mesmo plano.</span></div>
        </header>

        <div className="plan-review-grid">
          <div>
            <section className="review-card review-products">
              <h3><ShoppingCart/> Planos selecionados</h3>
              {chosen.map(({ segment, tier }) => <div className={`review-line ${segment.accent}`} key={segment.id}>
                <segment.Icon/><span><strong>{segment.title} {segment.subtitle}</strong><small>{tier.label}</small></span><b>{tier.price === null ? "Sob consulta" : <>{formatMoney(tier.price)}<small>/mês</small></>}</b><button onClick={() => toggleSegment(segment.id)} aria-label={`Remover ${segment.title}`}><Trash2/></button>
              </div>)}
              <button className="add-segment" onClick={() => setStep(1)}><Plus/> Adicionar outro segmento</button>
            </section>
            <section className="review-card"><h3>Tipo de assinatura</h3><BillingChoice billing={billing} setBilling={setBilling} expanded/><div className="annual-callout"><BadgePercent/><span><strong>Plano anual com 15% de desconto</strong><small>Economize em todos os segmentos e em qualquer faixa.</small></span></div></section>
          </div>
          <aside>
            <section className="review-card order-summary">
              <h3><ClipboardList/> Resumo do pedido</h3>
              {chosen.map(({ segment, tier }) => <div key={segment.id}><span><strong>{segment.title} {segment.subtitle}</strong><small>{tier.label}</small></span><b>{tier.price === null ? "Sob consulta" : formatMoney(billing === "yearly" ? tier.price * (1 - segment.annualDiscountPercent / 100) : tier.price)}</b></div>)}
              <div className="review-total"><strong>Total mensal</strong><b>{hasCustomPrice ? "Sob consulta" : formatMoney(total)}</b></div>
              {billing === "yearly" && !hasCustomPrice && <p>Economia de {formatMoney((subtotal - total) * 12)} por ano.</p>}
            </section>
            <section className="review-card included-card"><h3>O que você recebe</h3>{["Acesso completo aos módulos selecionados", "Atualizações sem custo adicional", "Suporte especializado", "Dados seguros na nuvem", "Cancele quando quiser"].map((item) => <p key={item}><CheckCircle2/>{item}</p>)}</section>
          </aside>
        </div>
        <div className="review-actions">
          <button onClick={() => { setStep(1); window.scrollTo({ top: 0, behavior: "smooth" }); }}><ArrowLeft/> Voltar e editar planos</button>
          <div className="quote-action">{quoteError && <small role="alert">{quoteError}</small>}<button className="plan-primary-button" onClick={continueToCheckout} disabled={quoteLoading}>{quoteLoading ? "Preparando orçamento..." : hasCustomPrice ? "Falar com um especialista" : "Continuar para contratação"}{!quoteLoading && <ArrowRight/>}</button></div>
        </div>
      </>}

      <section className="plan-benefits">
        <div><BarChart3/><span><strong>Controle em tempo real</strong><small>Indicadores para decidir melhor.</small></span></div>
        <div><Leaf/><span><strong>Mais produtividade</strong><small>Rotinas simples e integradas.</small></span></div>
        <div><ShieldCheck/><span><strong>Seus dados seguros</strong><small>Ambiente separado por organização.</small></span></div>
        <div><Headphones/><span><strong>Suporte especializado</strong><small>Ajuda de quem entende seu negócio.</small></span></div>
      </section>
    </div>
  </div>;
}

function BillingChoice({ billing, setBilling, expanded = false }: { billing: "monthly" | "yearly"; setBilling: (value: "monthly" | "yearly") => void; expanded?: boolean }) {
  return <div className={`billing-choice ${expanded ? "expanded" : ""}`}>
    <label className={billing === "monthly" ? "active" : ""}><input type="radio" name="billing" checked={billing === "monthly"} onChange={() => setBilling("monthly")}/><span><strong>Plano mensal</strong><small>Cancele quando quiser.</small></span></label>
    <label className={billing === "yearly" ? "active" : ""}><input type="radio" name="billing" checked={billing === "yearly"} onChange={() => setBilling("yearly")}/><span><strong>Plano anual <b>15% de desconto</b></strong><small>Mais economia para sua operação.</small></span></label>
  </div>;
}
