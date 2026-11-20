"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, CircleCheck, ClipboardCheck, Hourglass } from "lucide-react";
import { veterinaryService, vetError, type VetBilling as Billing, type VetSettings } from "@/services/veterinaryService";
import styles from "./veterinary.module.css";
import { VetKpis, type VetContext } from "./VeterinaryArea";
import { PRICE_KINDS, kindLabel, parseDay, resultLabel, type Fmt, type Translate } from "./vetText";

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Text the vet copies to the client (prototype vResumo). */
function billingText(t: Translate, fmt: Fmt, monthLabel: string, client: { name: string; farm_name: string }, detail: NonNullable<Billing["detail"]>) {
  const lines = [t("vet.billing.textHeader", { month: monthLabel, client: `${client.name}${client.farm_name ? ` (${client.farm_name})` : ""}` })];
  PRICE_KINDS.forEach(([kind]) => {
    const items = detail.filter(p => p.kind === kind);
    if (!items.length) return;
    const value = items.reduce((s, p) => s + Number(p.value), 0);
    let line = t("vet.billing.textLine", { kind: kindLabel(t, kind), count: items.length, value: fmt.money(value) });
    if (kind === "ultrasound" || kind === "palpation") {
      const pregnant = items.filter(p => p.result === "pregnant").length;
      line += t("vet.billing.textDiagnosis", { pregnant, open: items.length - pregnant });
    }
    lines.push(line);
  });
  const total = detail.reduce((s, p) => s + Number(p.value), 0);
  const paid = detail.filter(p => p.paid).reduce((s, p) => s + Number(p.value), 0);
  lines.push(t("vet.billing.textTotal", { value: fmt.money(total) }), t("vet.billing.textPaid", { value: fmt.money(paid) }), t("vet.billing.textDue", { value: fmt.money(total - paid) }));
  return lines.join("\n");
}

