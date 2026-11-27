"use client";

import "@/app/home/settings/settings.css";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Barcode, CreditCard, ExternalLink, LogOut, QrCode, RefreshCcw } from "lucide-react";

import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";
import { useOrganizationLocale } from "@/lib/locale";
import { apiClient } from "@/services/api";
import { ACCESS_CHANGED_EVENT } from "@/services/organizationAccess";

type Invoice = { id: string; number: string; status: string; due_date: string; balance: string; overdue: boolean };
type Method = "boleto" | "pix" | "credit_card";
type Options = {
  method: Method; amount: string; payment_url?: string; bank_slip_url?: string; digitable_line?: string; due_date?: string;
  pix_copy_paste?: string; pix_qr_image?: string; expires_at?: string;
};

/** Only links on https leave the app (gateway pages). */
const safeUrl = (value?: string) => { try { const url = new URL(value || ""); return url.protocol === "https:" ? url.href : null; } catch { return null; } };

/** Payment page shown instead of the whole workspace while the subscription is suspended. */
export function SuspendedPayment() {
  const access = useOrganizationAccess();
  const { t, language } = useOrganizationLocale();
  const canPay = access?.role === "admin" || access?.role === "manager";
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<{ invoice: string; method: Method } | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [optionState, setOptionState] = useState<"idle" | "loading" | "error">("idle");
  const [optionError, setOptionError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!canPay) return;
    let active = true;
    apiClient.get<{ results: Invoice[] }>("/organizations/me/invoices/")
      .then(({ data }) => { if (active) { setInvoices(data.results.filter(row => Number(row.balance) > 0 && (row.status === "open" || row.status === "overdue"))); setLoadError(false); } })
      .catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [canPay, attempt]);

  const money = (value: string) => Number(value).toLocaleString(language, { style: "currency", currency: "BRL" });
  const date = (value: string) => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString(language) : "";

  const choose = async (invoice: string, method: Method) => {
    setSelected({ invoice, method }); setOptions(null); setOptionState("loading"); setFeedback("");
    try {
      const { data } = await apiClient.get<Options>(`/organizations/me/invoices/${invoice}/payment/`, { params: { method } });
      setOptions(data); setOptionState("idle");
    } catch (error) {
      const data = (error as { response?: { data?: { detail?: string; error?: { detail?: { detail?: string } } } } })?.response?.data;
      const detail = data?.detail || data?.error?.detail?.detail;
      setOptionError(detail || t("payment.optionError")); setOptionState("error");
    }
  };
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setFeedback(t("payment.copied")); } catch { setFeedback(t("payment.copyFailed")); }
  };
  const check = () => {
    setChecking(true); setFeedback("");
    // The layout re-reads access; while still suspended this page stays.
    window.dispatchEvent(new Event(ACCESS_CHANGED_EVENT));
    window.setTimeout(() => { setChecking(false); setFeedback(t("payment.stillSuspended")); }, 2500);
  };

  const methods: { code: Method; label: string; Icon: typeof Barcode }[] = [
    { code: "pix", label: t("payment.pix"), Icon: QrCode },
    { code: "boleto", label: t("payment.boleto"), Icon: Barcode },
    { code: "credit_card", label: t("payment.card"), Icon: CreditCard },
  ];

  return <div className="settings-page" style={{ maxWidth: 760, margin: "0 auto" }}>
    <section className="settings-section" aria-labelledby="suspended-title">
      <header className="settings-section-header"><div><h1 id="suspended-title" className="h4 fw-bold mb-1">{t("payment.title")}</h1>
        <p className="settings-note mb-0">{canPay ? t("payment.lead") : t("payment.memberLead")}</p></div></header>

      {canPay && <>
        {loadError && <div className="alert alert-danger py-2 small d-flex flex-wrap align-items-center gap-2" role="alert">{t("payment.error")}<button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setAttempt(value => value + 1)}>{t("payment.retry")}</button></div>}
        {!invoices && !loadError && <p className="settings-note" role="status">{t("payment.loadingOption")}</p>}
        {invoices && !invoices.length && <div className="alert alert-info py-2 small">{t("payment.noInvoices")}</div>}
        {invoices?.map(invoice => <article key={invoice.id} className="border rounded-3 p-3 mb-3">
          <div className="d-flex flex-wrap justify-content-between align-items-baseline gap-2 mb-2">
            <div><small className="text-muted d-block">{t("payment.due", { date: date(invoice.due_date) })}</small><strong>{t("payment.invoice", { number: invoice.number })}</strong></div>
            <strong className="fs-4 tabular-nums">{money(invoice.balance)}</strong>
          </div>
          <p className="small fw-semibold mb-2">{t("payment.choose")}</p>
          <div className="d-flex flex-wrap gap-2" role="group" aria-label={t("payment.choose")}>
            {methods.map(({ code, label, Icon }) => {
              const active = selected?.invoice === invoice.id && selected.method === code;
              return <button key={code} type="button" aria-pressed={active} className={`btn ${active ? "btn-primary" : "btn-outline-secondary"} d-inline-flex align-items-center gap-2`} style={{ minHeight: 44 }} disabled={optionState === "loading"} onClick={() => void choose(invoice.id, code)}><Icon size={18} aria-hidden="true"/>{label}</button>;
            })}
          </div>

          {selected?.invoice === invoice.id && <div className="mt-3" aria-live="polite">
            {optionState === "loading" && <p className="settings-note mb-0" role="status">{t("payment.loadingOption")}</p>}
            {optionState === "error" && <div className="alert alert-danger py-2 small mb-0" role="alert">{optionError}</div>}
            {options?.method === "boleto" && <div>
              {options.due_date && <p className="small mb-2">{t("payment.boletoDue", { date: date(options.due_date) })}</p>}
              {options.digitable_line && <><label className="form-label small fw-semibold" htmlFor={`line-${invoice.id}`}>{t("payment.line")}</label>
                <div className="input-group mb-2"><input id={`line-${invoice.id}`} className="form-control tabular-nums" readOnly value={options.digitable_line} onFocus={event => event.currentTarget.select()}/><button type="button" className="btn btn-outline-secondary" onClick={() => void copy(options.digitable_line!)}>{t("payment.copy")}</button></div></>}
              {safeUrl(options.bank_slip_url) && <a className="btn btn-primary d-inline-flex align-items-center gap-2" href={safeUrl(options.bank_slip_url)!} target="_blank" rel="noopener noreferrer">{t("payment.openBoleto")}<ExternalLink size={15} aria-hidden="true"/></a>}
            </div>}
            {options?.method === "pix" && <div className="d-flex flex-wrap gap-3 align-items-start">
              {/* eslint-disable-next-line @next/next/no-img-element -- base64 QR code returned by the gateway */}
              {options.pix_qr_image && <img src={`data:image/png;base64,${options.pix_qr_image}`} alt={t("payment.pix")} width={200} height={200} className="border rounded"/>}
              <div className="flex-grow-1" style={{ minWidth: 220 }}>
                <p className="small mb-2">{t("payment.pixHelp")}</p>
                {options.pix_copy_paste && <><label className="form-label small fw-semibold" htmlFor={`pix-${invoice.id}`}>{t("payment.pixCode")}</label>
                  <textarea id={`pix-${invoice.id}`} className="form-control small mb-2" rows={3} readOnly value={options.pix_copy_paste} onFocus={event => event.currentTarget.select()}/>
                  <button type="button" className="btn btn-primary" onClick={() => void copy(options.pix_copy_paste!)}>{t("payment.copy")}</button></>}
                {options.expires_at && <small className="text-muted d-block mt-2">{t("payment.pixExpires", { date: date(options.expires_at) })}</small>}
              </div>
            </div>}
            {options?.method === "credit_card" && <div>
              <p className="small mb-2">{t("payment.cardHelp")}</p>
              {safeUrl(options.payment_url) && <a className="btn btn-primary d-inline-flex align-items-center gap-2" href={safeUrl(options.payment_url)!} target="_blank" rel="noopener noreferrer">{t("payment.payCard")}<ExternalLink size={15} aria-hidden="true"/></a>}
            </div>}
          </div>}
        </article>)}
        {feedback && <p className="small" role="status">{feedback}</p>}
        <div className="d-flex flex-wrap gap-2 mt-2">
          <button type="button" className="btn btn-outline-secondary d-inline-flex align-items-center gap-2" onClick={check} disabled={checking}><RefreshCcw size={15} aria-hidden="true"/>{checking ? t("payment.checking") : t("payment.check")}</button>
          <Link className="btn btn-link d-inline-flex align-items-center gap-2" href="/logout"><LogOut size={15} aria-hidden="true"/>{t("payment.logout")}</Link>
        </div>
      </>}
      {!canPay && <Link className="btn btn-outline-secondary d-inline-flex align-items-center gap-2" href="/logout"><LogOut size={15} aria-hidden="true"/>{t("payment.logout")}</Link>}
      <p className="settings-note small mt-3 mb-0">{t("payment.support")}</p>
    </section>
  </div>;
}
