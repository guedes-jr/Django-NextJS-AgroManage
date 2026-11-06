"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Copy,
  MousePointerClick,
  TrendingUp,
  UserCheck,
  UserPlus,
  Wallet,
} from "lucide-react";
import {
  AffiliateCommission,
  AffiliateDashboard,
  AffiliateProfile,
  AffiliateReferral,
  affiliateService,
} from "@/services/affiliateService";
import styles from "./dashboard.module.css";
import { usePublicLocale } from "@/lib/publicLocale";


export default function AffiliateDashboardPage() {
  const { language, t } = usePublicLocale();
const duration = {
  first_payment: t("workspace.firstMonthlyPayment"),
  first_three_payments: t("workspace.first3MonthlyPayments"),
  permanent: t("workspace.allMonthlyPayments"),
};

  const [data, setData] = useState<{
    profile: AffiliateProfile;
    dashboard: AffiliateDashboard;
    referrals: AffiliateReferral[];
    commissions: AffiliateCommission[];
  } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    Promise.all([
      affiliateService.profile(),
      affiliateService.dashboard(),
      affiliateService.referrals(),
      affiliateService.commissions(),
    ])
      .then(([profile, dashboard, referrals, commissions]) =>
        setData({
          profile,
          dashboard,
          referrals: referrals.results,
          commissions: commissions.results,
        }),
      )
      .catch(() => setError(t("workspace.couldNotLoadTheDashboard")));
  }, [t]);
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!data) return <div className={styles.loading}>{t("workspace.loadingDashboard")}</div>;
  const money = (value: string | number) =>
    Number(value).toLocaleString(language, {
      style: "currency",
      currency: "BRL",
    });
  const date = (value: string | null) =>
    value ? new Date(value).toLocaleDateString(language) : "—";
  const percentage = (value: number) =>
    new Intl.NumberFormat(language, {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(value / 100);
  const { profile, dashboard, referrals, commissions } = data;
  const link = `${window.location.origin}${profile.referral_path}`;
  const registrationRate = dashboard.unique_visitors
    ? (dashboard.registrations / dashboard.unique_visitors) * 100
    : 0;
  const salesRate = dashboard.registrations
    ? (dashboard.converted_customers / dashboard.registrations) * 100
    : 0;
  const metrics = [
    {
      label: t("workspace.totalClicks"),
      value: dashboard.clicks,
      detail: `${dashboard.unique_visitors} visitantes únicos`,
      icon: MousePointerClick,
    },
    {
      label: t("workspace.registrations"),
      value: dashboard.registrations,
      detail: `${percentage(registrationRate)} dos visitantes`,
      icon: UserPlus,
    },
    {
      label: t("workspace.convertedCustomers"),
      value: dashboard.converted_customers,
      detail: `${percentage(salesRate)} dos cadastros`,
      icon: UserCheck,
    },
    {
      label: t("workspace.commissionsGenerated"),
      value: money(dashboard.commissions.total),
      detail: `${money(dashboard.commissions.paid)} já pagos`,
      icon: Wallet,
    },
  ];
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>{t("swine.tabOverview")}</span>
          <h1>{t("workspace.performanceDashboard")}</h1>
          <p>{t("workspace.trackYourReferralFunnelAndCommissionBalance")}</p>
        </div>
        <Link
          href="/afiliados/painel/relatorios"
          className={styles.secondaryButton}
        >
          <TrendingUp size={17} /> {t("workspace.viewReport")} </Link>
      </div>
      <section className={styles.linkCard}>
        <div>
          <span>{t("workspace.yourUniqueLink")}</span>
          <strong>{link}</strong>
          <small>
            {profile.commission_type === "percentage"
              ? `${Number(profile.commission_value)}%`
              : money(profile.commission_value)}{" "} {t("workspace.onLabel")} {duration[profile.commission_duration]}
          </small>
        </div>
        <button onClick={copy}>
          {copied ? <Check size={18} /> : <Copy size={18} />}
          {copied ? t("workspace.copied") : t("workspace.copyLink")}
        </button>
      </section>
      <div className={styles.metricGrid}>
        {metrics.map((metric) => (
          <article className={styles.metricCard} key={metric.label}>
            <span className={styles.metricIcon}>
              <metric.icon size={21} />
            </span>
            <div>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
              <small>{metric.detail}</small>
            </div>
          </article>
        ))}
      </div>
      <div className={styles.balanceGrid}>
        <article>
          <span>{t("workspace.pendingBalance")}</span>
          <strong>{money(dashboard.commissions.pending)}</strong>
          <small>{t("workspace.awaitingApproval")}</small>
        </article>
        <article>
          <span>{t("workspace.approvedBalance")}</span>
          <strong>{money(dashboard.commissions.approved)}</strong>
          <small>{t("workspace.availableForPayment")}</small>
        </article>
        <article>
          <span>{t("workspace.totalReceivedLabel")}</span>
          <strong>{money(dashboard.commissions.paid)}</strong>
          <small>{t("workspace.commissionsAlreadyPaid")}</small>
        </article>
        <article>
          <span>{t("workspace.cancelledReversed")}</span>
          <strong>{money(dashboard.commissions.cancelled)}</strong>
          <small>{t("workspace.reversals")} {money(dashboard.reversed_total)}</small>
        </article>
      </div>
      <div className={styles.twoColumns}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>{t("workspace.conversionFunnel")}</h2>
              <p>{t("workspace.fromVisitToPlanSubscription")}</p>
            </div>
          </div>
          <div className={styles.funnel}>
            <div>
              <span>{t("affiliate.uniqueVisitors")}</span>
              <strong>{dashboard.unique_visitors}</strong>
              <i style={{ width: "100%" }} />
            </div>
            <div>
              <span>{t("workspace.registrations")}</span>
              <strong>{dashboard.registrations}</strong>
              <i style={{ width: `${Math.max(registrationRate, 4)}%` }} />
            </div>
            <div>
              <span>{t("workspace.payingCustomers")}</span>
              <strong>{dashboard.converted_customers}</strong>
              <i
                style={{
                  width: `${Math.max(dashboard.unique_visitors ? (dashboard.converted_customers / dashboard.unique_visitors) * 100 : 0, 4)}%`,
                }}
              />
            </div>
          </div>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>{t("workspace.recentCommissions")}</h2>
              <p>{t("workspace.latestWalletEntries")}</p>
            </div>
            <Link href="/afiliados/painel/comissoes"> {t("plantations.harvest.viewAll")} <ArrowRight size={15} />
            </Link>
          </div>
          <div className={styles.list}>
            {commissions.slice(0, 5).map((item) => (
              <div key={item.id}>
                <span className={styles.avatar}>{item.customer.charAt(0)}</span>
                <div>
                  <strong>{item.customer}</strong>
                  <small>
                    {item.plan} • {date(item.conversion_at)}
                  </small>
                </div>
                <div className={styles.amount}>
                  <strong>{money(item.commission_amount)}</strong>
                  <span data-status={item.status}>{item.status_display}</span>
                </div>
              </div>
            ))}
            {!commissions.length && (
              <p className={styles.empty}>{t("workspace.noCommissionsGenerated")}</p>
            )}
          </div>
        </section>
      </div>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>{t("workspace.recentReferrals")}</h2>
            <p>{t("workspace.latestContactsAttributedToYourLink")}</p>
          </div>
          <Link href="/afiliados/painel/indicacoes"> {t("plantations.harvest.viewAll")} <ArrowRight size={15} />
          </Link>
        </div>
        <div className="table-responsive">
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("affiliate.customer")}</th>
                <th>{t("affiliate.plan")}</th>
                <th>{t("affiliate.firstAccess")}</th>
                <th>{t("swine.home.module.registry")}</th>
                <th>{t("users.columnStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {referrals.slice(0, 6).map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.customer}</strong>
                  </td>
                  <td>{item.plan}</td>
                  <td>{date(item.attributed_at)}</td>
                  <td>{date(item.registered_at)}</td>
                  <td>
                    <span data-status={item.status}>{item.status_display}</span>
                  </td>
                </tr>
              ))}
              {!referrals.length && (
                <tr>
                  <td colSpan={5} className={styles.empty}> {t("workspace.noReferralsRecorded")} </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
