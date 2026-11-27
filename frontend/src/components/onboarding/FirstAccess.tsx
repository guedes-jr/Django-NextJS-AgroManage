"use client";

import "./onboarding.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, LogOut, Tag } from "lucide-react";

import { useOrganizationLocale } from "@/lib/locale";
import { ACCESS_CHANGED_EVENT } from "@/services/organizationAccess";
import { tierForQuantity, type PublicPlanSegment } from "@/services/publicPlanCatalog";
import {
  apiMessage, completeOnboarding, getOnboardingCatalog, isSized, previewOnboarding,
  type BillingCycle, type OnboardingState, type OnboardingSummary, type SegmentSelection,
} from "@/services/onboarding";

type Step = 1 | 2 | 3;

/** First access of a self-service signup: segments and size → price (with coupon) → terms. */
export function FirstAccess() {
  const router = useRouter();
  const { t, language } = useOrganizationLocale();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [segments, setSegments] = useState<PublicPlanSegment[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState<Step>(1);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState("");
  const [result, setResult] = useState<{ key: string; summary?: OnboardingSummary; error?: string } | null>(null);
  const [stepError, setStepError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    getOnboardingCatalog().then(({ state: value, segments: catalog }) => {
      if (!active) return;
      setState(value); setSegments(catalog); setLoadError(false);
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [attempt]);

  const money = useCallback((value: string | number) => Number(value).toLocaleString(language, { style: "currency", currency: "BRL" }), [language]);
  const date = (value: string) => new Date(value).toLocaleDateString(language);

  const selection = useMemo<SegmentSelection[] | null>(() => {
    if (!segments) return null;
    const rows = segments.filter(segment => segment.id in chosen).map(segment => ({
      segment_code: segment.id, quantity: isSized(segment) ? Number.parseInt(chosen[segment.id], 10) : null,
    }));
    if (!rows.length || rows.some(row => row.quantity !== null && !(row.quantity >= 1))) return null;
    return rows;
  }, [segments, chosen]);

  // Server price (the only price path): refreshed after each change, with a short debounce. The
  // response is keyed by its request, so a slower older answer never replaces a newer selection.
  const requestKey = selection && state?.can_complete ? JSON.stringify({ selection, cycle, coupon }) : "";
  useEffect(() => {
    if (!requestKey || !selection) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      previewOnboarding(selection, cycle, coupon, controller.signal)
        .then(value => setResult({ key: requestKey, summary: value }))
        .catch(error => { if (!controller.signal.aborted) setResult({ key: requestKey, error: apiMessage(error) || t("onboarding.previewError") }); });
    }, 350);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [requestKey, selection, cycle, coupon, t]);
  const current = result && result.key === requestKey ? result : null;
  const summary = requestKey ? (current?.summary ?? result?.summary ?? null) : null;
  const previewState: "idle" | "loading" | "error" = !requestKey ? "idle" : !current ? "loading" : current.error ? "error" : "idle";
  const previewError = current?.error ?? "";

  const goTo = (next: Step) => {
    setStepError("");
    if (next > 1 && !Object.keys(chosen).length) { setStepError(t("onboarding.noSegment")); return; }
    if (next > 1 && !selection) { setStepError(t("onboarding.missingQuantity")); return; }
    setStep(next);
    window.requestAnimationFrame(() => heading.current?.focus());
  };
  const toggle = (code: string) => setChosen(current => {
    const next = { ...current };
    if (code in next) delete next[code]; else next[code] = "";
    return next;
  });
  const confirm = async () => {
    if (!accepted) { setSubmitError(t("onboarding.mustAccept")); return; }
    if (!selection || !state || submitting) return;
    setSubmitting(true); setSubmitError("");
    try {
      await completeOnboarding(selection, cycle, coupon, state.terms_version);
      window.dispatchEvent(new Event(ACCESS_CHANGED_EVENT));
      router.replace("/home");
    } catch (error) {
      setSubmitError(apiMessage(error) || t("onboarding.completeError"));
      setSubmitting(false);
    }
  };

  if (loadError) return <div className="onboarding-page"><div className="alert alert-danger d-flex flex-wrap align-items-center gap-2" role="alert">{t("onboarding.loadError")}
    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => { setLoadError(false); setAttempt(value => value + 1); }}>{t("onboarding.retry")}</button></div></div>;
  if (!state || !segments) return <div className="onboarding-page"><p className="settings-note" role="status">{t("onboarding.calculating")}</p></div>;
  if (!state.can_complete) return <div className="onboarding-page">
    <section className="onboarding-card"><h1 className="onboarding-title">{t("onboarding.memberTitle")}</h1><p className="onboarding-lead">{t("onboarding.memberLead")}</p>
      <Link className="btn btn-outline-secondary d-inline-flex align-items-center gap-2" href="/logout"><LogOut size={15} aria-hidden="true"/>{t("onboarding.logout")}</Link></section>
  </div>;

  const steps: [Step, string][] = [[1, t("onboarding.step.segments")], [2, t("onboarding.step.summary")], [3, t("onboarding.step.terms")]];
  const price = summary?.price;
  const cycleLabel = cycle === "yearly" ? t("onboarding.yearly") : t("onboarding.monthly");

  const totals = <aside className="onboarding-summary" aria-live="polite" aria-busy={previewState === "loading"}>
    <h2>{t("onboarding.summaryTitle")}</h2>
    {!selection && <p className="settings-note">{Object.keys(chosen).length ? t("onboarding.missingQuantity") : t("onboarding.noSegment")}</p>}
    {selection && !price && previewState !== "error" && <p className="settings-note" role="status">{t("onboarding.calculating")}</p>}
    {previewError && <p className="text-danger small mb-0" role="alert">{previewError}</p>}
    {summary && price && <>
      <ul className="onboarding-lines">{price.lines.map(line => <li key={line.segment_code}>
        <span><strong>{line.name}</strong><small>{line.tier_label}</small></span>
        <span className="tabular-nums">{line.on_request ? t("onboarding.onRequest") : money(line.total)}</span>
      </li>)}</ul>
      {Number(price.discount_total) > 0 && <div className="onboarding-row"><span>{t("onboarding.discounts")}</span><span className="tabular-nums">− {money(price.discount_total)}</span></div>}
      <div className="onboarding-row onboarding-total"><span>{t("onboarding.monthlyTotal")}</span><strong className="tabular-nums">{money(price.total)}</strong></div>
      {summary.months === 12 && <div className="onboarding-row"><span>{t("onboarding.cycleTotal")}</span><strong className="tabular-nums">{money(summary.cycle_total)}</strong></div>}
      {summary.unpriced.length > 0 && <p className="settings-note">{t("onboarding.unpricedNote", { names: summary.unpriced.join(", ") })}</p>}
      <p className="onboarding-trial"><Check size={15} aria-hidden="true"/>{t("onboarding.trialNote", { date: date(summary.trial_ends_at) })}</p>
    </>}
  </aside>;

  return <div className="onboarding-page">
    <header className="onboarding-header">
      <span className="onboarding-eyebrow">{t("onboarding.eyebrow")}</span>
      <h1 className="onboarding-title" ref={heading} tabIndex={-1}>{t("onboarding.title")}</h1>
      <p className="onboarding-lead">{t("onboarding.lead", { days: state.trial_days })}</p>
      <ol className="onboarding-steps" aria-label={t("onboarding.stepsLabel")}>
        {steps.map(([number, label]) => <li key={number} className={step === number ? "active" : step > number ? "done" : ""} aria-current={step === number ? "step" : undefined}>
          <span>{step > number ? <Check size={13} aria-hidden="true"/> : number}</span>{label}
        </li>)}
      </ol>
    </header>

    <div className="onboarding-grid">
      <section className="onboarding-card">
        {step === 1 && <>
          <h2>{t("onboarding.segmentsTitle")}</h2>
          <p className="settings-note">{t("onboarding.segmentsHint")}</p>
          <div className="onboarding-segments">
            {segments.map(segment => {
              const selected = segment.id in chosen;
              const sized = isSized(segment);
              const amount = Number.parseInt(chosen[segment.id] ?? "", 10);
              const tier = sized && amount >= 1 ? tierForQuantity(segment.tiers, amount) : !sized ? segment.tiers[0] : null;
              return <article key={segment.id} className={`onboarding-segment${selected ? " selected" : ""}`}>
                <label className="onboarding-segment-head">
                  <input type="checkbox" className="form-check-input" checked={selected} onChange={() => toggle(segment.id)}/>
                  <span><strong>{segment.name}</strong><small>{segment.subtitle}</small></span>
                </label>
                {selected && <div className="onboarding-segment-body">
                  {sized && <><label className="form-label small fw-semibold" htmlFor={`qty-${segment.id}`}>{t("onboarding.quantity", { metric: segment.metric || t("onboarding.quantityUnits") })}</label>
                    <input id={`qty-${segment.id}`} className="form-control tabular-nums" type="number" inputMode="numeric" min={1} step={1} value={chosen[segment.id]}
                      onChange={event => setChosen(current => ({ ...current, [segment.id]: event.target.value.replace(/\D/g, "") }))}/></>}
                  {tier && <p className="onboarding-tier"><span>{t("onboarding.tierFor", { tier: tier.label })}</span>
                    <strong className="tabular-nums">{tier.price === null ? t("onboarding.onRequest") : `${money(tier.price)}${t("onboarding.perMonth")}`}</strong></p>}
                  {tier?.price === null && <p className="settings-note">{t("onboarding.onRequestHint")}</p>}
                </div>}
              </article>;
            })}
          </div>
        </>}

        {step === 2 && <>
          <h2>{t("onboarding.summaryTitle")}</h2>
          <fieldset className="onboarding-field">
            <legend className="form-label small fw-semibold">{t("onboarding.cycle")}</legend>
            <div className="btn-group" role="group">
              {(["monthly", "yearly"] as const).map(value => <button key={value} type="button" aria-pressed={cycle === value}
                className={`btn ${cycle === value ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setCycle(value)}>{value === "yearly" ? t("onboarding.yearly") : t("onboarding.monthly")}</button>)}
            </div>
            {cycle === "yearly" && <p className="settings-note mt-1">{t("onboarding.yearlyHint")}</p>}
          </fieldset>
          <div className="onboarding-field">
            <label className="form-label small fw-semibold" htmlFor="onboarding-coupon">{t("onboarding.coupon")}</label>
            <div className="input-group">
              <span className="input-group-text"><Tag size={15} aria-hidden="true"/></span>
              <input id="onboarding-coupon" className="form-control text-uppercase" value={couponInput} placeholder={t("onboarding.couponPlaceholder")} autoComplete="off"
                onChange={event => setCouponInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); setCoupon(couponInput.trim()); } }}/>
              {coupon && coupon === couponInput.trim()
                ? <button type="button" className="btn btn-outline-secondary" onClick={() => { setCoupon(""); setCouponInput(""); }}>{t("onboarding.removeCoupon")}</button>
                : <button type="button" className="btn btn-outline-secondary" disabled={!couponInput.trim()} onClick={() => setCoupon(couponInput.trim())}>{t("onboarding.applyCoupon")}</button>}
            </div>
            {coupon && current?.summary?.coupon_applied && <p className="onboarding-ok small mt-1" role="status">{t("onboarding.couponApplied")}</p>}
            {coupon && current?.summary?.coupon_error && <p className="text-danger small mt-1" role="alert">{current.summary.coupon_error}</p>}
          </div>
          {price && <ul className="onboarding-lines detailed">{price.lines.map(line => <li key={line.segment_code}>
            <span><strong>{line.name}</strong><small>{line.tier_label}{line.quantity ? ` · ${line.quantity}` : ""}</small>
              {line.on_request && <small>{t("onboarding.onRequestHint")}</small>}</span>
            <span className="tabular-nums">{line.on_request ? t("onboarding.onRequest") : `${money(line.total)}${t("onboarding.perMonth")}`}</span>
          </li>)}</ul>}
        </>}

        {step === 3 && <>
          <h2>{t("onboarding.termsTitle")}</h2>
          <ol className="onboarding-terms">
            <li>{t("onboarding.terms.trial", { days: state.trial_days })}</li>
            <li>{t("onboarding.terms.end")}</li>
            <li>{t("onboarding.terms.price", { cycle: cycleLabel })}</li>
            <li>{t("onboarding.terms.tier")}</li>
            <li>{t("onboarding.terms.change")}</li>
            <li>{t("onboarding.terms.policies")} <Link href="/termos" target="_blank">{t("onboarding.termsLink")}</Link> · <Link href="/privacidade" target="_blank">{t("onboarding.privacyLink")}</Link></li>
          </ol>
          <label className="onboarding-accept">
            <input type="checkbox" className="form-check-input" checked={accepted} onChange={event => { setAccepted(event.target.checked); setSubmitError(""); }}/>
            <span>{t("onboarding.accept")}</span>
          </label>
          {submitError && <div className="alert alert-danger py-2 small mb-0" role="alert">{submitError}</div>}
        </>}

        {stepError && <div className="alert alert-warning py-2 small mb-0" role="alert">{stepError}</div>}
        <div className="onboarding-actions">
          {step > 1 && <button type="button" className="btn btn-outline-secondary" onClick={() => goTo((step - 1) as Step)} disabled={submitting}>{t("onboarding.back")}</button>}
          {step < 3 && <button type="button" className="btn btn-primary" onClick={() => goTo((step + 1) as Step)}>{t("onboarding.next")}</button>}
          {step === 3 && <button type="button" className="btn btn-primary" onClick={() => void confirm()} disabled={submitting || previewState !== "idle" || !summary}>{submitting ? t("onboarding.confirming") : t("onboarding.confirm")}</button>}
        </div>
      </section>
      {totals}
    </div>
  </div>;
}
