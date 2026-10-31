"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Baby, Milk, Droplets, Wheat, Factory, ShieldPlus, HeartPulse, ChartNoAxesCombined, Cylinder, ChevronRight, RefreshCw, CalendarDays, Scale, Icon } from "lucide-react";
import { cowHead } from "@lucide/lab";
import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";
import { canAccessOrganizationPath } from "@/services/organizationAccess";
import { cattleService, cattleError } from "@/services/cattleService";
import { dairyService, type DairyOverview } from "@/services/dairyService";
import shared from "@/components/livestock/species-module-home.module.css";
import base from "./cattle.module.css";
import styles from "./dairy-home.module.css";

const root = "/home/rebanho/bovinos";
const today = () => { const day = new Date(); return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`; };
const number = (value: unknown) => value === null || value === undefined ? "—" : Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const shortcuts = [
  { title: "Cadastro de animais", description: "Cadastre e gerencie seu rebanho", href: `${root}/cadastro`, icon: "cow" },
  { title: "Reprodução", description: "Coberturas, diagnóstico, gestação e parto", href: `${root}/reproducao`, icon: HeartPulse },
  { title: "Lançar produção de leite", description: "Registre ordenhas, turnos e descartes", href: `${root}/leite`, icon: Milk },
  { title: "Bezerras e novilhas", description: "Acompanhe o desenvolvimento das fêmeas jovens", href: `${root}/cadastro?group=young-females`, icon: Baby },
  { title: "Sanidade", description: "Vacinações, tratamentos e carências", href: `${root}/sanidade`, icon: ShieldPlus },
  { title: "Alimentação", description: "Planeje e acompanhe o fornecimento de alimentos", href: `${root}/racao`, icon: Wheat },
  { title: "Fábrica de ração", description: "Formule e produza a ração do rebanho", href: `${root}/racao/producao`, icon: Factory, financial: true },
  { title: "Tanque de leite", description: "Coletas e qualidade do leite", icon: Cylinder, planned: true },
  { title: "Relatórios", description: "Consulte e exporte os registros do rebanho", href: `${root}/relatorios`, icon: ChartNoAxesCombined, financial: true },
];

export function DairyHome() {
  const access = useOrganizationAccess();
  const [date, setDate] = useState(today);
  const [farm, setFarm] = useState("");
  const [farms, setFarms] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<DairyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [farmError, setFarmError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    cattleService.farms(controller.signal).then(setFarms).catch(error => { if (!controller.signal.aborted) setFarmError(cattleError(error)); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    dairyService.overview(date, farm, controller.signal).then(result => {
      if (!controller.signal.aborted) { setData(result); setError(""); }
    }).catch(error => { if (!controller.signal.aborted) { setData(null); setError(cattleError(error)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, farm, refresh]);
  const metrics = [
    { label: "Vacas em lactação", value: data?.lactating_cows, icon: "cow", tone: "green", detail: "Fêmeas identificadas em lactação atualmente" },
    { label: date === today() ? "Produção de hoje" : "Produção do dia", value: data ? `${number(data.produced_liters)} L` : undefined, icon: Milk, tone: "blue", detail: "Soma das ordenhas registradas na data" },
    { label: "Média por vaca ordenhada", value: data ? data.average_per_milked_cow === null ? "—" : `${number(data.average_per_milked_cow)} L` : undefined, icon: Droplets, tone: "green", detail: `${data?.milked_cows || 0} vacas com ordenha registrada no dia` },
    { label: "Leite aproveitável", value: data ? `${number(data.usable_liters)} L` : undefined, icon: Milk, tone: "emerald", detail: `Produção menos ${number(data?.discarded_liters)} L de descarte` },
    { label: "Total de vacas", value: data?.total_cows, icon: "cow", tone: "blue", detail: "Vacas e matrizes identificadas ativas" },
    { label: "Vacas fora de lactação", value: data?.non_lactating_cows, icon: "cow", tone: "amber", detail: "Vacas e matrizes ativas sem indicação de lactação" },
    { label: "Bezerras / novilhas", value: data?.young_females, icon: Baby, tone: "slate", detail: "Fêmeas identificadas ativas nessas categorias" },
    { label: "Touros", value: data?.bulls, icon: Scale, tone: "green", detail: "Touros e reprodutores identificados ativos" },
  ];
  return <div className={`${base.page} ${styles.page}`}>
    <header className={base.header}><div><Link href={root} className="small">Bovinos</Link><h1>Pecuária leiteira</h1><p>Visão geral da sua fazenda</p></div>
      <div className={styles.filters}>
        <label><span>Fazenda</span><select className="form-select form-select-sm" value={farm} onChange={event => { setLoading(true); setFarm(event.target.value); }}><option value="">Todas as fazendas</option>{farms.map(farm => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select></label>
        <label><span><CalendarDays size={14} aria-hidden="true"/> Data da produção</span><input type="date" className="form-control form-control-sm" required max={today()} value={date} onChange={event => { if (event.target.value) { setLoading(true); setDate(event.target.value); } }}/></label>
        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={loading} aria-label="Atualizar indicadores" onClick={() => { setLoading(true); setRefresh(value => value + 1); }}><RefreshCw size={16}/></button>
      </div>
    </header>
    {farmError && <p role="alert" className="alert alert-warning">Não foi possível carregar as fazendas: {farmError}</p>}
    {error && <div role="alert" className="alert alert-danger">{error}<button className="btn btn-sm btn-outline-danger ms-2" onClick={() => { setLoading(true); setRefresh(value => value + 1); }}>Tentar novamente</button></div>}
    <section aria-label="Indicadores da pecuária leiteira" aria-busy={loading} className={styles.metrics}>
      {metrics.map(metric => <article key={metric.label} className={`${shared.metricCard} ${styles.metric}`} data-tone={metric.tone} title={metric.detail}><div className={shared.metricIcon} aria-hidden="true">{metric.icon === "cow" ? <Icon iconNode={cowHead} size={28}/> : <metric.icon size={28}/>}</div><div><span className={styles.metricLabel}>{metric.label}</span>{loading ? <span className={shared.valueSkeleton} aria-label="Carregando"/> : <strong>{typeof metric.value === "number" ? number(metric.value) : metric.value ?? "—"}</strong>}</div></article>)}
    </section>
    <p className={styles.scope}>Produção e média correspondem à data selecionada. As contagens mostram o rebanho bovino identificado atual da fazenda, compartilhado com a área de corte.</p>
    {!loading && !error && data?.milked_cows === 0 && <p className="alert alert-info py-2 small" role="status">Nenhuma ordenha registrada nesta data. Use “Lançar produção de leite” para registrar a produção.</p>}
    <section aria-label="Rotinas da pecuária leiteira" className={styles.shortcuts}>
      {shortcuts.filter(item => (!item.financial || access?.can_view_financial) && (!item.href || canAccessOrganizationPath(access, item.href.split("?")[0]))).map(item => {
        const content = <><div className={styles.shortcutTop}><span className={styles.shortcutIcon} aria-hidden="true">{item.icon === "cow" ? <Icon iconNode={cowHead} size={30}/> : <item.icon size={30}/>}</span>{item.planned ? <span className={styles.badge}>Planejado</span> : <ChevronRight size={22} aria-hidden="true"/>}</div><h2>{item.title}</h2><p>{item.description}</p></>;
        return item.href ? <Link key={item.title} href={item.href} className={styles.shortcut}>{content}</Link> : <article key={item.title} className={`${styles.shortcut} ${styles.planned}`} aria-label={`${item.title}: funcionalidade planejada`}>{content}</article>;
      })}
    </section>
  </div>;
}
