"use client";
import { useEffect, useState } from "react";
import {
  AffiliateReferral,
  affiliateService,
} from "@/services/affiliateService";
import styles from "../section.module.css";
import { usePublicLocale } from "@/lib/publicLocale";
export default function ReferralsPage() {
  const { language, t } = usePublicLocale();
  const [items, setItems] = useState<AffiliateReferral[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    affiliateService
      .referrals()
      .then((r) => setItems(r.results))
      .finally(() => setLoading(false));
  }, []);
  const shown =
    filter === "all" ? items : items.filter((i) => i.status === filter);
  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1>{t("affiliate.referrals")}</h1>
        <p>
          {t("affiliate.referralsDescription")}
        </p>
      </div>
      <div className={styles.summary}>
        <article>
          <span>{t("affiliate.totalAttributed")}</span>
          <strong>{items.length}</strong>
        </article>
        <article>
          <span>{t("affiliate.visitors")}</span>
          <strong>{items.filter((i) => i.status === "visited").length}</strong>
        </article>
        <article>
          <span>{t("affiliate.registered")}</span>
          <strong>
            {items.filter((i) => i.status === "registered").length}
          </strong>
        </article>
        <article>
          <span>{t("affiliate.converted")}</span>
          <strong>
            {items.filter((i) => i.status === "converted").length}
          </strong>
        </article>
      </div>
      <div className={styles.toolbar}>
        <label htmlFor="ref-status">{t("affiliate.filterStatus")}</label>
        <select
          id="ref-status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">{t("affiliate.all")}</option>
          <option value="visited">{t("affiliate.visited")}</option>
          <option value="registered">{t("affiliate.registered")}</option>
          <option value="converted">{t("affiliate.converted")}</option>
        </select>
      </div>
      <section className={styles.panel}>
        <div className="table-responsive">
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("affiliate.customer")}</th><th>{t("affiliate.currentPlan")}</th><th>{t("affiliate.firstAccess")}</th><th>{t("affiliate.registration")}</th><th>{t("affiliate.conversion")}</th><th>{t("affiliate.status")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id}>
                  <td>
                    <strong>{i.customer}</strong>
                  </td>
                  <td>{i.plan}</td>
                  <td>{i.attributed_at ? new Date(i.attributed_at).toLocaleDateString(language) : "—"}</td>
                  <td>{i.registered_at ? new Date(i.registered_at).toLocaleDateString(language) : "—"}</td>
                  <td>{i.converted_at ? new Date(i.converted_at).toLocaleDateString(language) : "—"}</td>
                  <td>
                    <span className={styles.badge} data-status={i.status}>
                      {i.status_display}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && !shown.length && (
                <tr>
                  <td colSpan={6} className={styles.empty}>
                    {t("affiliate.noReferrals")}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={6} className={styles.loading}>
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
