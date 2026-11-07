"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Beef, Droplets, Boxes,
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
import { createPublicSubscriptionQuote, getPublicPlanCatalog } from "@/services/publicPlanCatalog";
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

const planTextKeys: Record<string, PublicTranslationKey> = {
  "Suinocultura": "swine.home.title",
  "Gado de corte": "sidebar.beefCattle",
  "Pecuária leiteira": "sidebar.dairy",
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

export function PlanBuilder() {
  const { language, t } = usePublicLocale();

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
  const [segments, setSegments] = useState<Segment[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [catalogStatus,setCatalogStatus]=useState<'loading'|'ready'|'error'>('loading');
  const [catalogRetry,setCatalogRetry]=useState(0);
  const quoteTask=useRef(false);

  useEffect(() => {
    const abort=new AbortController();
    void getPublicPlanCatalog(abort.signal).then(catalog=>{
      if(abort.signal.aborted)return;
      const icons:Record<string,typeof Sprout>={pig:PiggyBank,swine:PiggyBank,cow:Beef,beef:Beef,cattle:Beef,milk:Droplets,dairy:Droplets,inventory:Boxes,sprout:Sprout};
      setSegments(catalog.map(segment=>({id:segment.id,title:localizePlanText(segment.name,t),subtitle:localizePlanText(segment.subtitle,t),description:localizePlanText(segment.description,t),image:segment.image,accent:segment.accent,Icon:icons[segment.icon]??Leaf,annualDiscountPercent:segment.annualDiscountPercent,tiers:segment.tiers.map(tier=>({...tier,label:localizePlanText(tier.label,t)}))})));
      setSelected(current=>{
        const next:Record<string,string>={};
        for(const segment of catalog)if(segment.tiers.some(tier=>tier.id===current[segment.id]))next[segment.id]=current[segment.id];
        const requested=new URLSearchParams(window.location.search).get('segmento');
        const segment=catalog.find(item=>item.id===requested);
        if(segment&&!next[segment.id])next[segment.id]=segment.tiers[0].id;
        return next;
      });
      setCatalogStatus('ready');
    }).catch(()=>{if(!abort.signal.aborted){setSegments([]);setSelected({});setCatalogStatus('error');}});
    return()=>abort.abort();
  },[catalogRetry,t]);

  const chosen = useMemo(() => segments.flatMap((segment) => {
    const tier = segment.tiers.find(tier=>tier.id===selected[segment.id]);
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

  const selectTier = (segmentId: string, tierId: string) => {
    setSelected((current) => ({ ...current, [segmentId]: tierId }));
  };
  const toggleSegment = (segmentId: string) => {
    setSelected((current) => {
      const next = { ...current };
      if (next[segmentId] === undefined) { const first=segments.find(segment=>segment.id===segmentId)?.tiers[0]; if(first)next[segmentId]=first.id; }
      else delete next[segmentId];
      return next;
    });
  };

  const checkoutHref = `/contato?plano=${encodeURIComponent(chosen.map(({ segment, tier }) => `${segment.title} ${segment.subtitle} - ${tier.label}`).join(", "))}&ciclo=${billing}`;

  const continueToCheckout = async () => {
    if(quoteTask.current||!chosen.length||catalogStatus!=="ready")return;
    quoteTask.current=true;
    setQuoteLoading(true);
    setQuoteError("");
    try {
      const quote=await createPublicSubscriptionQuote(chosen.map(({tier})=>tier.id),billing);
      window.location.assign(`${checkoutHref}&orcamento=${encodeURIComponent(quote.public_token)}${quote.requires_contact ? "&atendimento=1" : ""}`);
    } catch {
      setQuoteError(t("plans.quoteError"));
    } finally {
      quoteTask.current=false;
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

      {catalogStatus==='loading'&&<div className="marketing-loading" role="status">{t('segments.loading')}</div>}
      {catalogStatus==='error'&&<div className="marketing-empty" role="alert"><p>{t('plans.catalogError')}</p><button className="marketing-button secondary" type="button" onClick={()=>{setCatalogStatus('loading');setStep(1);setCatalogRetry(value=>value+1);}}>{t('segments.retry')}</button></div>}
      {catalogStatus==='ready'&&!segments.length&&<div className="marketing-empty"><p>{t('plans.noSegments')}</p><Link href="/contato" className="marketing-button secondary">{t('segments.talk')}</Link></div>}
      {catalogStatus==='ready'&&segments.length>0&&(step === 1 ? <>
        <header className="plan-builder-heading">
          <div><span>{t("public.aTailoredPlan")}</span><h2>{t("public.chooseYourOperationSSegments")}</h2><p>{t("public.youCanCombineAsManyModulesAsYouWantIn")}</p></div>
          <div><ShoppingCart/><strong>{chosen.length}</strong><span>{chosen.length === 1 ? t("public.selectedSegment") : t("public.selectedSegments")}</span></div>
        </header>

        <div className="segment-grid">
          {segments.map((segment) => {
            const isSelected = selected[segment.id] !== undefined;
            return <article className={`segment-card ${segment.accent} ${isSelected ? "selected" : ""}`} key={segment.id}>
              <button className="segment-toggle" onClick={() => toggleSegment(segment.id)} aria-label={`${isSelected ? t("plans.remove") : t("plans.addSegment")} ${segment.title} ${segment.subtitle}`} aria-pressed={isSelected}>
                {isSelected && <Check/>}
              </button>
              <div className="segment-image"><Image src={segment.image} alt="" fill sizes="(max-width: 850px) 100vw, 33vw"/></div>
              <div className="segment-content">
                <div className="segment-title"><span><segment.Icon/></span><div><h3>{segment.title}</h3><strong>{segment.subtitle}</strong></div></div>
                <p>{segment.description}</p>
                <div className="segment-tiers">
                  {segment.tiers.map((tier) => <label className={selected[segment.id] === tier.id ? "active" : ""} key={tier.id}>
                    <input type="radio" name={segment.id} checked={selected[segment.id] === tier.id} onChange={() => selectTier(segment.id, tier.id)}/>
                    <span>{tier.label}</span>
                    <strong>{tier.price === null ? t("plans.quote") : <>{formatMoney(tier.price)}<small>{t("plans.perMonth")}</small></>}</strong>
                  </label>)}
                </div>
                {segment.annualDiscountPercent>0&&<div className="segment-discount"><BadgePercent/><span><strong>{segment.annualDiscountPercent}{t("public.discountOnTheAnnualPlan")}</strong><small>{t("public.savingsAppliedAtEveryTier")}</small></span></div>}
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
              <button onClick={() => toggleSegment(segment.id)} aria-label={`${t("plans.remove")} ${segment.title}`}><Trash2/></button>
            </div>) : <p className="empty-selection">{t("public.selectAtLeastOneSegmentToBuildYourPlan")}</p>}
            <div className="selection-total"><span>{billing === "yearly" ? t("plans.monthlyEquivalent") : t("plans.monthlyTotal")}</span><strong>{hasCustomPrice ? t("plans.quote") : <>{formatMoney(total)}<small>{t("plans.perMonth")}</small></>}</strong></div>
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
            <section className="review-card"><h3>{t("plans.subscriptionType")}</h3><BillingChoice billing={billing} setBilling={setBilling} expanded/>{billing === "yearly" && chosen.some(item=>item.segment.annualDiscountPercent>0) && <div className="annual-callout"><BadgePercent/><span><strong>{t("plans.annualDiscount")}</strong><small>{t("plans.annualDiscountDescription")}</small></span></div>}</section>
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
          <div className="quote-action">{quoteError && <small role="alert">{quoteError}</small>}<button className="plan-primary-button" onClick={continueToCheckout} disabled={quoteLoading||!chosen.length||catalogStatus!=="ready"}>{quoteLoading ? t("public.preparingQuote") : hasCustomPrice ? t("public.talkToASpecialist") : t("public.continueToSubscription")}{!quoteLoading && <ArrowRight/>}</button></div>
        </div>
      </>)}

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
