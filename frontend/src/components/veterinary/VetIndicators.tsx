"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { veterinaryService, type VetIndicators as Indicators, type VetRate } from "@/services/veterinaryService";
import styles from "./veterinary.module.css";
import type { VetContext } from "./VeterinaryArea";
import { addDays } from "./vetText";

type Range = "12m" | "year" | "all";

/** Pregnancy rate of the inseminations with a known diagnosis: by month (chart) and by bull,
 * responsible and farm (tables, which are also the text view of the chart). */
export function VetIndicators({ ctx }: { ctx: VetContext }) {
  const { t, fmt, today, language } = ctx;
  const [range, setRange] = useState<Range>("12m");
  const [data, setData] = useState<Indicators | null>(null);
  const [error, setError] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const start = range === "12m" ? addDays(today, -365) : range === "year" ? `${today.slice(0, 4)}-01-01` : undefined;
    veterinaryService.indicators({ start }, controller.signal)
      .then(result => { setData(result); setError(false); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [range, today]);

  const monthLabel = (key: string) => new Date(`${key}-01T12:00:00Z`).toLocaleDateString(language, { month: "short", year: "2-digit", timeZone: "UTC" });
  const months = data?.by_month || [];
  const active = months.find(m => m.name === hover) || months[months.length - 1];

  const table = (title: string, rows: VetRate[]) => (
    <div className={styles.rateTable}>
      <h3>{title}</h3>
      {rows.length ? (
        <table className={styles.table}>
          <thead><tr><th>{t("vet.indicators.name")}</th><th className="text-end">{t("vet.indicators.inseminations")}</th><th className="text-end">{t("vet.report.rate")}</th></tr></thead>
          <tbody>
            {rows.slice(0, 8).map(row => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td className="text-end">{row.pregnant}/{row.total}</td>
                <td className="text-end">
                  <span className={styles.rateCell}><span className={styles.rateTrack} aria-hidden="true"><span className={styles.rateBar} style={{ width: `${row.rate}%` }} /></span>{fmt.percent(row.rate)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className={styles.muted}>—</p>}
    </div>
  );

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2><TrendingUp size={18} className={styles.ok} aria-hidden="true" /> {t("vet.indicators.title")}</h2>
        <div className={styles.chips}>
          {(["12m", "year", "all"] as Range[]).map(r => (
            <button key={r} type="button" className={`${styles.chip} ${range === r ? styles.chipOn : ""}`} aria-pressed={range === r} onClick={() => setRange(r)}>{t(`vet.indicators.range.${r}` as never)}</button>
          ))}
        </div>
      </div>
      <p className={styles.hint}>{t("vet.indicators.hint")}</p>
      {error && <p className={styles.danger}>{t("vet.error")}</p>}
      {!data && !error && <p className={styles.muted}>{t("vet.loading")}</p>}
      {data && !data.total && <p className={styles.muted}>{t("vet.indicators.empty")}</p>}
      {data && data.total > 0 && (
        <>
          <div className={styles.rateHead}>
            <b>{fmt.percent(data.rate)}</b>
            <span>{t("vet.indicators.overall", { pregnant: data.pregnant, total: data.total })}</span>
          </div>
          <figure className={styles.rateChart} aria-label={t("vet.indicators.chart")}>
            <div className={styles.rateReadout} aria-live="polite">
              {active && <>{monthLabel(active.name)} · <b>{fmt.percent(active.rate)}</b> · {t("vet.indicators.of", { pregnant: active.pregnant, total: active.total })}</>}
            </div>
            <div className={styles.rateBars} role="list">
              {months.map(m => (
                <button key={m.name} type="button" role="listitem" className={styles.rateCol} data-active={active?.name === m.name}
                  aria-label={`${monthLabel(m.name)}: ${fmt.percent(m.rate)} (${m.pregnant}/${m.total})`}
                  onMouseEnter={() => setHover(m.name)} onFocus={() => setHover(m.name)} onMouseLeave={() => setHover(null)}>
                  <span className={styles.rateColTrack}><i style={{ height: `${Math.max(2, m.rate)}%` }} /></span>
                  <small>{monthLabel(m.name)}</small>
                </button>
              ))}
            </div>
          </figure>
          <div className={styles.rateTables}>
            {table(t("vet.indicators.byBull"), data.by_bull)}
            {table(t("vet.indicators.byResponsible"), data.by_responsible)}
            {table(t("vet.indicators.byFarm"), data.by_farm)}
          </div>
        </>
      )}
    </section>
  );
}
