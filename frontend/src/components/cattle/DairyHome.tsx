"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { cattleHref, cattleHome } from "@/services/cattleNavigation";
import {
  type LucideProps,
  ClipboardList,
  VenusAndMars,
  MilkOff,
  Milk,
  Droplets,
  Wheat,
  Factory,
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
import { useOrganizationLocale } from "@/lib/locale";
import shared from "@/components/livestock/species-module-home.module.css";
import base from "./cattle.module.css";
import styles from "./dairy-home.module.css";

const root = cattleHome("dairy");
const today = () => {
  const day = new Date();
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
};


export function DairyHome() {
  const access = useOrganizationAccess();
  const { language, t } = useOrganizationLocale();
const shortcuts: Array<{
  title: string;
  description: string;
  href?: string;
  icon: ComponentType<LucideProps>;
  tone: "green" | "orange" | "purple" | "blue" | "cyan" | "emerald" | "pink" | "slate" | "amber";
  financial?: boolean;
  planned?: boolean;
}> = [
  {
    title: t("workspace.recordMilkProduction"),
    description: t("workspace.recordMilkingsSessionsAndDiscardsPerCowOrAsA"),
    href: `${root}/leite`,
    icon: Milk,
    tone: "cyan",
  },
  {
    title: t("workspace.recordFeed"),
    description: t("workspace.recordFeedSupplyPerBatchWithStockDeduction"),
    href: `${root}/racao/tratos`,
    icon: Wheat,
    tone: "orange",
    financial: true,
  },
  {
    title: t("workspace.milkTank"),
    description: t("workspace.milkCollectionsAndQuality"),
    icon: Cylinder,
    tone: "slate",
    href: `${root}/tanque-de-leite`,
  },
  {
    title: t("cattleReproduction.production"),
    description: t("workspace.matingsDiagnosisPregnancyAndCalving"),
    href: `${root}/reproducao?production=dairy`,
    icon: VenusAndMars,
    tone: "purple",
  },
  {
    title: t("swine.home.module.registry"),
    description: t("workspace.cowsCalvesBullsAndBatches"),
    href: `${root}/cadastro`,
    icon: ClipboardList,
    tone: "green",
  },
  {
    title: t("swine.home.module.feedMill"),
    description: t("workspace.formulateAndProduceFeedForTheHerd"),
    href: `${root}/racao/producao`,
    icon: Factory,
    tone: "orange",
    financial: true,
  },
  {
    title: t("swine.home.module.reports"),
    description: t("workspace.viewHerdFeedingCostsAndRecords"),
    href: `${root}/relatorios?production=dairy`,
    icon: ChartNoAxesCombined,
    tone: "cyan",
    financial: true,
  },
];

  const number = (value: unknown) =>
    value === null || value === undefined ? "—" : Number(value).toLocaleString(language, { maximumFractionDigits: 1 });
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
        if (!controller.signal.aborted) setFarmError(cattleError(err, language));
      });
    return () => controller.abort();
  }, [language]);

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
          setError(cattleError(err, language));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, farm, refresh, language]);

  const metrics = [
    { label: t("workspace.lactatingCows"), value: data?.lactating_cows, icon: LactationIcon, tone: "green", detail: t("workspace.identifiedFemalesCurrentlyLactating") },
    { label: t("workspace.monthlyProduction"), value: data ? `${number(data.monthly_produced_liters)} L` : undefined, icon: Milk, tone: "blue", detail: t("workspace.cumulativeProductionFromTheStartOfTheMonthToThe") },
    { label: t("workspace.monthlyAveragePerCow"), value: data ? (data.monthly_average_per_lactating_cow === null ? "—" : `${number(data.monthly_average_per_lactating_cow)} L`) : undefined, icon: Droplets, tone: "green", detail: t("workspace.monthlyProductionDividedByCountLactatingCows", { count: data?.lactating_cows || 0 }) },
    { label: t("workspace.discardedMilk"), value: data ? `${number(data.monthly_discarded_liters)} L` : undefined, icon: MilkOff, tone: "amber", detail: t("workspace.cumulativeDiscardsFromTheStartOfTheMonthToThe") },
    { label: t("workspace.totalCows"), value: data?.total_cows, icon: CowIcon, tone: "blue", detail: t("workspace.activeIdentifiedCowsAndBreedingFemales") },
    { label: t("cattleReproduction.dry"), value: data?.non_lactating_cows, icon: MilkOff, tone: "amber", detail: t("workspace.activeCowsAndBreedingFemalesNotMarkedAsLactating") },
    { label: t("workspace.femaleCalvesHeifers"), value: data?.young_females, icon: CowIcon, tone: "slate", detail: t("workspace.activeIdentifiedFemalesInTheseCategories") },
    { label: t("workspace.bulls"), value: data?.bulls, icon: BullIcon, tone: "green", detail: t("workspace.activeIdentifiedBullsAndBreedingMales") },
  ];

  return (
    <div className={`${base.page} ${styles.page}`}>
      <header className={base.header}>
        <div className={base.brand}>
          <div className={shared.titleIcon} aria-hidden="true">
            <LactationIcon size={27} strokeWidth={1.8} />
          </div>
          <div>
            <h1>{t("dairy.home.title")}</h1>
            <p>{t("dairy.home.description")}</p>
          </div>
        </div>
        <div className={styles.filters}>
          <label>
            <span>{t("dairy.home.farm")}</span>
            <select
              className="form-select form-select-sm"
              value={farm}
              onChange={(event) => {
                setLoading(true);
                setFarm(event.target.value);
              }}
            >
              <option value="">{t("dairy.home.allFarms")}</option>
              {farms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              <CalendarDays size={14} aria-hidden="true" /> {t("dairy.home.referenceDate")}
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
            aria-label={t("dairy.home.refresh")}
            onClick={() => {
              setLoading(true);
              setRefresh((v) => v + 1);
            }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      {farmError && <p role="alert" className="alert alert-warning">{t("workspace.couldNotLoadFarms")} {farmError}</p>}
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

            {t("lotReport.retry")}
          </button>
        </div>
      )}

      <section className={shared.summaryPanel} aria-labelledby="dairy-summary-title">
        <div className={shared.sectionHeading}>
          <div>
            <span>{t("workspace.dairyHerdOverview")}</span>
            <h2 id="dairy-summary-title">{t("workspace.summaryDairyFarming")}</h2>
          </div>
          <small className={base.summaryScope}>{farm ? farms.find((item) => item.id === farm)?.name : t("dairy.home.allFarms")}</small>
        </div>

        <div className={shared.metricsGrid} aria-busy={loading}>
          {metrics.map((metric) => (
            <article key={metric.label} className={`${shared.metricCard} ${base.overviewMetric}`} data-tone={metric.tone} title={metric.detail}>
              <div className={shared.metricIcon} aria-hidden="true">
                <metric.icon size={25} strokeWidth={1.8} />
              </div>
              <div>
                <strong>{loading ? <span className={shared.valueSkeleton} aria-label={t("workspace.loading")} /> : typeof metric.value === "number" ? number(metric.value) : metric.value ?? "—"}</strong>
                <span>{metric.label}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <p className={styles.scope}>

        {t("workspace.productionDiscardsAndAveragesAccumulateRecordsFromTheStartOf")}
      </p>

      {!loading && !error && data?.milked_cows === 0 && (
        <div className="alert alert-info py-2 small d-flex flex-wrap align-items-center justify-content-between gap-2" role="status">
          <span>{t("workspace.noMilkingsRecordedOnThisDate")}</span>
          <Link href={cattleHref(`${root}/leite`, "dairy")} className="btn btn-outline-success btn-sm">

            {t("workspace.recordMilkProduction")}
          </Link>
        </div>
      )}

      <section aria-labelledby="dairy-modules-title" className={base.operations}>
        <div className={shared.modulesHeading}>
          <div>
            <span>{t("swine.home.operations")}</span>
            <h2 id="dairy-modules-title">{t("swine.home.chooseModule")}</h2>
          </div>
          <p>{t("workspace.startWithDailyEntriesThenReviewAnimalsManagementAndReports")}</p>
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
                      <span className={styles.badge}>{t("workspace.planned")}</span>
                    ) : (
                      <>

                        {t("swine.home.open")} <ChevronRight size={19} aria-hidden="true" />
                      </>
                    )}
                  </span>
                </>
              );

              return item.href ? (
                <Link key={item.title} href={cattleHref(item.href, "dairy")} className={shared.moduleCard} data-tone={item.tone}>
                  {cardContent}
                </Link>
              ) : (
                <article key={item.title} className={`${shared.moduleCard} ${styles.planned}`} data-tone={item.tone} aria-label={t("workspace.titlePlannedFeature", { title: item.title })}>
                  {cardContent}
                </article>
              );
            })}
        </div>
      </section>
    </div>
  );
}
