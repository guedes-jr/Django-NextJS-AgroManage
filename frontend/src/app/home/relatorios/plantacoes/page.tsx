"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays, CircleDollarSign, Droplets, Filter,
  Leaf, Percent, Printer, Sprout, Timer, Tractor, TrendingUp, Weight,
  Zap,
} from "lucide-react";
import { cropService } from "@/services/cropService";
import type { Plantation } from "@/types";
import styles from "./report.module.css";
import { useOrganizationLocale } from "@/lib/locale";

type AnyRecord = Record<string, unknown>;
type ApplicationRow = {
  id: string; plantation: string; date: string; product: string; purpose: string;
  area: number; quantity: number; unit: string; equipment: string;
};
type HarvestRow = {
  id: string; plantingCycle: string; plantation: string; date: string; type: string;
  production: number; destination: string; buyer: string; unitPrice: number; revenue: number;
};

const arrayOf = <T,>(payload: unknown): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  const results = (payload as { results?: unknown } | null)?.results;
  return Array.isArray(results) ? results as T[] : [];
};
const num = (value: unknown) => Number(value) || 0;
const iso = (value: unknown) => typeof value === "string" ? value.slice(0, 10) : "";

export default function RelatorioGeralPlantacoesPage() {
  const { language, t } = useOrganizationLocale();
  const money = (value: number) => value.toLocaleString(language, { style: "currency", currency: "BRL" });
  const number = (value: number, digits = 2) => value.toLocaleString(language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const date = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(language) : "-";
  const [loading, setLoading] = useState(true);
  const [plantations, setPlantations] = useState<Plantation[]>([]);
  const [sources, setSources] = useState<Record<string, AnyRecord[]>>({});
  const [culture, setCulture] = useState("all");
  const [field, setField] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      cropService.list({ page_size: 500 }),
      cropService.listPlantings({ page_size: 500 }),
      cropService.listFertilizations({ page_size: 500 }),
      cropService.listFertigations({ page_size: 500 }),
      cropService.listPesticideApplications({ page_size: 500 }),
      cropService.listIrrigations({ page_size: 500 }),
      cropService.listLaborRecords({ page_size: 500 }),
      cropService.listLandPreparations({ page_size: 500 }),
      cropService.listHarvests({ page_size: 500 }),
    ]).then(async ([plantationRes, plantingRes, fertilizerRes, fertigationRes, pesticideRes, irrigationRes, laborRes, landRes, harvestRes]) => {
      const listed = arrayOf<Plantation>(plantationRes.data);
      const detailed = await Promise.all(listed.map((item) => cropService.get(item.id).then((res) => res.data as Plantation).catch(() => item)));
      if (!active) return;
      setPlantations(detailed);
      setSources({
        plantings: arrayOf(plantingRes.data), fertilizers: arrayOf(fertilizerRes.data),
        fertigations: arrayOf(fertigationRes.data), pesticides: arrayOf(pesticideRes.data),
        irrigations: arrayOf(irrigationRes.data), labor: arrayOf(laborRes.data),
        land: arrayOf(landRes.data), harvests: arrayOf(harvestRes.data),
      });
      const dates = detailed.map((item) => iso(item.planting_date)).filter(Boolean).sort();
      setStartDate(dates[0] || "");
      setEndDate(new Date().toISOString().slice(0, 10));
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const cultures = useMemo(() => [...new Set(plantations.map((item) => item.crop_name).filter(Boolean))].sort(), [plantations]);
  const fields = useMemo(() => [...new Map(plantations
    .filter((item) => item.field)
    .map((item) => [item.field, item.field_name || "Sem nome"]))
    .entries()]
    .sort(([, first], [, second]) => first.localeCompare(second, language)), [language, plantations]);
  const filtered = useMemo(() => plantations.filter((item) => {
    const planted = iso(item.planting_date);
    return (culture === "all" || item.crop_name === culture) && (field === "all" || item.field === field) && (!startDate || !planted || planted >= startDate) && (!endDate || !planted || planted <= endDate);
  }), [culture, endDate, field, plantations, startDate]);
  const ids = useMemo(() => new Set(filtered.map((item) => item.id)), [filtered]);
  const inReport = useCallback((item: AnyRecord) => ids.has(String(item.plantation || "")), [ids]);

  const harvests = useMemo<HarvestRow[]>(() => (sources.harvests || [])
    .filter((item) => ids.has(String(item.planting_cycle || "")))
    .map((item) => ({
      id: String(item.id),
      plantingCycle: String(item.planting_cycle || ""),
      plantation: String(item.planting_cycle_name || t("crops.defaultPlantation")),
      date: iso(item.harvest_date),
      type: String(item.harvest_type_display || item.harvest_type || t("crops.harvest")),
      production: num(item.yield_kg),
      destination: String(item.destination_display || item.destination || t("crops.unknown")),
      buyer: String(item.buyer_name_display || item.buyer_name || "—"),
      unitPrice: num(item.unit_price),
      revenue: num(item.revenue_amount),
    }))
    .filter((item) => (!startDate || !item.date || item.date >= startDate) && (!endDate || !item.date || item.date <= endDate))
    .sort((a, b) => b.date.localeCompare(a.date)), [endDate, ids, sources.harvests, startDate, t]);

  const rows = useMemo(() => filtered.map((item) => {
    const cost = num(item.investment_total);
    const predictedRevenue = num(item.estimated_revenue);
    const predictedProduction = num(item.estimated_production_kg);
    const cycleHarvests = harvests.filter((harvest) => harvest.plantingCycle === item.id);
    const actualRevenue = cycleHarvests.reduce((sum, harvest) => sum + harvest.revenue, 0);
    const harvestedProduction = cycleHarvests.reduce((sum, harvest) => sum + harvest.production, 0);
    const area = num(item.planted_area_ha);
    const predictedProfit = predictedRevenue - cost;
    const actualProfit = actualRevenue - cost;
    const cultivationEnd = iso(item.actual_harvest_date) || endDate;
    const referenceDate = cultivationEnd ? new Date(`${cultivationEnd}T12:00:00`).getTime() : 0;
    const days = item.planting_date && referenceDate ? Math.max(0, Math.floor((referenceDate - new Date(`${item.planting_date}T12:00:00`).getTime()) / 86400000)) : 0;
    return { item, cost, predictedRevenue, predictedProduction, actualRevenue, harvestedProduction, area, predictedProfit, actualProfit, days, predictedMargin: predictedRevenue ? predictedProfit / predictedRevenue * 100 : 0, actualMargin: actualRevenue ? actualProfit / actualRevenue * 100 : 0 };
  }), [endDate, filtered, harvests]);

  const totals = useMemo(() => rows.reduce((acc, row) => ({
    area: acc.area + row.area, cost: acc.cost + row.cost,
    predictedRevenue: acc.predictedRevenue + row.predictedRevenue,
    predictedProduction: acc.predictedProduction + row.predictedProduction,
    actualRevenue: acc.actualRevenue + row.actualRevenue,
    harvestedProduction: acc.harvestedProduction + row.harvestedProduction,
    predictedProfit: acc.predictedProfit + row.predictedProfit,
    actualProfit: acc.actualProfit + row.actualProfit,
  }), { area: 0, cost: 0, predictedRevenue: 0, predictedProduction: 0, actualRevenue: 0, harvestedProduction: 0, predictedProfit: 0, actualProfit: 0 }), [rows]);
  const predictedMargin = totals.predictedRevenue ? totals.predictedProfit / totals.predictedRevenue * 100 : 0;
  const actualMargin = totals.actualRevenue ? totals.actualProfit / totals.actualRevenue * 100 : 0;

  const costs = useMemo(() => [
    { label: t("crops.seeds"), value: (sources.plantings || []).filter(inReport).reduce((s, x) => s + num(x.total_price), 0), color: "#1685c7" },
    { label: t("crops.fertilizers"), value: (sources.fertilizers || []).filter(inReport).reduce((s, x) => s + num(x.total_price), 0), color: "#ef9d00" },
    { label: t("crops.fertigation"), value: (sources.fertigations || []).filter(inReport).reduce((s, x) => s + num(x.total_price), 0), color: "#52a962" },
    { label: t("crops.pesticides"), value: (sources.pesticides || []).filter(inReport).reduce((s, x) => s + num(x.total_price), 0), color: "#e5484d" },
    { label: t("crops.irrigation"), value: (sources.irrigations || []).filter(inReport).reduce((s, x) => s + num(x.energy_cost), 0), color: "#6741b8" },
    { label: t("crops.labor"), value: (sources.labor || []).filter(inReport).reduce((s, x) => s + num(x.total_amount), 0), color: "#238636" },
    { label: t("crops.landPreparation"), value: (sources.land || []).filter(inReport).reduce((s, x) => s + num(x.total_price), 0), color: "#ca4a86" },
  ].filter((item) => item.value > 0), [inReport, sources, t]);
  const costTotal = costs.reduce((sum, item) => sum + item.value, 0);

  const consumption = useMemo(() => ({
    water: (sources.irrigations || []).filter(inReport).reduce((s, x) => s + num(x.liters_used), 0),
    energy: (sources.irrigations || []).filter(inReport).reduce((s, x) => s + num(x.energy_kwh), 0),
    pump: (sources.irrigations || []).filter(inReport).reduce((s, x) => s + num(x.hours), 0),
    tractor: (sources.land || []).filter(inReport).reduce((s, x) => s + num(x.hours_worked), 0),
  }), [inReport, sources]);

  const applications = useMemo<ApplicationRow[]>(() => [
    ...(sources.fertilizers || []).filter(inReport).map((x) => ({ id: `f-${x.id}`, plantation: String(x.plantation), date: iso(x.application_date), product: String(x.item_name || t("crops.fertilization")), purpose: String(x.application_method_display || t("crops.nutrition")), area: num(x.area_applied_ha), quantity: num(x.quantity), unit: String(x.unit || ""), equipment: String(x.operator || "-") })),
    ...(sources.fertigations || []).filter(inReport).map((x) => ({ id: `g-${x.id}`, plantation: String(x.plantation), date: iso(x.application_date), product: String(x.item_name || t("crops.fertigation")), purpose: t("crops.irrigationNutrition"), area: num(x.area_applied_ha), quantity: num(x.quantity), unit: String(x.unit || ""), equipment: String(x.operator || t("crops.irrigationSystem")) })),
    ...(sources.pesticides || []).filter(inReport).map((x) => ({ id: `p-${x.id}`, plantation: String(x.plantation), date: iso(x.application_date), product: String(x.item_name || x.pesticide_type_display || t("crops.pesticide")), purpose: String(x.target || x.pesticide_type_display || t("crops.cropProtection")), area: num(x.area_applied_ha), quantity: num(x.quantity), unit: String(x.unit || ""), equipment: String(x.equipment || x.operator || "-") })),
  ].filter((item) => (!startDate || !item.date || item.date >= startDate) && (!endDate || !item.date || item.date <= endDate)).sort((a, b) => b.date.localeCompare(a.date)), [endDate, inReport, sources, startDate, t]);

  if (loading) return <div className={styles.loading}><span className="spinner-border text-success" /> {t("crops.loading")}</div>;

  const cards = [
    { label: t("crops.totalArea"), value: `${number(totals.area)} ha`, sub: t("crops.plantations").replace("{count}", number(rows.length)), icon: Leaf, tone: "green" },
    { label: t("crops.totalCost"), value: money(totals.cost), sub: t("crops.fullCost"), icon: CircleDollarSign, tone: "green" },
    { label: t("crops.expectedRevenue"), value: money(totals.predictedRevenue), sub: t("crops.registeredEstimate"), icon: CircleDollarSign, tone: "blue" },
    { label: t("crops.realizedRevenue"), value: money(totals.actualRevenue), sub: harvests.length ? t("crops.harvestCount").replace("{count}", number(harvests.length)) : t("crops.noHarvestRevenue"), icon: CircleDollarSign, tone: "blue" },
    { label: t("crops.expectedProfit"), value: money(totals.predictedProfit), sub: t("crops.expectedRevenueLessCost"), icon: TrendingUp, tone: "orange" },
    { label: t("crops.actualProfit"), value: money(totals.actualProfit), sub: t("crops.actualRevenueLessCost"), icon: TrendingUp, tone: "orange" },
    { label: t("crops.expectedMargin"), value: `${number(predictedMargin)}%`, sub: t("crops.onExpectedRevenue"), icon: Percent, tone: "purple" },
    { label: t("crops.actualMargin"), value: `${number(actualMargin)}%`, sub: t("crops.onActualRevenue"), icon: Percent, tone: "purple" },
    { label: t("crops.harvestedProduction"), value: `${number(totals.harvestedProduction, 0)} kg`, sub: t("crops.expected").replace("{value}", number(totals.predictedProduction, 0)), icon: Weight, tone: "blue" },
  ];

  return <div className={`${styles.page} plantation-report-page`}>
    <header className={styles.header}>
      <div className={styles.heading}><span className={styles.logo}><Sprout /></span><div><h1>{t("crops.title")}</h1><p>{t("crops.description")}</p></div></div>
      <div className={styles.headerActions}>
        <div className={styles.period}><CalendarDays /><span><b>{t("crops.period")}</b>{date(startDate)} – {date(endDate)}</span></div>
      </div>
    </header>

    <section className={styles.kpis}>{cards.map(({ icon: Icon, ...card }) => <article className={styles.kpi} key={card.label}><Icon className={styles[card.tone]} /><div><span>{card.label}</span><strong>{card.value}</strong><small>{card.sub}</small></div></article>)}</section>

    <section className={styles.panel}>
      <div className={styles.sectionTitle}><h2>{t("crops.sectionSummary")}</h2><div className={styles.filters}>
        <label>{t("crops.culture")}<select value={culture} onChange={(event) => setCulture(event.target.value)}><option value="all">{t("crops.allCultures")}</option>{cultures.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>{t("crops.field")}<select value={field} onChange={(event) => setField(event.target.value)}><option value="all">{t("crops.allFields")}</option>{fields.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>{t("crops.startDate")}<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label>{t("crops.endDate")}<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
        <button><Filter /> {t("crops.filter")}</button>
      </div></div>
      <div className={styles.tableWrap}><table><thead><tr><th>{t("crops.cultureField")}</th><th>{t("crops.areaHa")}</th><th>{t("crops.plantingDate")}</th><th>{t("crops.days")}</th><th>{t("crops.expectedProduction")}</th><th>{t("crops.totalHarvest")}</th><th>{t("crops.totalCost")}</th><th>{t("crops.expectedRevenue")}</th><th>{t("crops.actualRevenueColumn")}</th><th>{t("crops.expectedProfitColumn")}</th><th>{t("crops.actualProfitColumn")}</th><th>{t("crops.expectedMarginColumn")}</th><th>{t("crops.actualMarginColumn")}</th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.item.id}><td><b>{row.item.crop_name || row.item.name}</b><small>{row.item.field_name || t("crops.noField")}</small></td><td>{number(row.area)}</td><td>{date(row.item.planting_date)}</td><td>{number(row.days, 0)}</td><td>{number(row.predictedProduction, 0)} kg</td><td>{number(row.harvestedProduction, 0)} kg</td><td>{money(row.cost)}</td><td>{money(row.predictedRevenue)}</td><td>{money(row.actualRevenue)}</td><td>{money(row.predictedProfit)}</td><td>{money(row.actualProfit)}</td><td>{number(row.predictedMargin)}%</td><td>{number(row.actualMargin)}%</td></tr>)}
        {!rows.length && <tr><td colSpan={13} className={styles.empty}>{t("crops.notFound")}</td></tr>}
      </tbody><tfoot><tr><th>{t("crops.grandTotal")}</th><th>{number(totals.area)}</th><th colSpan={2}></th><th>{number(totals.predictedProduction, 0)} kg</th><th>{number(totals.harvestedProduction, 0)} kg</th><th>{money(totals.cost)}</th><th>{money(totals.predictedRevenue)}</th><th>{money(totals.actualRevenue)}</th><th>{money(totals.predictedProfit)}</th><th>{money(totals.actualProfit)}</th><th>{number(predictedMargin)}%</th><th>{number(actualMargin)}%</th></tr></tfoot></table></div>
    </section>

    <div className={styles.twoColumns}>
      <section className={styles.panel}><h2>{t("crops.costDistribution")}</h2><div className={styles.costs}>
        <div className={styles.donut} style={{ background: costTotal ? `conic-gradient(${costs.map((item, index) => { const before = costs.slice(0, index).reduce((s, x) => s + x.value, 0) / costTotal * 100; const after = before + item.value / costTotal * 100; return `${item.color} ${before}% ${after}%`; }).join(",")})` : "var(--muted)" }}><span>{costTotal ? t("crops.costs") : t("crops.noData")}</span></div>
        <div className={styles.legend}>{costs.map((item) => <div key={item.label}><i style={{ background: item.color }} /><span>{item.label}</span><b>{money(item.value)}</b><em>{costTotal ? number(item.value / costTotal * 100) : number(0)}%</em></div>)}<div className={styles.legendTotal}><span>{t("crops.total")}</span><b>{money(costTotal || totals.cost)}</b><em>100%</em></div></div>
      </div></section>
      <section className={styles.panel}><h2>{t("crops.consumption")}</h2><div className={styles.consumption}>
        {[{ icon: Droplets, label: t("crops.water"), value: `${number(consumption.water, 0)} L`, tone: "blue" }, { icon: Zap, label: t("crops.energy"), value: `${number(consumption.energy, 0)} kWh`, tone: "orange" }, { icon: Timer, label: t("crops.pumpHours"), value: `${number(consumption.pump, 1)} h`, tone: "green" }, { icon: Tractor, label: t("crops.tractorHours"), value: `${number(consumption.tractor, 1)} h`, tone: "green" }].map(({ icon: Icon, ...item }) => <article key={item.label}><Icon className={styles[item.tone]} /><span>{item.label}</span><b>{item.value}</b></article>)}
      </div></section>
    </div>

    <section className={styles.panel}><h2>{t("crops.applications")}</h2><div className={styles.tableWrap}><table><thead><tr><th>{t("crops.date")}</th><th>{t("crops.product")}</th><th>{t("crops.plantation")}</th><th>{t("crops.purpose")}</th><th>{t("crops.appliedArea")}</th><th>{t("crops.quantity")}</th><th>{t("crops.equipmentOperator")}</th></tr></thead><tbody>
      {applications.map((item) => <tr key={item.id}><td>{date(item.date)}</td><td>{item.product}</td><td>{filtered.find((p) => p.id === item.plantation)?.crop_name || "-"}</td><td>{item.purpose}</td><td>{number(item.area)}</td><td>{number(item.quantity)} {item.unit}</td><td>{item.equipment}</td></tr>)}
      {!applications.length && <tr><td colSpan={7} className={styles.empty}>{t("crops.noApplications")}</td></tr>}
    </tbody></table></div></section>
    <section className={styles.panel}><h2>{t("crops.harvests")}</h2><div className={styles.tableWrap}><table><thead><tr><th>{t("crops.date")}</th><th>{t("crops.plantation")}</th><th>{t("crops.type")}</th><th>{t("crops.totalHarvest")}</th><th>{t("crops.destination")}</th><th>{t("crops.buyer")}</th><th>{t("crops.unitPrice")}</th><th>{t("crops.actualRevenueColumn")}</th></tr></thead><tbody>
      {harvests.map((harvest) => <tr key={harvest.id}><td>{date(harvest.date)}</td><td>{filtered.find((plantation) => plantation.id === harvest.plantingCycle)?.crop_name || harvest.plantation}</td><td>{harvest.type}</td><td>{number(harvest.production, 0)} kg</td><td>{harvest.destination}</td><td>{harvest.buyer}</td><td>{harvest.unitPrice ? `${money(harvest.unitPrice)}/kg` : "—"}</td><td><b>{money(harvest.revenue)}</b></td></tr>)}
      {!harvests.length && <tr><td colSpan={8} className={styles.empty}>{t("crops.noHarvests")}</td></tr>}
    </tbody><tfoot><tr><th colSpan={3}>{t("crops.harvestTotals")}</th><th>{number(totals.harvestedProduction, 0)} kg</th><th colSpan={3}></th><th>{money(totals.actualRevenue)}</th></tr></tfoot></table></div></section>
    <footer className={styles.footer}>{t("crops.footer")}</footer>
    <div className={styles.printAction}>
      <button type="button" onClick={() => window.print()}><Printer /> {t("crops.print")}</button>
    </div>
  </div>;
}
