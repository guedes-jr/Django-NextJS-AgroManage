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

type AnyRecord = Record<string, unknown>;
type ApplicationRow = {
  id: string; plantation: string; date: string; product: string; purpose: string;
  area: number; quantity: number; unit: string; equipment: string;
};

const arrayOf = <T,>(payload: unknown): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  const results = (payload as { results?: unknown } | null)?.results;
  return Array.isArray(results) ? results as T[] : [];
};
const num = (value: unknown) => Number(value) || 0;
const iso = (value: unknown) => typeof value === "string" ? value.slice(0, 10) : "";
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const number = (value: number, digits = 2) => value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const date = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "-";

export default function RelatorioGeralPlantacoesPage() {
  const [loading, setLoading] = useState(true);
  const [plantations, setPlantations] = useState<Plantation[]>([]);
  const [sources, setSources] = useState<Record<string, AnyRecord[]>>({});
  const [culture, setCulture] = useState("all");
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
  const filtered = useMemo(() => plantations.filter((item) => {
    const planted = iso(item.planting_date);
    return (culture === "all" || item.crop_name === culture) && (!startDate || !planted || planted >= startDate) && (!endDate || !planted || planted <= endDate);
  }), [culture, endDate, plantations, startDate]);
  const ids = useMemo(() => new Set(filtered.map((item) => item.id)), [filtered]);
  const inReport = useCallback((item: AnyRecord) => ids.has(String(item.plantation || "")), [ids]);

  const rows = useMemo(() => filtered.map((item) => {
    const cost = num(item.investment_total);
    const revenue = num(item.estimated_revenue);
    const production = num(item.estimated_production_kg);
    const area = num(item.planted_area_ha);
    const profit = revenue - cost;
    const referenceDate = endDate ? new Date(`${endDate}T12:00:00`).getTime() : 0;
    const days = item.planting_date && referenceDate ? Math.max(0, Math.floor((referenceDate - new Date(`${item.planting_date}T12:00:00`).getTime()) / 86400000)) : 0;
    return { item, cost, revenue, production, area, profit, days, margin: revenue ? profit / revenue * 100 : 0 };
  }), [endDate, filtered]);

  const totals = useMemo(() => rows.reduce((acc, row) => ({
    area: acc.area + row.area, cost: acc.cost + row.cost, revenue: acc.revenue + row.revenue,
    production: acc.production + row.production, profit: acc.profit + row.profit,
  }), { area: 0, cost: 0, revenue: 0, production: 0, profit: 0 }), [rows]);
  const margin = totals.revenue ? totals.profit / totals.revenue * 100 : 0;

  const costs = useMemo(() => [
    { label: "Sementes", value: (sources.plantings || []).filter(inReport).reduce((s, x) => s + num(x.total_price), 0), color: "#1685c7" },
    { label: "Adubos", value: (sources.fertilizers || []).filter(inReport).reduce((s, x) => s + num(x.total_price), 0), color: "#ef9d00" },
    { label: "Fertirrigação", value: (sources.fertigations || []).filter(inReport).reduce((s, x) => s + num(x.total_price), 0), color: "#52a962" },
    { label: "Defensivos", value: (sources.pesticides || []).filter(inReport).reduce((s, x) => s + num(x.total_price), 0), color: "#e5484d" },
    { label: "Irrigação", value: (sources.irrigations || []).filter(inReport).reduce((s, x) => s + num(x.energy_cost), 0), color: "#6741b8" },
    { label: "Mão de obra", value: (sources.labor || []).filter(inReport).reduce((s, x) => s + num(x.total_amount), 0), color: "#238636" },
    { label: "Preparo do solo", value: (sources.land || []).filter(inReport).reduce((s, x) => s + num(x.total_price), 0), color: "#ca4a86" },
  ].filter((item) => item.value > 0), [inReport, sources]);
  const costTotal = costs.reduce((sum, item) => sum + item.value, 0);

  const consumption = useMemo(() => ({
    water: (sources.irrigations || []).filter(inReport).reduce((s, x) => s + num(x.liters_used), 0),
    energy: (sources.irrigations || []).filter(inReport).reduce((s, x) => s + num(x.energy_kwh), 0),
    pump: (sources.irrigations || []).filter(inReport).reduce((s, x) => s + num(x.hours), 0),
    tractor: (sources.land || []).filter(inReport).reduce((s, x) => s + num(x.hours_worked), 0),
  }), [inReport, sources]);

  const applications = useMemo<ApplicationRow[]>(() => [
    ...(sources.fertilizers || []).filter(inReport).map((x) => ({ id: `f-${x.id}`, plantation: String(x.plantation), date: iso(x.application_date), product: String(x.item_name || "Adubação"), purpose: String(x.application_method_display || "Nutrição"), area: num(x.area_applied_ha), quantity: num(x.quantity), unit: String(x.unit || ""), equipment: String(x.operator || "-") })),
    ...(sources.fertigations || []).filter(inReport).map((x) => ({ id: `g-${x.id}`, plantation: String(x.plantation), date: iso(x.application_date), product: String(x.item_name || "Fertirrigação"), purpose: "Nutrição via irrigação", area: num(x.area_applied_ha), quantity: num(x.quantity), unit: String(x.unit || ""), equipment: String(x.operator || "Sistema de irrigação") })),
    ...(sources.pesticides || []).filter(inReport).map((x) => ({ id: `p-${x.id}`, plantation: String(x.plantation), date: iso(x.application_date), product: String(x.item_name || x.pesticide_type_display || "Defensivo"), purpose: String(x.target || x.pesticide_type_display || "Proteção da cultura"), area: num(x.area_applied_ha), quantity: num(x.quantity), unit: String(x.unit || ""), equipment: String(x.equipment || x.operator || "-") })),
  ].filter((item) => (!startDate || !item.date || item.date >= startDate) && (!endDate || !item.date || item.date <= endDate)).sort((a, b) => b.date.localeCompare(a.date)), [endDate, inReport, sources, startDate]);

  if (loading) return <div className={styles.loading}><span className="spinner-border text-success" /> Carregando relatório...</div>;

  const cards = [
    { label: "Área total plantada", value: `${number(totals.area)} ha`, sub: `${rows.length} plantações`, icon: Leaf, tone: "green" },
    { label: "Custo total", value: money(totals.cost), sub: "100% do custo", icon: CircleDollarSign, tone: "green" },
    { label: "Receita prevista", value: money(totals.revenue), sub: totals.production ? `Preço médio: ${money(totals.revenue / totals.production)}/kg` : "Sem produção estimada", icon: CircleDollarSign, tone: "blue" },
    { label: "Lucro previsto", value: money(totals.profit), sub: "Receita − custo", icon: TrendingUp, tone: "orange" },
    { label: "Margem de lucro", value: `${number(margin)}%`, sub: "Sobre a receita", icon: Percent, tone: "purple" },
    { label: "Produção prevista", value: `${number(totals.production, 0)} kg`, sub: "Total estimado", icon: Weight, tone: "blue" },
  ];

  return <div className={`${styles.page} plantation-report-page`}>
    <header className={styles.header}>
      <div className={styles.heading}><span className={styles.logo}><Sprout /></span><div><h1>Relatório geral das plantações</h1><p>Visão geral de todas as plantações da fazenda</p></div></div>
      <div className={styles.headerActions}>
        <div className={styles.period}><CalendarDays /><span><b>Período do relatório</b>{date(startDate)} a {date(endDate)}</span></div>
      </div>
    </header>

    <section className={styles.kpis}>{cards.map(({ icon: Icon, ...card }) => <article className={styles.kpi} key={card.label}><Icon className={styles[card.tone]} /><div><span>{card.label}</span><strong>{card.value}</strong><small>{card.sub}</small></div></article>)}</section>

    <section className={styles.panel}>
      <div className={styles.sectionTitle}><h2>1. Resumo por plantação</h2><div className={styles.filters}>
        <label>Cultura<select value={culture} onChange={(event) => setCulture(event.target.value)}><option value="all">Todas</option>{cultures.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Data inicial<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label>Data final<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
        <button><Filter /> Filtrar</button>
      </div></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Cultura / Talhão</th><th>Área (ha)</th><th>Data do plantio</th><th>Dias</th><th>Produção prevista (kg)</th><th>Custo total</th><th>Receita prevista</th><th>Lucro previsto</th><th>Margem</th><th>Custo/kg</th><th>Lucro/kg</th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.item.id}><td><b>{row.item.crop_name || row.item.name}</b><small>{row.item.field_name || "Sem talhão"}</small></td><td>{number(row.area)}</td><td>{date(row.item.planting_date)}</td><td>{row.days}</td><td>{number(row.production, 0)}</td><td>{money(row.cost)}</td><td>{money(row.revenue)}</td><td>{money(row.profit)}</td><td>{number(row.margin)}%</td><td>{row.production ? money(row.cost / row.production) : "-"}</td><td>{row.production ? money(row.profit / row.production) : "-"}</td></tr>)}
        {!rows.length && <tr><td colSpan={11} className={styles.empty}>Nenhuma plantação encontrada no período.</td></tr>}
      </tbody><tfoot><tr><th>Total geral</th><th>{number(totals.area)}</th><th colSpan={2}></th><th>{number(totals.production, 0)}</th><th>{money(totals.cost)}</th><th>{money(totals.revenue)}</th><th>{money(totals.profit)}</th><th>{number(margin)}%</th><th>{totals.production ? money(totals.cost / totals.production) : "-"}</th><th>{totals.production ? money(totals.profit / totals.production) : "-"}</th></tr></tfoot></table></div>
    </section>

    <div className={styles.twoColumns}>
      <section className={styles.panel}><h2>2. Distribuição dos custos totais</h2><div className={styles.costs}>
        <div className={styles.donut} style={{ background: costTotal ? `conic-gradient(${costs.map((item, index) => { const before = costs.slice(0, index).reduce((s, x) => s + x.value, 0) / costTotal * 100; const after = before + item.value / costTotal * 100; return `${item.color} ${before}% ${after}%`; }).join(",")})` : "var(--muted)" }}><span>{costTotal ? "Custos" : "Sem dados"}</span></div>
        <div className={styles.legend}>{costs.map((item) => <div key={item.label}><i style={{ background: item.color }} /><span>{item.label}</span><b>{money(item.value)}</b><em>{costTotal ? number(item.value / costTotal * 100) : "0,00"}%</em></div>)}<div className={styles.legendTotal}><span>Total</span><b>{money(costTotal || totals.cost)}</b><em>100%</em></div></div>
      </div></section>
      <section className={styles.panel}><h2>3. Consumos totais</h2><div className={styles.consumption}>
        {[{ icon: Droplets, label: "Água utilizada", value: `${number(consumption.water, 0)} L`, tone: "blue" }, { icon: Zap, label: "Energia elétrica", value: `${number(consumption.energy, 0)} kWh`, tone: "orange" }, { icon: Timer, label: "Horas de bomba", value: `${number(consumption.pump, 1)} h`, tone: "green" }, { icon: Tractor, label: "Horas de trator", value: `${number(consumption.tractor, 1)} h`, tone: "green" }].map(({ icon: Icon, ...item }) => <article key={item.label}><Icon className={styles[item.tone]} /><span>{item.label}</span><b>{item.value}</b></article>)}
      </div></section>
    </div>

    <section className={styles.panel}><h2>4. Aplicações realizadas (geral)</h2><div className={styles.tableWrap}><table><thead><tr><th>Data</th><th>Produto</th><th>Plantação</th><th>Finalidade</th><th>Área aplicada (ha)</th><th>Quantidade</th><th>Equipamento / operador</th></tr></thead><tbody>
      {applications.map((item) => <tr key={item.id}><td>{date(item.date)}</td><td>{item.product}</td><td>{filtered.find((p) => p.id === item.plantation)?.crop_name || "-"}</td><td>{item.purpose}</td><td>{number(item.area)}</td><td>{number(item.quantity)} {item.unit}</td><td>{item.equipment}</td></tr>)}
      {!applications.length && <tr><td colSpan={7} className={styles.empty}>Nenhuma aplicação registrada no período.</td></tr>}
    </tbody></table></div></section>
    <footer className={styles.footer}>Os valores apresentados são baseados nos lançamentos realizados até a data do relatório.</footer>
    <div className={styles.printAction}>
      <button type="button" onClick={() => window.print()}><Printer /> Imprimir relatório</button>
    </div>
  </div>;
}
