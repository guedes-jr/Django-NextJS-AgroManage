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
  BadgeDollarSign,
  UsersRound,
  Wheat,
  type LucideProps,
} from "lucide-react";
import { pig, pigHead } from "@lucide/lab";
import apiClient from "@/services/api";
import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";
import { type TranslationKey, useOrganizationLocale } from "@/lib/locale";
import styles from "./species-module-home.module.css";
import { SwineOverviewInsights } from "./SwineOverviewInsights";

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
  feed_consumed_month: number;
  feed_cost_month: number;
  semen_doses_month: number;
  semen_cost_month: number;
}

const PigIcon: ModuleIcon = (props) => <Icon iconNode={pig} {...props} />;
const PigHeadIcon: ModuleIcon = (props) => <Icon iconNode={pigHead} {...props} />;

const modules: Array<{
  title: TranslationKey;
  description: TranslationKey;
  href: string;
  icon: ModuleIcon;
  tone: "green" | "orange" | "purple" | "blue" | "cyan" | "emerald" | "slate";
  operatorVisible?: boolean;
}> = [
  {
    title: "swine.home.module.registry",
    description: "swine.home.module.registryDescription",
    href: "/home/seguimento/suinos/cadastro",
    icon: ClipboardList,
    tone: "green",
    operatorVisible: true,
  },
  {
    title: "swine.home.module.reproduction",
    description: "swine.home.module.reproductionDescription",
    href: "/home/seguimento/suinos/reproducao",
    icon: MarsStroke,
    tone: "purple",
    operatorVisible: true,
  },
  {
    title: "swine.home.module.feeding",
    description: "swine.home.module.feedingDescription",
    href: "/home/seguimento/suinos/racao?tab=lotes",
    icon: Wheat,
    tone: "blue",
    operatorVisible: true,
  },
  {
    title: "swine.home.module.feedMill",
    description: "swine.home.module.feedMillDescription",
    href: "/home/seguimento/suinos/racao?tab=producao",
    icon: Factory,
    tone: "orange",
  },
  {
    title: "swine.home.module.sales",
    description: "swine.home.module.salesDescription",
    href: "/home/seguimento/suinos/vendas",
    icon: BadgeDollarSign,
    tone: "emerald",
  },
  {
    title: "swine.home.module.workforce",
    description: "swine.home.module.workforceDescription",
    href: "/home/seguimento/suinos/mao-de-obra",
    icon: UsersRound,
    tone: "slate",
  },
  {
    title: "swine.home.module.reports",
    description: "swine.home.module.reportsDescription",
    href: "/home/relatorios/rebanho?species=suinos",
    icon: FileChartColumnIncreasing,
    tone: "cyan",
  },
];

export function SpeciesModuleHome({ species }: SpeciesModuleHomeProps) {
  const access = useOrganizationAccess();
  const operator = access?.role === "operator";
  const { language, t } = useOrganizationLocale();
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

  const metrics: Array<{ label: TranslationKey; value?: string | number; icon: ModuleIcon; tone: string; sensitive?: boolean }> = [
    {
      label: "swine.home.totalAnimals",
      value: summary?.total_animals,
      icon: PigIcon,
      tone: "rose",
    },
    {
      label: "swine.home.activeFemales",
      value: summary?.active_females,
      icon: PigHeadIcon,
      tone: "pink",
    },
    {
      label: "swine.home.activeAlerts",
      value: summary?.active_alerts,
      icon: BellRing,
      tone: "amber",
    },
    {
      label: "swine.home.feedConsumed",
      value: summary?.feed_consumed_month,
      icon: Wheat,
      tone: "blue",
    },
    {
      label: "swine.home.feedCost",
      value: summary ? summary.feed_cost_month?.toLocaleString(language, { style: "currency", currency: "BRL" }) : undefined,
      icon: BadgeDollarSign,
      tone: "emerald",
      sensitive: true,
    },
    {
      label: "swine.home.semenDoses",
      value: summary?.semen_doses_month,
      icon: MarsStroke,
      tone: "purple",
    },
    {
      label: "swine.home.semenCost",
      value: summary ? summary.semen_cost_month?.toLocaleString(language, { style: "currency", currency: "BRL" }) : undefined,
      icon: BadgeDollarSign,
      tone: "cyan",
      sensitive: true,
    },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleIcon} aria-hidden="true">
          <PigHeadIcon size={30} />
        </div>
        <div>
          <h1>{t("swine.home.title")}</h1>
          <p>{t("swine.home.description")}</p>
        </div>
      </header>

      <section className={styles.summaryPanel} aria-labelledby="swine-summary-title">
        <div className={styles.sectionHeading}>
          <div>
            <span>{t("swine.home.overview")}</span>
            <h2 id="swine-summary-title">{t("swine.home.summary")}</h2>
          </div>
          {error && <small>{t("swine.home.loadFailed")}</small>}
        </div>

        <div className={styles.metricsGrid} aria-busy={loading}>
          {metrics.filter((metric) => !operator || !metric.sensitive).map((metric) => (
            <article className={styles.metricCard} data-tone={metric.tone} key={metric.label}>
              <div className={styles.metricIcon} aria-hidden="true">
                <metric.icon size={31} strokeWidth={1.9} />
              </div>
              <div>
                {loading ? (
                  <span className={styles.valueSkeleton} />
                ) : (
                  <strong>{typeof metric.value === "number" ? metric.value.toLocaleString(language) : metric.value ?? "0"}</strong>
                )}
                <span>{t(metric.label)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="swine-modules-title">
        <div className={styles.modulesHeading}>
          <div>
            <span>{t("swine.home.operations")}</span>
            <h2 id="swine-modules-title">{t("swine.home.chooseModule")}</h2>
          </div>
          <p>{t("swine.home.chooseDescription")}</p>
        </div>

        <div className={styles.moduleGrid}>
          {modules.filter((module) => !operator || module.operatorVisible).map((module) => (
            <Link className={styles.moduleCard} data-tone={module.tone} href={module.href} key={module.title}>
              <div className={styles.moduleIcon} aria-hidden="true">
                <module.icon size={39} strokeWidth={1.75} />
              </div>
              <div className={styles.moduleCopy}>
                <h3>{t(module.title)}</h3>
                <p>{t(module.description)}</p>
              </div>
              <span className={styles.moduleAction}>
                {t("swine.home.open")} <ChevronRight size={19} />
              </span>
            </Link>
          ))}
        </div>
      </section>
      {!operator && <SwineOverviewInsights />}
    </div>
  );
}
