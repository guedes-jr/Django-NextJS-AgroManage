"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { MarketingFooter } from "./MarketingFooter";
import { MarketingHeader } from "./MarketingHeader";
import { usePublicLocale } from "@/lib/publicLocale";

export function SegmentLanding({eyebrow,title,description,benefits,features,trackingLabel}:{trackingLabel?:string;eyebrow:string;title:string;description:string;benefits:string[];features:Array<[string,string]>}){
  const { t } = usePublicLocale();
  return <><MarketingHeader/><main><section className="public-page-hero"><div className="marketing-container"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p><div className="hero-actions"><Link className="marketing-button primary" href={`/contato?utm_source=seo&utm_medium=segment&utm_campaign=${encodeURIComponent(trackingLabel ?? eyebrow)}`}>{t("farmCta")} <ArrowRight size={17}/></Link><Link className="marketing-button secondary" href="/demo">{t("demo")}</Link></div></div></section><section className="marketing-section"><div className="marketing-container plan-guide"><div><div className="eyebrow">{t("segment.expectedResults")}</div><h2>{t("segment.operationalControl")}</h2><p>{t("segment.expectedDescription")}</p></div><ul>{benefits.map(item=><li key={item}><CheckCircle2/> {item}</li>)}</ul></div></section><section className="marketing-section pricing-section"><div className="marketing-container"><div className="section-heading"><div className="eyebrow">{t("segment.resources")}</div><h2>{t("segment.connectedRoutine")}</h2></div><div className="feature-grid">{features.map(([name,text])=><article className="feature-card" key={name}><h3>{name}</h3><p>{text}</p></article>)}</div></div></section><section className="resource-cta"><div className="marketing-container"><h2>{t("segment.finalCta")}</h2><p>{t("segment.finalDescription")}</p><Link className="marketing-button primary" href="/contato">{t("requestDemo")} <ArrowRight size={17}/></Link></div></section></main><MarketingFooter/></>;
}
