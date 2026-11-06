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
import type { PublicTranslator, PublicTranslationKey } from "@/lib/publicMessages";
import { usePublicLocale } from "@/lib/publicLocale";

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

const planTextKeys: Record<string, PublicTranslationKey> = {
  "Suinocultura": "swine.home.title",
  "Ciclo completo": "public.fullCycle",
  "Gerencie reprodução, maternidade, crescimento e terminação em uma única rotina.": "public.manageReproductionMaternityGrowthAndFinishingInOneRoutine",
  "1 a 10 matrizes": "public.1To10BreedingFemales",
  "11 a 50 matrizes": "public.11To50BreedingFemales",
  "51 a 100 matrizes": "public.51To100BreedingFemales",
  "101 a 200 matrizes": "public.101To200BreedingFemales",
  "Acima de 200 matrizes": "public.over200BreedingFemales",
  "Engorda": "swineReproduction.fattening",
  "Acompanhe lotes, consumo e desempenho da fase de crescimento à terminação.": "public.trackBatchesConsumptionAndPerformanceFromGrowthToFinishing",
  "Até 200 animais": "public.upTo200Animals",
  "201 a 1.000 animais": "public.201To1000Animals",
  "Acima de 1.000 animais": "public.over1000Animals",
  "Plantações": "users.crops",
  "Planejamento e produtividade": "public.planningAndProductivity",
  "Controle cultivos, insumos, operações e custos do plantio à colheita.": "public.trackCropsInputsOperationsAndCostsFromPlantingToHarvest",
  "Até 1 hectare": "public.upTo1Hectare",
  "1 a 3 hectares": "public.1To3Hectares",
  "4 a 9 hectares": "public.4To9Hectares",
  "10 a 30 hectares": "public.10To30Hectares",
  "Acima de 30 hectares": "public.over30Hectares"
};
/** Translate built-in catalog copy while preserving custom text, identifiers and prices. */
export function localizePlanText(value: string, t: PublicTranslator): string {
  return planTextKeys[value] ? t(planTextKeys[value]) : value;
}

const getDefaultSegments = (t: PublicTranslator): Segment[] => [
  {
    id: "suinocultura-ciclo-completo",
    title: t("swine.home.title"),
    subtitle: t("public.fullCycle"),
    description: t("public.manageReproductionMaternityGrowthAndFinishingInOneRoutine"),
    image: "/images/reproduction/maternidade.png",
    accent: "wine",
    Icon: PiggyBank,
    annualDiscountPercent: 15,
    tiers: [
      { id: "fallback-ciclo-1", label: t("public.1To10BreedingFemales"), price: 39.9 },
      { id: "fallback-ciclo-2", label: t("public.11To50BreedingFemales"), price: 59.9 },
      { id: "fallback-ciclo-3", label: t("public.51To100BreedingFemales"), price: 89.9 },
      { id: "fallback-ciclo-4", label: t("public.101To200BreedingFemales"), price: 129.9 },
      { id: "fallback-ciclo-5", label: t("public.over200BreedingFemales"), price: null },
    ],
  },
  {
    id: "suinocultura-engorda",
    title: t("swine.home.title"),
    subtitle: t("swineReproduction.fattening"),
    description: t("public.trackBatchesConsumptionAndPerformanceFromGrowthToFinishing"),
    image: "/images/reproduction/crescimento.png",
    accent: "wine",
    Icon: PiggyBank,
    annualDiscountPercent: 15,
    tiers: [
      { id: "fallback-engorda-1", label: t("public.upTo200Animals"), price: 39.9 },
      { id: "fallback-engorda-2", label: t("public.201To1000Animals"), price: 59.9 },
      { id: "fallback-engorda-3", label: t("public.over1000Animals"), price: null },
    ],
  },
  {
    id: "plantacoes",
    title: t("users.crops"),
    subtitle: t("public.planningAndProductivity"),
    description: t("public.trackCropsInputsOperationsAndCostsFromPlantingToHarvest"),
    image: "/landing-agriculture.png",
    accent: "green",
    Icon: Sprout,
    annualDiscountPercent: 15,
    tiers: [
      { id: "fallback-plantacoes-1", label: t("public.upTo1Hectare"), price: 39.9 },
      { id: "fallback-plantacoes-2", label: t("public.1To3Hectares"), price: 59.9 },
      { id: "fallback-plantacoes-3", label: t("public.4To9Hectares"), price: 99.9 },
      { id: "fallback-plantacoes-4", label: t("public.10To30Hectares"), price: 169.9 },
      { id: "fallback-plantacoes-5", label: t("public.over30Hectares"), price: null },
    ],
  },
];


