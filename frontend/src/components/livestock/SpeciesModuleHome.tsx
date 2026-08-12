"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import {
  BellRing,
  ChevronRight,
  ClipboardList,
  Factory,
  FileChartColumnIncreasing,
  Icon,
  MarsStroke,
  Wheat,
  type LucideProps,
} from "lucide-react";
import { pig, pigHead } from "@lucide/lab";
import apiClient from "@/services/api";
import styles from "./species-module-home.module.css";

type SpeciesCode = "suinos";
type ModuleIcon = ComponentType<LucideProps>;

interface SpeciesModuleHomeProps {
  species: SpeciesCode;
}

interface SpeciesSummary {
  species: string;
  total_animals: number;
  active_females: number;
  active_alerts: number;
}

const PigIcon: ModuleIcon = (props) => <Icon iconNode={pig} {...props} />;
const PigHeadIcon: ModuleIcon = (props) => <Icon iconNode={pigHead} {...props} />;

const modules: Array<{
  title: string;
  description: string;
  href: string;
  icon: ModuleIcon;
  tone: "green" | "orange" | "purple" | "blue" | "cyan";
}> = [
  {
    title: "Cadastro",
    description: "Animais, matrizes e lotes",
    href: "/home/rebanho/suinos/cadastro",
    icon: ClipboardList,
    tone: "green",
  },
  {
    title: "Fábrica de Ração",
    description: "Fórmulas, produção e custos",
    href: "/home/rebanho/suinos/racao?tab=producao",
    icon: Factory,
    tone: "orange",
  },
  {
    title: "Reprodução",
    description: "Matrizes, coberturas e partos",
    href: "/home/rebanho/suinos/reproducao",
    icon: MarsStroke,
    tone: "purple",
  },
  {
    title: "Alimentação dos Animais",
    description: "Consumo por fase e por lote",
    href: "/home/rebanho/suinos/racao?tab=lotes",
    icon: Wheat,
    tone: "blue",
  },
  {
    title: "Relatórios",
    description: "Indicadores e análises do plantel",
    href: "/home/relatorios/rebanho?species=suinos",
    icon: FileChartColumnIncreasing,
    tone: "cyan",
  },
];

const numberFormatter = new Intl.NumberFormat("pt-BR");

export function SpeciesModuleHome({ species }: SpeciesModuleHomeProps) {
  const [summary, setSummary] = useState<SpeciesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient
      .get<SpeciesSummary>("/livestock/dashboard/species-summary/", { params: { species } })
      .then(({ data }) => {
        if (active) setSummary(data);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [species]);

  const metrics = [
    {
      label: "Total de Animais",
      value: summary?.total_animals,
      icon: PigIcon,
      tone: "rose",
    },
    {
      label: "Matrizes Ativas",
      value: summary?.active_females,
      icon: PigHeadIcon,
      tone: "pink",
    },
    {
      label: "Alertas",
      value: summary?.active_alerts,
      icon: BellRing,
      tone: "amber",
    },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleIcon} aria-hidden="true">
          <PigHeadIcon size={30} />
        </div>
        <div>
          <h1>Suínos</h1>
          <p>Gerencie todas as operações da suinocultura</p>
        </div>
      </header>

      <section className={styles.summaryPanel} aria-labelledby="swine-summary-title">
        <div className={styles.sectionHeading}>
          <div>
            <span>Visão geral do plantel</span>
            <h2 id="swine-summary-title">Resumo da Suinocultura</h2>
          </div>
          {error && <small>Não foi possível atualizar os indicadores.</small>}
        </div>

        <div className={styles.metricsGrid} aria-busy={loading}>
          {metrics.map((metric) => (
            <article className={styles.metricCard} data-tone={metric.tone} key={metric.label}>
              <div className={styles.metricIcon} aria-hidden="true">
                <metric.icon size={31} strokeWidth={1.9} />
              </div>
              <div>
                {loading ? (
                  <span className={styles.valueSkeleton} />
                ) : (
                  <strong>{numberFormatter.format(metric.value ?? 0)}</strong>
                )}
                <span>{metric.label}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="swine-modules-title">
        <div className={styles.modulesHeading}>
          <div>
            <span>Operações</span>
            <h2 id="swine-modules-title">O que você deseja acessar?</h2>
          </div>
          <p>Escolha uma área para continuar o manejo do plantel.</p>
        </div>

        <div className={styles.moduleGrid}>
          {modules.map((module) => (
            <Link className={styles.moduleCard} data-tone={module.tone} href={module.href} key={module.title}>
              <div className={styles.moduleIcon} aria-hidden="true">
                <module.icon size={39} strokeWidth={1.75} />
              </div>
              <div className={styles.moduleCopy}>
                <h3>{module.title}</h3>
                <p>{module.description}</p>
              </div>
              <span className={styles.moduleAction}>
                Acessar <ChevronRight size={19} />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
