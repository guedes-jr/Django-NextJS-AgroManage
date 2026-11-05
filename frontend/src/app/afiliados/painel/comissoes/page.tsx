"use client";
import { useEffect, useState } from "react";
import {
  AffiliateCommission,
  affiliateService,
} from "@/services/affiliateService";
import styles from "../section.module.css";
import { usePublicLocale } from "@/lib/publicLocale";
export default function CommissionsPage() {
  const { language, t } = usePublicLocale();
  const money = (value: string | number) =>
    Number(value).toLocaleString(language, { style: "currency", currency: "BRL" });
  const date = (value: string) => new Date(value).toLocaleDateString(language);
  const [items, setItems] = useState<AffiliateCommission[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    affiliateService
      .commissions()
      .then((r) => setItems(r.results))
      .finally(() => setLoading(false));
  }, []);
  const shown =
    filter === "all" ? items : items.filter((i) => i.status === filter);
  const sum = (status?: string) =>
    items
      .filter((i) => !status || i.status === status)
      .reduce(
        (a, i) => a + Number(i.commission_amount) - Number(i.reversed_amount),
        0,
      );
  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1>{t("affiliate.commissions")}</h1>
        <p>{t("affiliate.commissionsDescription")}</p>
      </div>
      <div className={styles.summary}>
        <article>
          <span>{t("affiliate.netTotal")}</span>
          <strong>{money(sum())}</strong>
        </article>
        <article>
          <span>{t("affiliate.pending")}</span>
          <strong>{money(sum("pending"))}</strong>
        </article>
        <article>
          <span>{t("affiliate.approved")}</span>
          <strong>{money(sum("approved"))}</strong>
        </article>
        <article>
          <span>{t("affiliate.paid")}</span>
          <strong>{money(sum("paid"))}</strong>
        </article>
      </div>
      <div className={styles.toolbar}>
        <label htmlFor="commission-status">{t("affiliate.filterStatus")}</label>
        <select
          id="commission-status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">{t("affiliate.all")}</option>
          <option value="pending">{t("affiliate.pending")}</option>
          <option value="approved">{t("affiliate.approved")}</option>
          <option value="paid">{t("affiliate.paid")}</option>
          <option value="cancelled">{t("affiliate.cancelled")}</option>
        </select>
      </div>
      <section className={styles.panel}>
        <div className="table-responsive">
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("affiliate.customer")}</th>
                <th>{t("affiliate.plan")}</th>
                <th>{t("affiliate.invoice")}</th>
                <th>{t("affiliate.monthlyFee")}</th>
                <th>{t("affiliate.commission")}</th>
                <th>{t("affiliate.date")}</th>
                <th>{t("affiliate.status")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id}>
                  <td>
                    <strong>{i.customer}</strong>
                  </td>
                  <td>{i.plan}</td>
                  <td>{i.invoice}</td>
                  <td>{money(i.transaction_amount)}</td>
                  <td>
                    <strong>
                      {money(
                        Number(i.commission_amount) - Number(i.reversed_amount),
                      )}
                    </strong>
                  </td>
                  <td>{date(i.conversion_at)}</td>
                  <td>
                    <span className={styles.badge} data-status={i.status}>
                      {i.status_display}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && !shown.length && (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    {t("affiliate.noCommissions")}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={7} className={styles.loading}>
                    {t("affiliate.loading")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
