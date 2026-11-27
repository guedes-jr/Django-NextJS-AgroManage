"use client";

import "./onboarding.css";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Barcode, CreditCard, LogOut, QrCode } from "lucide-react";

import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";
import { useOrganizationLocale } from "@/lib/locale";
import apiClient from "@/services/api";
import { ACCESS_CHANGED_EVENT } from "@/services/organizationAccess";
import { apiMessage, savePaymentMethod, subscribe, type PaymentMethod, type PriceBreakdown } from "@/services/onboarding";

type Subscription = { billing_cycle: string; trial_ends_at: string | null; preferred_payment_method: PaymentMethod | ""; price: PriceBreakdown; billing_total: string };

/** End of the free trial (blocking) or, during the trial, the payment method and an early subscription. */
export function SubscribeTrial() {
  const router = useRouter();
  const access = useOrganizationAccess();
  const { t, language } = useOrganizationLocale();
  const expired = access?.access_stage === "trial_expired";
  const isAdmin = access?.role === "admin";
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [busy, setBusy] = useState<"" | "save" | "subscribe">("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    apiClient.get<{ subscription: Subscription | null }>("/organizations/me/").then(({ data }) => {
      if (!active) return;
      setSubscription(data.subscription); setMethod(data.subscription?.preferred_payment_method || ""); setLoadError(false);
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [isAdmin, attempt]);

  const money = (value: string) => Number(value).toLocaleString(language, { style: "currency", currency: "BRL" });
  const methods: { code: PaymentMethod; label: string; Icon: typeof Barcode }[] = [
    { code: "pix", label: t("payment.pix"), Icon: QrCode },
    { code: "boleto", label: t("payment.boleto"), Icon: Barcode },
    { code: "credit_card", label: t("payment.card"), Icon: CreditCard },
  ];

  const save = async () => {
    if (!method) { setMessage({ tone: "error", text: t("subscribe.chooseMethod") }); return; }
    setBusy("save"); setMessage(null);
    try { await savePaymentMethod(method); setMessage({ tone: "ok", text: t("subscribe.methodSaved") }); }
    catch (error) { setMessage({ tone: "error", text: apiMessage(error) || t("subscribe.error") }); }
    finally { setBusy(""); }
  };
  const confirm = async () => {
    if (!method) { setMessage({ tone: "error", text: t("subscribe.chooseMethod") }); return; }
    setBusy("subscribe"); setMessage(null);
    try {
      const { invoice } = await subscribe(method);
      window.dispatchEvent(new Event(ACCESS_CHANGED_EVENT));
      // The invoice (with its payment link) is listed in Configurações › Assinatura.
      router.replace(invoice ? "/home/settings?tab=subscription" : "/home");
    } catch (error) {
      setMessage({ tone: "error", text: apiMessage(error) || t("subscribe.error") }); setBusy("");
    }
  };

  const trialEnd = subscription?.trial_ends_at || access?.trial_ends_at;
  return <div className="onboarding-page" style={{ maxWidth: 720 }}>
    <header className="onboarding-header">
      <h1 className="onboarding-title">{expired ? t("subscribe.title") : t("subscribe.trialTitle")}</h1>
      <p className="onboarding-lead">{!isAdmin ? t("subscribe.memberLead") : expired ? t("subscribe.lead") : t("subscribe.trialLead", { date: trialEnd ? new Date(trialEnd).toLocaleDateString(language) : "" })}</p>
    </header>

    {!isAdmin && <div><Link className="btn btn-outline-secondary d-inline-flex align-items-center gap-2" href="/logout"><LogOut size={15} aria-hidden="true"/>{t("onboarding.logout")}</Link></div>}

    {isAdmin && loadError && <div className="alert alert-danger d-flex flex-wrap align-items-center gap-2" role="alert">{t("subscribe.error")}
      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setAttempt(value => value + 1)}>{t("onboarding.retry")}</button></div>}
    {isAdmin && !subscription && !loadError && <p className="settings-note" role="status">{t("onboarding.calculating")}</p>}

    {isAdmin && subscription && <section className="onboarding-card">
      <h2>{t("subscribe.summary")}</h2>
      <ul className="onboarding-lines">{subscription.price.lines.map(line => <li key={line.segment_code || line.name}>
        <span><strong>{line.name}</strong><small>{line.tier_label}</small></span>
        <span className="tabular-nums">{line.on_request ? t("onboarding.onRequest") : `${money(line.total)}${t("onboarding.perMonth")}`}</span>
      </li>)}</ul>
      {Number(subscription.price.discount_total) > 0 && <div className="onboarding-row"><span>{t("onboarding.discounts")}</span><span className="tabular-nums">− {money(subscription.price.discount_total)}</span></div>}
      <div className="onboarding-row onboarding-total"><span>{t("onboarding.monthlyTotal")}</span><strong className="tabular-nums">{money(subscription.price.total)}</strong></div>
      {subscription.billing_cycle === "yearly" && <div className="onboarding-row"><span>{t("onboarding.cycleTotal")}</span><strong className="tabular-nums">{money(subscription.billing_total)}</strong></div>}
      <p className="settings-note">{t("subscribe.changeSegments")}</p>

      <fieldset className="onboarding-field">
        <legend className="form-label small fw-semibold mb-1">{t("subscribe.method")}</legend>
        <div className="onboarding-methods" role="group">
          {methods.map(({ code, label, Icon }) => <button key={code} type="button" aria-pressed={method === code} className={`btn ${method === code ? "btn-primary" : "btn-outline-secondary"}`}
            onClick={() => { setMethod(code); setMessage(null); }}><Icon size={16} aria-hidden="true"/>{label}</button>)}
        </div>
        <p className="settings-note mt-1">{t("subscribe.methodHint")}</p>
      </fieldset>

      {message && <div className={`alert ${message.tone === "ok" ? "alert-success" : "alert-danger"} py-2 small mb-0`} role={message.tone === "ok" ? "status" : "alert"}>{message.text}</div>}
      <div className="onboarding-actions">
        {expired
          ? <Link className="btn btn-outline-secondary d-inline-flex align-items-center gap-2" href="/logout"><LogOut size={15} aria-hidden="true"/>{t("subscribe.decline")}</Link>
          : <button type="button" className="btn btn-outline-secondary" onClick={() => void save()} disabled={!!busy}>{busy === "save" ? t("subscribe.confirming") : t("subscribe.saveMethod")}</button>}
        <button type="button" className="btn btn-primary" onClick={() => void confirm()} disabled={!!busy}>{busy === "subscribe" ? t("subscribe.confirming") : expired ? t("subscribe.confirm") : t("subscribe.confirmNow")}</button>
      </div>
    </section>}
  </div>;
}
