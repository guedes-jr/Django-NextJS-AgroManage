"use client";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownToLine, CircleDollarSign, HeartCrack, Package, Scale, TrendingUp, UserCheck, UserPlus, Weight } from "lucide-react";
import { getLotIndicators, type LotIndicators as Indicators, type LotReportItem } from "@/services/lotReportService";
import { useOrganizationLocale } from "@/lib/locale";
import styles from "./LotIndicators.module.css";

interface Card { key: string; label: string; Icon: LucideIcon; value: string; unit?: string; meta: React.ReactNode }

/** Zootechnical KPI cards for the lots currently shown in the lot report (period + filters). */
export function LotIndicators({ from, to, items }: { from: string; to: string; items: LotReportItem[] }) {
  const { language, t } = useOrganizationLocale();
  const ids = useMemo(() => items.map(item => item.id).sort().join(","), [items]);
  const [data, setData] = useState<Indicators | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setLoading(true); setError(false);
      return getLotIndicators(from, to, ids ? ids.split(",") : [], controller.signal)
        .then(value => { if (!controller.signal.aborted) setData(value); })
        .catch(() => { if (!controller.signal.aborted) setError(true); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    });
    return () => controller.abort();
  }, [from, to, ids, retry]);

  const fmt = (value: number | null | undefined, digits = 2) => value == null ? "—"
    : value.toLocaleString(language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const count = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString(language);
  const brl = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString(language, { style: "currency", currency: "BRL" });
  const noData = t("lotIndicators.noData");
  const d = loading ? null : data;
  const highlight = (text: string) => <b>{text}</b>;

  const cards: Card[] = [
    { key: "initialWeight", Icon: ArrowDownToLine, label: t("lotIndicators.initialWeight"), value: fmt(d?.initial_weight_kg), unit: d?.initial_weight_kg != null ? "kg" : undefined, meta: d && d.initial_weight_kg == null ? noData : t("lotIndicators.initialWeightMeta") },
    { key: "initialAnimals", Icon: UserPlus, label: t("lotIndicators.initialAnimals"), value: count(d?.initial_quantity), unit: d ? t("lotIndicators.animals") : undefined, meta: t("lotIndicators.initialAnimalsMeta") },
    { key: "currentAnimals", Icon: UserCheck, label: t("lotIndicators.currentAnimals"), value: count(d?.current_quantity), unit: d ? t("lotIndicators.animals") : undefined,
      meta: d?.current_weight_kg != null ? <>{t("lotIndicators.currentWeightMeta", { value: "" })}{highlight(`${fmt(d.current_weight_kg)} kg`)}</> : d ? noData : "—" },
    { key: "dailyGain", Icon: TrendingUp, label: t("lotIndicators.dailyGain"), value: fmt(d?.daily_gain_kg, 3), unit: d?.daily_gain_kg != null ? t("lotIndicators.perDay") : undefined,
      meta: d?.total_gain_kg != null ? <>{t("lotIndicators.totalGainMeta", { value: "" })}{highlight(`+${fmt(d.total_gain_kg, 1)} kg`)}</> : d ? noData : "—" },
    { key: "feedConversion", Icon: Scale, label: t("lotIndicators.feedConversion"), value: fmt(d?.feed_conversion), meta: d && d.feed_conversion == null ? noData : t("lotIndicators.feedConversionMeta") },
    { key: "mortality", Icon: HeartCrack, label: t("lotIndicators.mortality"), value: fmt(d?.mortality_pct, 1), unit: d?.mortality_pct != null ? "%" : undefined,
      meta: d?.mortality_pct != null ? t("lotIndicators.mortalityMeta", { deaths: count(d.deaths), total: count(d.initial_quantity) }) : d ? noData : "—" },
    { key: "feedConsumption", Icon: Package, label: t("lotIndicators.feedConsumption"), value: fmt(d?.feed_kg, 1), unit: d ? "kg" : undefined,
      meta: d?.feed_per_animal_day_kg != null ? <>{highlight(`${fmt(d.feed_per_animal_day_kg)} kg`)}{t("lotIndicators.feedPerAnimalDayMeta", { value: "" })}</> : d ? noData : "—" },
    { key: "feedCost", Icon: CircleDollarSign, label: t("lotIndicators.feedCost"), value: brl(d?.feed_cost), meta: t("lotIndicators.feedCostMeta") },
    { key: "costPerKg", Icon: Weight, label: t("lotIndicators.costPerKg"), value: brl(d?.cost_per_kg_gain), meta: d && d.cost_per_kg_gain == null ? noData : t("lotIndicators.costPerKgMeta") },
  ];

  return <section className={styles.section} aria-label={t("lotIndicators.title")} aria-busy={loading}>
    {loading && <p className={styles.status} role="status">{t("lotIndicators.loading")}</p>}
    {error && <div className={styles.error} role="alert"><span>{t("lotIndicators.error")}</span><button type="button" onClick={() => setRetry(value => value + 1)}>{t("lotIndicators.retry")}</button></div>}
    {!loading && !error && !items.length && <p className={styles.status}>{t("lotIndicators.noLots")}</p>}
    <div className={styles.grid}>
      {cards.map(({ key, label, Icon, value, unit, meta }) => <article key={key} className={styles.card}>
        <header><span className={styles.icon}><Icon size={18} aria-hidden="true" /></span><h3>{label}</h3></header>
        <strong>{value}{unit && <small> {unit}</small>}</strong>
        <p>{meta}</p>
      </article>)}
    </div>
  </section>;
}
