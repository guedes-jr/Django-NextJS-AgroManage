"use client";

import { useEffect, useState } from "react";
import { Image as ImageIcon, Link2, MessageCircle, Tags } from "lucide-react";
import {
  veterinaryService, vetError, type VetClient, type VetClientPrice, type VetHerdPurpose, type VetProcedureKind, type VetReportRow,
} from "@/services/veterinaryService";
import styles from "./veterinary.module.css";
import type { VetContext } from "./VeterinaryArea";
import { sharePng, whatsappLink, type ExportDocument } from "./vetExport";
import { PRICE_KINDS, addDays, kindLabel, nextLabel, reportKindLabel, resultLabel } from "./vetText";

const PURPOSES: VetHerdPurpose[] = ["unknown", "beef", "dairy", "dual"];

/** Herd link (Integração com o rebanho) and client prices (Preço por cliente) of one client. */
export function ClientSettings({ ctx, client }: { ctx: VetContext; client: VetClient }) {
  const { t, workspace } = ctx;
  const herd = !!workspace.features.herd_integration;
  const pricing = !!workspace.features.client_pricing;
  const [farms, setFarms] = useState<Array<{ id: string; name: string }>>([]);
  const [prices, setPrices] = useState<VetClientPrice[]>([]);
  const [farm, setFarm] = useState(client.farm || "");
  const [purpose, setPurpose] = useState<VetHerdPurpose>(client.herd_purpose || "unknown");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    if (herd) veterinaryService.farms(controller.signal).then(setFarms).catch(() => undefined);
    if (pricing) veterinaryService.clientPrices(client.id, controller.signal).then(setPrices).catch(() => undefined);
    return () => controller.abort();
  }, [client.id, herd, pricing]);

  const saveLink = async () => {
    try {
      await veterinaryService.updateClient(client.id, { farm: farm || null, herd_purpose: purpose });
      setMessage(t("vet.clientCfg.saved"));
      await ctx.reload();
    } catch (err) {
      setMessage(vetError(err, t("vet.saveError")));
    }
  };

  const savePrice = async (kind: VetProcedureKind, value: string) => {
    const current = prices.find(p => p.kind === kind);
    const price = value.trim().replace(",", ".");
    try {
      if (!price) {
        if (current) await veterinaryService.deleteClientPrice(current.id);
      } else if (!current || Number(current.price) !== Number(price)) {
        await veterinaryService.saveClientPrice({ client: client.id, kind, price });
      }
      setPrices(await veterinaryService.clientPrices(client.id));
      setMessage(t("vet.clientCfg.saved"));
    } catch (err) {
      setMessage(vetError(err, t("vet.saveError")));
    }
  };

  return (
    <div className="d-grid gap-3">
      {herd && (
        <div>
          <span className={styles.label}><Link2 size={14} aria-hidden="true" /> {t("vet.clientCfg.herdTitle")}</span>
          <p className={styles.hint} style={{ margin: "2px 0 8px" }}>{t("vet.clientCfg.herdHint")}</p>
          <div className={styles.grid}>
            <label className={styles.field}><span>{t("vet.clientCfg.farm")}</span>
              <select className="form-select" value={farm} onChange={e => setFarm(e.target.value)}>
                <option value="">{t("vet.clientCfg.noFarm")}</option>
                {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
            <label className={styles.field}><span>{t("vet.clientCfg.purpose")}</span>
              <select className="form-select" value={purpose} onChange={e => setPurpose(e.target.value as VetHerdPurpose)}>
                {PURPOSES.map(p => <option key={p} value={p}>{t(`vet.clientCfg.purpose.${p}` as never)}</option>)}
              </select>
            </label>
          </div>
          <button type="button" className="btn btn-sm btn-agro mt-2" onClick={() => void saveLink()}>{t("vet.clientCfg.saveLink")}</button>
        </div>
      )}
      {pricing && (
        <div>
          <span className={styles.label}><Tags size={14} aria-hidden="true" /> {t("vet.clientCfg.pricesTitle")}</span>
          <p className={styles.hint} style={{ margin: "2px 0 8px" }}>{t("vet.clientCfg.pricesHint")}</p>
          <div className={styles.grid}>
            {PRICE_KINDS.map(([kind, field]) => {
              const current = prices.find(p => p.kind === kind);
              return (
                <label key={kind} className={styles.field}>
                  <span>{t("vet.billing.priceLabel", { kind: kindLabel(t, kind) })}</span>
                  <input key={`${kind}-${current?.price ?? ""}`} className="form-control" inputMode="decimal" defaultValue={current?.price ?? ""}
                    placeholder={String(workspace.settings[field as keyof typeof workspace.settings] ?? "")}
                    onBlur={e => void savePrice(kind, e.target.value)} />
                </label>
              );
            })}
          </div>
        </div>
      )}
      {message && <p role="status" className={styles.hint} style={{ margin: 0 }}>{message}</p>}
    </div>
  );
}