export function PlanBuilder() {
  const { language, t } = usePublicLocale();
  const defaultSegments = useMemo(() => getDefaultSegments(t), [t]);
const planSteps = [
  { number: 1, title: t("public.selectPlans"), text: t("public.chooseOneOrMoreSegments") },
  { number: 2, title: t("plans.reviewOrder"), text: t("public.reviewTheSelectedPlans") },
  { number: 3, title: t("public.finish"), text: t("public.startYourSubscription") },
] as const;

  const formatMoney = (value: number) => value.toLocaleString(language, {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
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
          title: localizePlanText(segment.name, t),
          subtitle: localizePlanText(segment.subtitle, t),
          description: localizePlanText(segment.description, t),
          image: segment.image_path || "/farm-hero.jpg",
          accent: segment.accent,
          Icon: segment.icon === "pig" ? PiggyBank : Sprout,
          annualDiscountPercent: Number(segment.annual_discount_percent),
          tiers: segment.tiers.map((tier) => ({
            id: tier.id,
            label: localizePlanText(tier.label, t),
            price: tier.requires_quote || tier.monthly_price === null ? null : Number(tier.monthly_price),
          })),
        })).filter((segment) => segment.tiers.length > 0);
        if (mapped.length) setSegments(mapped);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [t]);

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
  const annualTotal = total * 12;
  const annualSavings = (subtotal - total) * 12;

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
          <span>{t("public.fazendaMaisPlans")}</span>
          <h1>{t("public.buildYourPlan")}<br/><em>{t("public.yourWay")}</em></h1>
        </div>
        <p>{t("public.chooseOnlyTheSegmentsThatFitYourNeedsPricingScales")}</p>
        <div className="plan-builder-secure"><ShieldCheck/><strong>{t("public.securePurchase")}</strong><small>{t("public.yourDataProtected")}</small></div>
      </div>
    </section>

    <div className="marketing-container">
      <nav className="plan-steps" aria-label={t("public.subscriptionSteps")}>
        {planSteps.map(({ number, title, text }) => <div className={step === number ? "active" : step > number ? "done" : ""} key={number}>
          <span>{step > number ? <Check size={19}/> : number}</span><p><strong>{title}</strong><small>{text}</small></p>
        </div>)}
      </nav>

      {step === 1 ? <>
        <header className="plan-builder-heading">
          <div><span>{t("public.aTailoredPlan")}</span><h2>{t("public.chooseYourOperationSSegments")}</h2><p>{t("public.youCanCombineAsManyModulesAsYouWantIn")}</p></div>
          <div><ShoppingCart/><strong>{chosen.length}</strong><span>{chosen.length === 1 ? t("public.selectedSegment") : t("public.selectedSegments")}</span></div>
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
                    <strong>{tier.price === null ? t("plans.quote") : <>{formatMoney(tier.price)}<small>{t("plans.perMonth")}</small></>}</strong>
                  </label>)}
                </div>
                <div className="segment-discount"><BadgePercent/><span><strong>{segment.annualDiscountPercent}{t("public.discountOnTheAnnualPlan")}</strong><small>{t("public.savingsAppliedAtEveryTier")}</small></span></div>
              </div>
            </article>;
          })}
        </div>

        <section className="plan-selection-bar">
          <div className="selection-summary">
            <h3><ShoppingCart/> {t("public.yourSelectedPlan")}</h3>
            {chosen.length ? chosen.map(({ segment, tier }) => <div className={`selected-plan ${segment.accent}`} key={segment.id}>
              <segment.Icon/><span><strong>{segment.title} {segment.subtitle}</strong><small>{tier.label}</small></span>
              <b>{tier.price === null ? t("plans.quote") : formatMoney(tier.price)}</b>
              <button onClick={() => toggleSegment(segment.id)} aria-label={`Remover ${segment.title}`}><Trash2/></button>
            </div>) : <p className="empty-selection">{t("public.selectAtLeastOneSegmentToBuildYourPlan")}</p>}
            <div className="selection-total"><span>{billing === "yearly" ? t("plans.monthlyEquivalent") : t("plans.monthlyTotal")}</span><strong>{hasCustomPrice ? t("plans.quote") : formatMoney(total)}<small>{t("plans.perMonth")}</small></strong></div>
            {billing === "yearly" && !hasCustomPrice && <div className="selection-annual-total"><span>{t("plans.purchaseTotal")}</span><strong>{formatMoney(annualTotal)}</strong></div>}
          </div>
          <div className="selection-checkout">
            <BillingChoice billing={billing} setBilling={setBilling}/>
            <button className="plan-primary-button" disabled={!chosen.length} onClick={() => { setStep(2); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{t("public.reviewMyPlan")} <ArrowRight/></button>
            <small><LockKeyhole/> {t("public.secureEnvironmentYourDataProtected")}</small>
          </div>
        </section>
      </> : <>
        <header className="plan-builder-heading review-heading">
          <div><span>{t("plans.almostThere")}</span><h2>{t("plans.reviewOrder")}</h2><p>{t("plans.reviewDescription")}</p></div>
          <div><ShoppingCart/><span>{t("public.youCanAddAsManySegmentsAsYouWantTo")}</span></div>
        </header>

        <div className="plan-review-grid">
          <div>
            <section className="review-card review-products">
              <h3><ShoppingCart/> {t("plans.selectedPlans")}</h3>
              {chosen.map(({ segment, tier }) => <div className={`review-line ${segment.accent}`} key={segment.id}>
                <segment.Icon/><span><strong>{segment.title} {segment.subtitle}</strong><small>{tier.label}</small></span><b>{tier.price === null ? t("plans.quote") : <>{formatMoney(tier.price)}<small>{t("plans.perMonth")}</small></>}</b><button onClick={() => toggleSegment(segment.id)} aria-label={`${t("plans.remove")} ${segment.title}`}><Trash2/></button>
              </div>)}
              <button className="add-segment" onClick={() => setStep(1)}><Plus/> {t("plans.addSegment")}</button>
            </section>
            <section className="review-card"><h3>{t("plans.subscriptionType")}</h3><BillingChoice billing={billing} setBilling={setBilling} expanded/>{billing === "yearly" && <div className="annual-callout"><BadgePercent/><span><strong>{t("plans.annualDiscount")}</strong><small>{t("plans.annualDiscountDescription")}</small></span></div>}</section>
          </div>
          <aside>
            <section className="review-card order-summary">
              <h3><ClipboardList/> {t("plans.orderSummary")}</h3>
              {chosen.map(({ segment, tier }) => <div key={segment.id}><span><strong>{segment.title} {segment.subtitle}</strong><small>{tier.label}</small></span><b>{tier.price === null ? t("plans.quote") : formatMoney(billing === "yearly" ? tier.price * (1 - segment.annualDiscountPercent / 100) : tier.price)}</b></div>)}
              <div className="review-total"><strong>{billing === "yearly" ? t("plans.monthlyEquivalent") : t("plans.monthlyTotal")}</strong><b>{hasCustomPrice ? t("plans.quote") : formatMoney(total)}</b></div>
              {billing === "yearly" && !hasCustomPrice && <><div className="review-billing-total"><strong>{t("public.purchaseTotal")}</strong><b>{formatMoney(annualTotal)}</b></div><p>{t("public.savingsOf")} {formatMoney(annualSavings)} {t("public.perYear")}</p></>}
            </section>
            <section className="review-card included-card"><h3>{t("public.whatYouGet")}</h3>{[t("public.fullAccessToSelectedModules"), t("public.updatesAtNoExtraCost"), t("public.specialistSupport"), t("public.secureCloudData"), t("public.cancelWheneverYouWantText")].map((item) => <p key={item}><CheckCircle2/>{item}</p>)}</section>
          </aside>
        </div>
        <div className="review-actions">
          <button onClick={() => { setStep(1); window.scrollTo({ top: 0, behavior: "smooth" }); }}><ArrowLeft/> {t("public.goBackAndEditPlans")}</button>
          <div className="quote-action">{quoteError && <small role="alert">{quoteError}</small>}<button className="plan-primary-button" onClick={continueToCheckout} disabled={quoteLoading}>{quoteLoading ? t("public.preparingQuote") : hasCustomPrice ? t("public.talkToASpecialist") : t("public.continueToSubscription")}{!quoteLoading && <ArrowRight/>}</button></div>
        </div>
      </>}

      <section className="plan-benefits">
        <div><BarChart3/><span><strong>{t("public.realTimeControl")}</strong><small>{t("public.indicatorsForBetterDecisions")}</small></span></div>
        <div><Leaf/><span><strong>{t("public.moreProductivity")}</strong><small>{t("public.simpleIntegratedRoutines")}</small></span></div>
        <div><ShieldCheck/><span><strong>{t("public.yourDataSecure")}</strong><small>{t("public.separateEnvironmentPerOrganization")}</small></span></div>
        <div><Headphones/><span><strong>{t("public.specialistSupport")}</strong><small>{t("public.helpFromPeopleWhoUnderstandYourBusiness")}</small></span></div>
      </section>
    </div>
  </div>;
}

function BillingChoice({ billing, setBilling, expanded = false }: { billing: "monthly" | "yearly"; setBilling: (value: "monthly" | "yearly") => void; expanded?: boolean }) {
  const { t } = usePublicLocale();
  return <div className={`billing-choice ${expanded ? "expanded" : ""}`}>
    <label className={billing === "monthly" ? "active" : ""}><input type="radio" name="billing" checked={billing === "monthly"} onChange={() => setBilling("monthly")}/><span><strong>{t("public.monthlyPlan")}</strong><small>{t("public.cancelWheneverYouWant")}</small></span></label>
    <label className={billing === "yearly" ? "active" : ""}><input type="radio" name="billing" checked={billing === "yearly"} onChange={() => setBilling("yearly")}/><span><strong>{t("public.annualPlan")}</strong><small>{t("public.discountAppliedPerSegment")}</small></span></label>
  </div>;
}
