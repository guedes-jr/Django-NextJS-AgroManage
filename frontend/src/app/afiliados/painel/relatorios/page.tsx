"use client";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import {
  AffiliateCommission,
  AffiliateDashboard,
  AffiliateReferral,
  affiliateService,
} from "@/services/affiliateService";
import styles from "../section.module.css";
import { usePublicLocale } from "@/lib/publicLocale";
export default function ReportsPage() {
  const { language, t } = usePublicLocale();
  const money = (value: number | string) =>
    Number(value).toLocaleString(language, { style: "currency", currency: "BRL" });
  const [dashboard, setDashboard] = useState<AffiliateDashboard | null>(null);
  const [referrals, setReferrals] = useState<AffiliateReferral[]>([]);
  const [commissions, setCommissions] = useState<AffiliateCommission[]>([]);
  useEffect(() => {
    Promise.all([
      affiliateService.dashboard(),
      affiliateService.referrals(),
      affiliateService.commissions(),
    ]).then(([d, r, c]) => {
      setDashboard(d);
      setReferrals(r.results);
      setCommissions(c.results);
    });
  }, []);
  const months = useMemo(
    () =>
      Array.from({ length: 6 }, (_, offset) => {
        const base = new Date();
        base.setMonth(base.getMonth() - (5 - offset));
        const amount = commissions
          .filter((c) => {
            const d = new Date(c.conversion_at);
            return (
              d.getMonth() === base.getMonth() &&
              d.getFullYear() === base.getFullYear()
            );
          })
          .reduce((sum, c) => sum + Number(c.commission_amount), 0);
        return {
          label: base
            .toLocaleDateString(language, { month: "short" })
            .replace(".", ""),
          amount,
        };
      }),
    [commissions, language],
  );
  const max = Math.max(...months.map((m) => m.amount), 1);
  const exportCsv = () => {
    const rows = [
      [
        "Cliente",
        "Organização",
        "Plano",
        "Fatura",
        "Valor da contratação",
        "Comissão",
        "Status",
        "Conversão",
      ],
      ...commissions.map((c) => [
        c.customer,
        c.organization,
        c.plan,
        c.invoice,
        c.transaction_amount,
        c.commission_amount,
        c.status_display,
          new Date(c.conversion_at).toLocaleDateString(language),
      ]),
    ];
    const csv =
      "\ufeff" +
      rows
        .map((row) =>
          row
            .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
            .join(";"),
        )
        .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `relatorio-afiliado-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  if (!dashboard)
    return <div className={styles.loading}>Carregando relatório…</div>;
  const visitorRate = dashboard.unique_visitors
    ? (dashboard.registrations / dashboard.unique_visitors) * 100
    : 0;
  const conversionRate = dashboard.registrations
    ? (dashboard.converted_customers / dashboard.registrations) * 100
    : 0;
  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1>{t("affiliate.reports")}</h1>
        <p>{t("affiliate.reportsDescription")}</p>
      </div>
      <div className={styles.toolbar}>
        <span>{t("affiliate.consolidatedView")}</span>
        <button onClick={exportCsv}>
          <Download size={16} /> {t("affiliate.exportCsv")}
        </button>
      </div>
      <div className={styles.summary}>
        <article>
          <span>{t("affiliate.uniqueVisitors")}</span>
          <strong>{dashboard.unique_visitors}</strong>
        </article>
        <article>
          <span>{t("affiliate.registrationRate")}</span>
          <strong>{new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 1 }).format(visitorRate / 100)}</strong>
        </article>
        <article>
          <span>{t("affiliate.conversionRate")}</span>
          <strong>{new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 1 }).format(conversionRate / 100)}</strong>
        </article>
        <article>
          <span>{t("affiliate.commissionRevenue")}</span>
          <strong>{money(dashboard.commissions.total)}</strong>
        </article>
      </div>
      <div className={styles.reportGrid}>
        <section className={styles.panel}>
          <div className={styles.heading}>
            <h1 style={{ fontSize: "1rem" }}>{t("affiliate.lastSixMonths")}</h1>
          </div>
          <div className={styles.chart}>
            {months.map((month) => (
              <div key={month.label} title={money(month.amount)}>
                <i
                  style={{
                    height: `${Math.max((month.amount / max) * 100, 3)}%`,
                  }}
                />
                <span>{month.label}</span>
              </div>
            ))}
          </div>
        </section>
        <section className={styles.panel}>
          <div className={styles.heading}>
            <h1 style={{ fontSize: "1rem" }}>{t("affiliate.performanceInsights")}</h1>
          </div>
          <div className={styles.insights}>
            <div>
              <strong>{referrals.length} indicações registradas</strong>
              <span>Contatos atribuídos permanentemente ao seu código.</span>
            </div>
            <div>
              <strong>{dashboard.converted_customers} clientes pagantes</strong>
              <span>Clientes que concluíram uma contratação válida.</span>
            </div>
            <div>
              <strong>
                {money(dashboard.commissions.approved)} disponível
              </strong>
              <span>Saldo aprovado que aguarda pagamento administrativo.</span>
            </div>
            <div>
              <strong>{money(dashboard.commissions.paid)} recebido</strong>
              <span>Total de comissões marcadas como pagas.</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