type Period = "last" | "month" | "3m" | "all";

/** Enviar ao cliente: image and WhatsApp text with what was done on each animal (prototype vEnv). */
export function ClientShare({ ctx, client }: { ctx: VetContext; client: VetClient }) {
  const { t, fmt, today, workspace } = ctx;
  const [rows, setRows] = useState<VetReportRow[] | null>(null);
  const [period, setPeriod] = useState<Period>("last");
  const [name, setName] = useState(workspace.settings.vet_name || workspace.settings.last_responsible || "");
  const [phone, setPhone] = useState(workspace.settings.vet_phone || "");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    veterinaryService.report({ client: client.id, mode: "event" }, controller.signal).then(r => setRows(r.rows)).catch(() => setRows([]));
    return () => controller.abort();
  }, [client.id]);

  if (!rows) return <p className={styles.muted}>{t("vet.loading")}</p>;
  const lastDate = rows.reduce((max, r) => (r.date > max ? r.date : max), "");
  const start = period === "last" ? lastDate : period === "month" ? `${today.slice(0, 7)}-01` : period === "3m" ? addDays(today, -90) : "";
  const selected = rows.filter(r => !start || r.date >= start);
  const latest = new Map<string, VetReportRow>();
  selected.forEach(r => { const seen = latest.get(r.animal); if (!seen || r.date > seen.date) latest.set(r.animal, r); });
  const animals = [...latest.values()].sort((a, b) => a.identifier.localeCompare(b.identifier, undefined, { numeric: true }));
  const pregnant = animals.filter(r => r.report_result === "pregnant").length;
  const open = animals.filter(r => r.report_result === "open").length;
  const summary = t("vet.share.summary", { animals: animals.length, pregnant, open });
  const line = (r: VetReportRow) => [r.identifier + (r.animal_name ? ` (${r.animal_name})` : ""), `${reportKindLabel(t, r.report_kind)} · ${fmt.fd5(r.date)}`, resultLabel(t, r.report_result) || "—", r.next ? nextLabel(t, r.next) + (r.next.date ? ` · ${fmt.fd5(r.next.date)}` : "") : "—"];

  const doc: ExportDocument = {
    title: t("vet.share.imageTitle", { client: client.name + (client.farm_name ? ` · ${client.farm_name}` : "") }),
    subtitle: [summary, [name, phone].filter(Boolean).join(" · ") ? t("vet.share.byVet", { name: [name, phone].filter(Boolean).join(" · ") }) : ""].filter(Boolean),
    columns: [t("vet.report.colAnimal"), t("vet.report.colLast"), t("vet.report.result"), t("vet.report.colNext")],
    groups: [{ title: "", rows: animals.map(line) }],
    fileName: `atendimentos-${client.name}`.toLowerCase().replace(/\s+/g, "-"),
  };
  const text = [
    `*${doc.title}*`, summary, "",
    ...animals.map(r => `• ${line(r).join(" — ")}`),
    "", name ? `${name}${phone ? ` · ${phone}` : ""}` : "",
  ].join("\n").trim();

  const shareImage = async () => {
    const shared = await sharePng(doc);
    setMessage(shared ? "" : t("vet.export.shareFallback"));
  };

  return (
    <div className="d-grid gap-2">
      <div className={styles.chips}>
        {(["last", "month", "3m", "all"] as Period[]).map(p => (
          <button key={p} type="button" className={`${styles.chip} ${period === p ? styles.chipOn : ""}`} aria-pressed={period === p} onClick={() => setPeriod(p)}>{t(`vet.share.period.${p}` as never)}</button>
        ))}
      </div>
      <div className={styles.grid}>
        <label className={styles.field}><span>{t("vet.share.name")}</span><input className="form-control" placeholder={t("vet.share.namePlaceholder")} value={name} onChange={e => setName(e.target.value)} /></label>
        <label className={styles.field}><span>{t("vet.share.phone")}</span><input className="form-control" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} /></label>
      </div>
      <p className={styles.muted} style={{ margin: 0 }}>{summary}</p>
      <div className={styles.actions}>
        <button type="button" className="btn btn-sm btn-agro" disabled={!animals.length} onClick={() => void shareImage()}><ImageIcon size={14} aria-hidden="true" /> {t("vet.share.image")}</button>
        <a className={`btn btn-sm btn-outline-secondary ${animals.length ? "" : "disabled"}`} href={whatsappLink(client.phone, text)} target="_blank" rel="noopener noreferrer" aria-disabled={!animals.length}>
          <MessageCircle size={14} aria-hidden="true" /> {t("vet.share.text")}
        </a>
      </div>
      {!client.phone && <p className={styles.hint} style={{ margin: 0 }}>{t("vet.share.noPhone")}</p>}
      {message && <p role="status" className={styles.hint} style={{ margin: 0 }}>{message}</p>}
    </div>
  );
}
