"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  VenusAndMars,
  MilkOff,
  Milk,
  Droplets,
  Wheat,
  Factory,
  ShieldPlus,
  ChartNoAxesCombined,
  Cylinder,
  ChevronRight,
  RefreshCw,
  CalendarDays,
} from "lucide-react";
import { CowIcon, BullIcon, LactationIcon } from "./CattleIcons";
import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";
import { canAccessOrganizationPath } from "@/services/organizationAccess";
import { cattleService, cattleError } from "@/services/cattleService";
import { dairyService, type DairyOverview } from "@/services/dairyService";
import shared from "@/components/livestock/species-module-home.module.css";
import base from "./cattle.module.css";
import styles from "./dairy-home.module.css";

const root = "/home/rebanho/bovinos";
const today = () => {
  const day = new Date();
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
};
const number = (value: unknown) =>
  value === null || value === undefined ? "—" : Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

const shortcuts: Array<{
  title: string;
  description: string;
  href?: string;
  icon: any;
  tone: "green" | "orange" | "purple" | "blue" | "cyan" | "emerald" | "pink" | "slate";
  financial?: boolean;
  planned?: boolean;
}> = [
  {
    title: "Cadastro",
    description: "Vacas, bezerras, touros e lotes",
    href: `${root}/pecuaria-leiteira/cadastro`,
    icon: ClipboardList,
    tone: "green",
  },
  {
    title: "Lançar produção de leite",
    description: "Registre ordenhas, turnos e descartes",
    href: `${root}/leite`,
    icon: Milk,
    tone: "cyan",
  },
  {
    title: "Reprodução",
    description: "Coberturas, diagnóstico, gestação e parto",
    href: `${root}/reproducao`,
    icon: VenusAndMars,
    tone: "purple",
  },
  {
    title: "Bezerras e novilhas",
    description: "Acompanhe o desenvolvimento das fêmeas jovens",
    href: `${root}/pecuaria-leiteira/cadastro?group=young-females`,
    icon: CowIcon,
    tone: "pink",
  },
  {
    title: "Sanidade",
    description: "Vacinações, tratamentos e carências",
    href: `${root}/sanidade`,
    icon: ShieldPlus,
    tone: "emerald",
  },
  {
    title: "Alimentação",
    description: "Planeje e acompanhe o fornecimento de alimentos",
    href: `${root}/racao`,
    icon: Wheat,
    tone: "blue",
  },
  {
    title: "Fábrica de ração",
    description: "Formule e produza a ração do rebanho",
    href: `${root}/racao/producao`,
    icon: Factory,
    tone: "orange",
    financial: true,
  },
  {
    title: "Tanque de leite",
    description: "Coletas e qualidade do leite",
    icon: Cylinder,
    tone: "slate",
    planned: true,
  },
  {
    title: "Relatórios",
    description: "Consulte e exporte os registros do rebanho",
    href: `${root}/relatorios`,
    icon: ChartNoAxesCombined,
    tone: "cyan",
    financial: true,
  },
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
    cattleService
      .farms(controller.signal)
      .then(setFarms)
      .catch((err) => {
        if (!controller.signal.aborted) setFarmError(cattleError(err));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    dairyService
      .overview(date, farm, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError("");
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(cattleError(err));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, farm, refresh]);

  const metrics = [
    { label: "Vacas em lactação", value: data?.lactating_cows, icon: LactationIcon, tone: "green", detail: "Fêmeas identificadas em lactação atualmente" },
    { label: date === today() ? "Produção de hoje" : "Produção do dia", value: data ? `${number(data.produced_liters)} L` : undefined, icon: Milk, tone: "blue", detail: "Soma das ordenhas registradas na data" },
    { label: "Média por vaca ordenhada", value: data ? (data.average_per_milked_cow === null ? "—" : `${number(data.average_per_milked_cow)} L`) : undefined, icon: Droplets, tone: "green", detail: `${data?.milked_cows || 0} vacas com ordenha registrada no dia` },
    { label: "Leite aproveitável", value: data ? `${number(data.usable_liters)} L` : undefined, icon: Milk, tone: "emerald", detail: `Produção menos ${number(data?.discarded_liters)} L de descarte` },
    { label: "Total de vacas", value: data?.total_cows, icon: CowIcon, tone: "blue", detail: "Vacas e matrizes identificadas ativas" },
    { label: "Vacas fora de lactação", value: data?.non_lactating_cows, icon: MilkOff, tone: "amber", detail: "Vacas e matrizes ativas sem indicação de lactação" },
    { label: "Bezerras / novilhas", value: data?.young_females, icon: CowIcon, tone: "slate", detail: "Fêmeas identificadas ativas nessas categorias" },
    { label: "Touros", value: data?.bulls, icon: BullIcon, tone: "green", detail: "Touros e reprodutores identificados ativos" },
  ];

  return (
    <div className={`${base.page} ${styles.page}`}>
      <header className={base.header}>
        <div className={base.brand}>
          <div className={shared.titleIcon} aria-hidden="true">
            <LactationIcon size={27} strokeWidth={1.8} />
          </div>
          <div>
            <h1>Pecuária leiteira</h1>
            <p>Ordenhas, lactação, reprodução e cuidados do rebanho leiteiro</p>
          </div>
        </div>
        <div className={styles.filters}>
          <label>
            <span>Fazenda</span>
            <select
              className="form-select form-select-sm"
              value={farm}
              onChange={(event) => {
                setLoading(true);
                setFarm(event.target.value);
              }}
            >
              <option value="">Todas as fazendas</option>
              {farms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              <CalendarDays size={14} aria-hidden="true" /> Data da produção
            </span>
            <input
              type="date"
              className="form-control form-control-sm"
              required
              max={today()}
              value={date}
              onChange={(event) => {
                if (event.target.value) {
                  setLoading(true);
                  setDate(event.target.value);
                }
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            disabled={loading}
            aria-label="Atualizar indicadores"
            onClick={() => {
              setLoading(true);
              setRefresh((v) => v + 1);
            }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      {farmError && <p role="alert" className="alert alert-warning">Não foi possível carregar as fazendas: {farmError}</p>}
      {error && (
        <div role="alert" className="alert alert-danger">
          {error}
          <button
            className="btn btn-sm btn-outline-danger ms-2"
            onClick={() => {
              setLoading(true);
              setRefresh((v) => v + 1);
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}

      <section className={shared.summaryPanel} aria-labelledby="dairy-summary-title">
        <div className={shared.sectionHeading}>
          <div>
            <span>Visão geral do plantel leiteiro</span>
            <h2 id="dairy-summary-title">Resumo · Pecuária leiteira</h2>
          </div>
          <small className={base.summaryScope}>{farm ? farms.find((item) => item.id === farm)?.name : "Todas as fazendas"}</small>
        </div>

        <div className={shared.metricsGrid} aria-busy={loading}>
          {metrics.map((metric) => (
            <article key={metric.label} className={`${shared.metricCard} ${base.overviewMetric}`} data-tone={metric.tone} title={metric.detail}>
              <div className={shared.metricIcon} aria-hidden="true">
                <metric.icon size={25} strokeWidth={1.8} />
              </div>
              <div>
                <strong>{loading ? <span className={shared.valueSkeleton} aria-label="Carregando" /> : typeof metric.value === "number" ? number(metric.value) : metric.value ?? "—"}</strong>
                <span>{metric.label}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <p className={styles.scope}>
        Produção e média correspondem à data selecionada. As contagens mostram o rebanho bovino identificado atual da fazenda, compartilhado com a área de corte.
      </p>

      {!loading && !error && data?.milked_cows === 0 && (
        <p className="alert alert-info py-2 small" role="status">
          Nenhuma ordenha registrada nesta data. Use “Lançar produção de leite” para registrar a produção.
        </p>
      )}

      <section aria-labelledby="dairy-modules-title" className={base.operations}>
        <div className={shared.modulesHeading}>
          <div>
            <span>Operações</span>
            <h2 id="dairy-modules-title">O que você deseja acessar?</h2>
          </div>
          <p>Escolha uma área para continuar a gestão do rebanho leiteiro.</p>
        </div>

        <div className={shared.moduleGrid}>
          {shortcuts
            .filter((item) => (!item.financial || access?.can_view_financial) && (!item.href || canAccessOrganizationPath(access, item.href.split("?")[0])))
            .map((item) => {
              const cardContent = (
                <>
                  <div className={shared.moduleIcon} aria-hidden="true">
                    <item.icon size={26} strokeWidth={1.8} />
                  </div>
                  <div className={shared.moduleCopy}>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                  <span className={shared.moduleAction}>
                    {item.planned ? (
                      <span className={styles.badge}>Planejado</span>
                    ) : (
                      <>
                        Acessar <ChevronRight size={19} aria-hidden="true" />
                      </>
                    )}
                  </span>
                </>
              );

              return item.href ? (
                <Link key={item.title} href={item.href} className={shared.moduleCard} data-tone={item.tone}>
                  {cardContent}
                </Link>
              ) : (
                <article key={item.title} className={`${shared.moduleCard} ${styles.planned}`} data-tone={item.tone} aria-label={`${item.title}: funcionalidade planejada`}>
                  {cardContent}
                </article>
              );
            })}
        </div>
      </section>
    </div>
  );
}