export function VetBilling({ ctx }: { ctx: VetContext }) {
  const { t, fmt, language, clients, today } = ctx;
  const [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState<Billing | null>(null);
  const [error, setError] = useState("");
  const [prices, setPrices] = useState<VetSettings>(ctx.workspace.settings);
  const client = ctx.focusClient;

  const load = useCallback((signal?: AbortSignal) => veterinaryService.billing(month, client || undefined, signal)
    .then(result => { setData(result); setError(""); })
    .catch(err => { if (!signal?.aborted) setError(vetError(err, t("vet.error"))); }), [month, client, t]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (!clients.length) {
    return (
      <div className={styles.panel}>
        <p className={styles.muted}>{t("vet.billing.empty")}</p>
        <button type="button" className="btn btn-agro mt-2" onClick={() => ctx.go("cl")}>{t("vet.clients.create")}</button>
      </div>
    );
  }

  const monthLabel = parseDay(`${month}-15`).toLocaleDateString(language, { month: "long", year: "numeric", timeZone: "UTC" });
  const selected = clients.find(c => c.id === client);
  const update = async (id: string, change: { value?: string; paid?: boolean }) => {
    try {
      await veterinaryService.updateProcedure(id, change);
      await Promise.all([load(), ctx.reload()]);
    } catch (err) {
      setError(vetError(err, t("vet.saveError")));
    }
  };
  const payAll = async () => {
    if (!client) return;
    await veterinaryService.payAll(client, month);
    ctx.notify(t("vet.billing.allPaid"));
    await Promise.all([load(), ctx.reload()]);
  };
  const savePrice = async (field: keyof VetSettings, value: string) => {
    const amount = String(Number(String(value).replace(",", ".")) || 0);
    setPrices(p => ({ ...p, [field]: amount }));
    try {
      await veterinaryService.updateSettings({ [field]: amount });
      await ctx.reload();
    } catch (err) {
      setError(vetError(err, t("vet.saveError")));
    }
  };

  return (
    <>
      <VetKpis items={[
        { label: t("vet.clients.receivable"), value: fmt.money(data?.receivable), icon: Hourglass, tone: "warning" },
        { label: t("vet.billing.received"), value: fmt.money(data?.received), icon: CircleCheck },
        { label: t("vet.clients.visits"), value: data?.count ?? "—", icon: ClipboardCheck, tone: "info" },
      ]} />
      {error && <div role="alert" className="alert alert-danger py-2">{error}</div>}

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>{t("vet.billing.of", { month: monthLabel })}</h2>
          <div className={styles.actions}>
            <button type="button" className="btn btn-sm btn-outline-secondary" aria-label={t("vet.billing.previous")} onClick={() => setMonth(m => shiftMonth(m, -1))}><ChevronLeft size={16} /></button>
            <button type="button" className="btn btn-sm btn-outline-secondary" aria-label={t("vet.billing.next")} onClick={() => setMonth(m => shiftMonth(m, 1))}><ChevronRight size={16} /></button>
          </div>
        </div>
        <div className={styles.grid} style={{ marginBottom: 12 }}>
          <div><span className={styles.kpiValue}>{data?.count ?? "—"}</span><span className={styles.kpiLabel}>{t("vet.clients.visits")}</span></div>
          <div><span className={styles.kpiValue}>{fmt.money(data?.total)}</span><span className={styles.kpiLabel}>{t("vet.billing.billed")}</span></div>
          <div><span className={`${styles.kpiValue} ${styles.ok}`}>{fmt.money(data?.received)}</span><span className={styles.kpiLabel}>{t("vet.billing.alreadyReceived")}</span></div>
          <div><span className={`${styles.kpiValue} ${styles.warn}`}>{fmt.money(data?.receivable)}</span><span className={styles.kpiLabel}>{t("vet.clients.receivable")}</span></div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table} style={{ minWidth: 560 }}>
            <thead><tr><th>{t("vet.clients.client")}</th><th>{t("vet.clients.visits")}</th><th>{t("vet.billing.total")}</th><th>{t("vet.clients.receivable")}</th><th /></tr></thead>
            <tbody>
              {(data?.clients || []).map(c => (
                <tr key={c.id}>
                  <td><b>{c.name}</b></td><td>{c.count}</td><td>{fmt.money(c.total)}</td><td>{fmt.money(c.receivable)}</td>
                  <td><button type="button" className={`btn btn-sm ${client === c.id ? "btn-agro" : "btn-outline-secondary"}`} onClick={() => ctx.setFocusClient(c.id)}>{t("vet.billing.seeDetail")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected && data?.detail && (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>{t("vet.billing.detail", { name: selected.name })}</h2>
            {data.detail.some(p => !p.paid) && <button type="button" className="btn btn-sm btn-agro" onClick={() => void payAll()}><Check size={14} aria-hidden="true" /> {t("vet.billing.payAll")}</button>}
          </div>
          {data.detail.length ? (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table} style={{ minWidth: 560 }}>
                  <thead><tr><th>{t("vet.billing.date")}</th><th>{t("vet.report.colAnimal")}</th><th>{t("vet.launch.procedure")}</th><th>{t("vet.billing.result")}</th><th>{t("vet.billing.value")}</th><th /></tr></thead>
                  <tbody>
                    {data.detail.map(p => (
                      <tr key={p.id}>
                        <td>{fmt.fd5(p.date)}</td>
                        <td>{p.identifier}</td>
                        <td>{kindLabel(t, p.kind)}</td>
                        <td>{(p.result ? resultLabel(t, p.result) : p.semen) || "—"}{p.responsible && <div className={styles.muted}>{t("vet.billing.by", { name: p.responsible })}</div>}</td>
                        <td><input className={`form-control form-control-sm ${styles.moneyInput}`} inputMode="decimal" defaultValue={p.value} aria-label={t("vet.billing.value")} onBlur={e => { if (e.target.value !== p.value) void update(p.id, { value: String(Number(e.target.value.replace(",", ".")) || 0) }); }} /></td>
                        <td>
                          <button type="button" className={`btn btn-sm ${p.paid ? "btn-success" : "btn-outline-secondary"}`} onClick={() => void update(p.id, { paid: !p.paid })}>
                            {p.paid ? t("vet.billing.paid") : t("vet.billing.markPaid")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className={styles.field} style={{ marginTop: 12 }}>
                <span>{t("vet.billing.summary")}</span>
                <textarea className={`form-control ${styles.textarea}`} readOnly value={billingText(t, fmt, monthLabel, selected, data.detail)} onFocus={e => e.target.select()} />
              </label>
            </>
          ) : <p className={styles.muted}>{t("vet.billing.noVisits")}</p>}
        </section>
      )}

      <section className={styles.panel}>
        <div className={styles.panelHead}><h2>{t("vet.billing.prices")}</h2></div>
        <div className={styles.grid}>
          {PRICE_KINDS.map(([kind, field]) => (
            <label key={kind} className={styles.field}>
              <span>{t("vet.billing.priceLabel", { kind: kindLabel(t, kind) })}</span>
              <input className="form-control" inputMode="decimal" defaultValue={prices[field as keyof VetSettings]} onBlur={e => void savePrice(field as keyof VetSettings, e.target.value)} />
            </label>
          ))}
        </div>
        <p className={styles.muted} style={{ marginTop: 8 }}>{t("vet.billing.pricesHint")}</p>
      </section>

      {!!data?.responsibles.length && (
        <section className={styles.panel}>
          <div className={styles.panelHead}><h2>{t("vet.billing.byResponsible")}</h2></div>
          <div className={styles.tableWrap}>
            <table className={styles.table} style={{ minWidth: 360 }}>
              <thead><tr><th>{t("vet.report.responsible")}</th><th>{t("vet.clients.visits")}</th><th>{t("vet.billing.value")}</th></tr></thead>
              <tbody>{data.responsibles.map(r => <tr key={r.name || "-"}><td><b>{r.name || t("vet.billing.noResponsible")}</b></td><td>{r.count}</td><td>{fmt.money(r.value)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
