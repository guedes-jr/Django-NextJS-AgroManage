"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check } from "lucide-react";

import { usePublicLocale } from "@/lib/publicLocale";
import { getPublicPlanCatalog, type PublicPlanSegment } from "@/services/publicPlanCatalog";

/** Landing "Assinatura": current price and limits (tier ranges) of each public segment, read from the catalog API. */
export function SubscriptionPricing() {
  const { t, language } = usePublicLocale();
  const [segments, setSegments] = useState<PublicPlanSegment[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getPublicPlanCatalog(controller.signal).then(setSegments).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);

  const money = (value: number) => value.toLocaleString(language, { style: "currency", currency: "BRL" });
  const discount = segments?.find(segment => segment.annualDiscountPercent > 0)?.annualDiscountPercent;

  return <section className="marketing-section subscription-pricing" id="assinatura" aria-labelledby="subscription-pricing-title">
    <div className="marketing-container">
      <div className="section-heading">
        <div className="eyebrow">{t("pricing.eyebrow")}</div>
        <h2 id="subscription-pricing-title">{t("pricing.title")}</h2>
        <p>{t("pricing.lead")}</p>
      </div>
      {!segments && !failed && <div className="marketing-loading" role="status">{t("segments.loading")}</div>}
      {(failed || segments?.length === 0) && <div className="marketing-empty"><p>{t("pricing.empty")}</p><Link href="/contato" className="marketing-button secondary">{t("segments.talk")}</Link></div>}
      {!!segments?.length && <>
        <div className="subscription-pricing-grid">
          {segments.map(segment => <article key={segment.id} className="subscription-pricing-card">
            <header><h3>{segment.name}</h3>{segment.subtitle && <p>{segment.subtitle}</p>}</header>
            {segment.metric && <small>{t("pricing.limits", { metric: segment.metric })}</small>}
            <ul aria-label={t("pricing.tiersLabel", { segment: segment.name })}>
              {segment.tiers.map(tier => <li key={tier.id}>
                <span>{tier.label}</span>
                <strong>{tier.price === null ? t("pricing.onRequest") : <>{money(tier.price)}<small>{t("plans.perMonth")}</small></>}</strong>
              </li>)}
            </ul>
            <Link className="marketing-button secondary small" href={`/assinatura?segmento=${encodeURIComponent(segment.id)}`}>{t("segments.plans")}</Link>
          </article>)}
        </div>
        <ul className="subscription-pricing-notes">
          <li><Check size={16} aria-hidden="true"/>{t("pricing.trial")}</li>
          {discount && <li><Check size={16} aria-hidden="true"/>{t("pricing.annual", { percent: discount.toLocaleString(language) })}</li>}
        </ul>
        <div className="subscription-pricing-actions">
          <Link href="/cadastro" className="marketing-button primary">{t("pricing.start")} <ArrowRight size={18}/></Link>
          <Link href="/assinatura" className="marketing-button secondary">{t("pricing.build")}</Link>
        </div>
      </>}
    </div>
  </section>;
}
