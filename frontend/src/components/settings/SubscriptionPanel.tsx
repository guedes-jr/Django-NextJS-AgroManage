"use client";

import "@/app/home/settings/settings.css";
import { FormEvent, useState } from "react";
import { Tag } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { type TranslationKey, useOrganizationLocale } from "@/lib/locale";
import { apiClient } from "@/services/api";
import { memberError } from "@/services/memberService";
import { PlanInvoices } from "@/components/settings/PlanInvoices";

export type PriceDiscount = { id: string; description: string; kind: string; source: string; amount: string };
export type PriceBreakdown = {
  currency: string; billing_cycle: string; gross: string; subtotal: string; discount_total: string; total: string;
  lines: { segment_code: string; name: string; tier_label: string; base: string; on_request: boolean; total: string; discounts: PriceDiscount[] }[];
  subscription_discounts: PriceDiscount[];
};
type Usage = { label: string; used: string; limit: string; percent: number | null }[];

export function SubscriptionPanel({ price, statusLabel, billingCycle, canManage, usage, onChangeSegments, changing, onPriceChange }: {
  price: PriceBreakdown | null | undefined;
  statusLabel: string;
  billingCycle: string | undefined;
  canManage: boolean;
  usage: Usage;
  onChangeSegments: () => void;
  changing: boolean;
  onPriceChange: (price: PriceBreakdown) => void;
}) {
  const { t, language } = useOrganizationLocale();
  const { showToast } = useToast();
  const [code, setCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [couponError, setCouponError] = useState("");
  const money = (value: string | number) => Number(value).toLocaleString(language, { style: "currency", currency: price?.currency || "BRL" });
  const discounts = price ? [...price.lines.flatMap(line => line.discounts.map(row => ({ ...row, scope: line.name }))), ...price.subscription_discounts.map(row => ({ ...row, scope: t("subscription.total") }))] : [];

  const applyCoupon = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return;
    setApplying(true); setCouponError("");
    try {
      const { data } = await apiClient.post<PriceBreakdown>("/organizations/me/subscription/coupon/", { code: code.trim() });
      onPriceChange(data); setCode("");
      showToast(t("subscription.coupon.applied"), "success");
    } catch (error) {
      setCouponError(memberError(error, t("subscription.coupon.error")));
    } finally { setApplying(false); }
  };

  return <div className="d-flex flex-column gap-4">
    <section className="settings-section">
      <header className="settings-section-header">
        <div><h2>{t("subscription.breakdown")}</h2></div>
        <div className="settings-section-actions">{canManage && <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onChangeSegments} disabled={changing}>{changing ? t("settings.subscription.loading") : t("subscription.change")}</button>}</div>
      </header>
      <div className="subscription-summary">
        <div><span>{t("subscription.monthly")}</span><strong className="tabular-nums">{price ? money(price.total) : "—"}</strong>
          {billingCycle === "yearly" && price && <small>{t("subscription.yearlyNote", { total: money(Number(price.total) * 12) })}</small>}</div>
        <div><span>{t("subscription.status")}</span><strong>{statusLabel}</strong></div>
        {price && Number(price.discount_total) > 0 && <div><span>{t("subscription.discounts")}</span><strong className="tabular-nums text-success-emphasis">− {money(price.discount_total)}</strong></div>}
      </div>
      {price && <div className="table-responsive mt-3">
        <table className="table settings-table mb-0">
          <caption className="visually-hidden">{t("subscription.breakdown")}</caption>
          <thead><tr><th scope="col">{t("subscription.segment")}</th><th scope="col">{t("subscription.tier")}</th><th scope="col" className="text-end">{t("subscription.listPrice")}</th><th scope="col" className="text-end">{t("subscription.final")}</th></tr></thead>
          <tbody>{price.lines.map(line => <tr key={line.segment_code || line.name}>
            <td><strong>{line.segment_code ? t(`segment.${line.segment_code}` as TranslationKey) : line.name}</strong></td>
            <td className="text-muted-foreground">{line.tier_label}</td>
            <td className="text-end tabular-nums">{line.on_request ? t("subscription.quote") : money(line.base)}</td>
            <td className="text-end tabular-nums">{money(line.total)}</td>
          </tr>)}</tbody>
          <tfoot>
            <tr><th scope="row" colSpan={3}>{t("subscription.gross")}</th><td className="text-end tabular-nums">{money(price.gross)}</td></tr>
            {Number(price.discount_total) > 0 && <tr><th scope="row" colSpan={3}>{t("subscription.discounts")}</th><td className="text-end tabular-nums">− {money(price.discount_total)}</td></tr>}
            <tr className="is-total"><th scope="row" colSpan={3}>{t("subscription.total")}</th><td className="text-end tabular-nums">{money(price.total)}</td></tr>
          </tfoot>
        </table>
      </div>}
    </section>

    <section className="settings-section">
      <header className="settings-section-header"><div><h2>{t("subscription.discounts")}</h2></div></header>
      {discounts.length ? <ul className="discount-list">{discounts.map(row => <li key={`${row.id}-${row.scope}`}><Tag size={15} aria-hidden="true"/><span><strong>{row.description}</strong><small>{row.scope}</small></span><span className="tabular-nums">− {money(row.amount)}</span></li>)}</ul>
        : <p className="settings-note mb-0">{t("subscription.noDiscounts")}</p>}
      <form className="coupon-form" onSubmit={applyCoupon}>
        <label htmlFor="coupon-code" className="form-label">{t("subscription.coupon.title")}</label>
        <div className="d-flex gap-2 flex-wrap">
          <input id="coupon-code" className={`form-control text-uppercase ${couponError ? "is-invalid" : ""}`} maxLength={40} placeholder={t("subscription.coupon.placeholder")} value={code} disabled={!canManage || applying} onChange={event => setCode(event.target.value)} aria-describedby="coupon-feedback"/>
          <button className="btn btn-primary" disabled={!canManage || applying || !code.trim()}>{t("subscription.coupon.apply")}</button>
        </div>
        <div id="coupon-feedback" className={couponError ? "invalid-feedback d-block" : "form-text"}>{couponError || (!canManage ? t("subscription.coupon.adminOnly") : "")}</div>
      </form>
    </section>

    <PlanInvoices/>
    <section className="settings-section">
      <header className="settings-section-header"><div><h2>{t("subscription.limits")}</h2></div></header>
      <div className="usage-grid">{usage.map(row => <div key={row.label}>
        <span>{row.label}</span><strong className="tabular-nums">{row.used} / {row.limit}</strong>
        {row.percent !== null && <div className="progress" role="progressbar" aria-label={row.label} aria-valuenow={Math.round(row.percent)} aria-valuemin={0} aria-valuemax={100}><div className="progress-bar" style={{ width: `${Math.min(row.percent, 100)}%` }}/></div>}
      </div>)}</div>
    </section>
  </div>;
}
