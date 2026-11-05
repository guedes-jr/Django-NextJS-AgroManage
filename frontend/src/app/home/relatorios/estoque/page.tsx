"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, Boxes, Download, FileChartColumn, PackageOpen, WalletCards } from "lucide-react";
import { apiClient } from "@/services/api";
import styles from "@/components/inventory/inventoryPages.module.css";
import { useOrganizationLocale } from "@/lib/locale";

interface StockItem { id:string;code:string;name:string;category:string;unit:string;quantity:number;avg_cost:number;total_value:number;min_stock:number;is_low_stock:boolean }
interface StockReport { items:StockItem[];total_items:number;total_value:number;low_stock_count:number }

export default function StockReportPage() {
  const { language, t } = useOrganizationLocale();
  const money = (value: number) => value.toLocaleString(language, { style: "currency", currency: "BRL" });
  const number = (value: number) => value.toLocaleString(language, { maximumFractionDigits: 2 });
  const [data, setData] = useState<StockReport | null>(null);
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiClient.get<StockReport>("/reports/stock/general/")
      .then(({ data: report }) => setData(report))
      .catch(reportError => {
        console.error("Could not load stock report.", reportError);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(data?.items.map(item => item.category) || [])).sort((a, b) => a.localeCompare(b, language)),
    [data, language],
  );
  const rows = useMemo(
    () => (data?.items || []).filter(item =>
      (!category || item.category === category) &&
      (!status || (status === "low" ? item.is_low_stock : !item.is_low_stock)),
    ),
    [category, data, status],
  );
  const totalQuantity = rows.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = rows.reduce((sum, item) => sum + item.total_value, 0);
  const lowItems = (data?.items || []).filter(item => item.is_low_stock);

  const exportReport = () => {
    const sheet = XLSX.utils.json_to_sheet(rows.map(item => ({
      [t("stock.code")]: item.code,
      [t("stock.product")]: item.name,
      [t("stock.category")]: item.category,
      [t("stock.unit")]: item.unit,
      [t("stock.quantity")]: item.quantity,
      [t("stock.unitValue")]: item.avg_cost,
      [t("stock.totalValueColumn")]: item.total_value,
      [t("stock.minimumStock")]: item.min_stock,
      [t("stock.statusColumn")]: item.is_low_stock ? t("stock.lowStatus") : t("stock.normal"),
    })));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, t("stock.sheet"));
    XLSX.writeFile(book, "relatorio-estoque.xlsx");
  };

  return (
    <div className={styles.page}>
      <header className={styles.title}>
        <div>
          <span className={styles.titleIcon}><FileChartColumn size={40} /></span>
          <span><h1>{t("stock.title")}</h1><p>{t("stock.description")}</p></span>
        </div>
        <button className={styles.export} onClick={exportReport} disabled={!rows.length}>
          <Download size={19} /> {t("stock.export")}
        </button>
      </header>
      {loading ? <div className={styles.empty}>{t("stock.loading")}</div> : error ? (
        <div className={styles.empty} role="alert">{t("settings.loadError")}</div>
      ) : (
        <div className={styles.reportGrid}>
          <main className={styles.reportMain}>
            <section className={styles.reportStats}>
              <article className={styles.stat}><span className={styles.icon}><WalletCards /></span><div><small>{t("stock.totalValue")}</small><strong>{money(data?.total_value || 0)}</strong><span>{t("stock.costValue")}</span></div></article>
              <article className={styles.stat}><span className={styles.icon}><PackageOpen /></span><div><small>{t("stock.registeredItems")}</small><strong>{number(data?.total_items || 0)}</strong><span>{t("stock.activeItems")}</span></div></article>
              <article className={styles.stat}><span className={styles.icon}><AlertTriangle /></span><div><small>{t("stock.low")}</small><strong>{number(data?.low_stock_count || 0)}</strong><span>{t("stock.belowMinimum")}</span></div></article>
              <article className={styles.stat}><span className={styles.icon}><Boxes /></span><div><small>{t("stock.totalQuantity")}</small><strong>{number((data?.items || []).reduce((sum, item) => sum + item.quantity, 0))}</strong><span>{t("stock.units")}</span></div></article>
            </section>
            <section className={styles.panel}>
              <div className={styles.filters}>
                <label>{t("stock.products")}<select value={category} onChange={event => setCategory(event.target.value)}><option value="">{t("stock.all")}</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
                <label>{t("stock.status")}<select value={status} onChange={event => setStatus(event.target.value)}><option value="">{t("stock.all")}</option><option value="normal">{t("stock.normal")}</option><option value="low">{t("stock.lowStatus")}</option></select></label>
                <button className={styles.filterButton} type="button">{t("stock.filter")}</button>
              </div>
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHead}><strong><FileChartColumn size={19} /> {t("stock.allItems")} ({number(rows.length)})</strong></div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>{t("stock.code")}</th><th>{t("stock.product")}</th><th>{t("stock.category")}</th><th>{t("stock.unit")}</th><th>{t("stock.quantity")}</th><th>{t("stock.unitValue")}</th><th>{t("stock.totalValueColumn")}</th><th>{t("stock.minimumStock")}</th><th>{t("stock.status")}</th></tr></thead>
                  <tbody>
                    {rows.map(item => <tr key={item.id}><td>{item.code || "—"}</td><td>{item.name}</td><td>{item.category}</td><td>{item.unit}</td><td>{number(item.quantity)}</td><td>{money(item.avg_cost)}</td><td>{money(item.total_value)}</td><td>{number(item.min_stock)}</td><td><span className={`${styles.status} ${item.is_low_stock ? styles.statusLow : ""}`}>{item.is_low_stock ? t("stock.lowStatus") : t("stock.normal")}</span></td></tr>)}
                    {!rows.length && <tr><td colSpan={9} className={styles.empty}>{t("stock.empty")}</td></tr>}
                  </tbody>
                  {!!rows.length && <tfoot><tr><td colSpan={4}>{t("stock.totals")}</td><td>{number(totalQuantity)}</td><td /><td>{money(totalValue)}</td><td colSpan={2} /></tr></tfoot>}
                </table>
              </div>
            </section>
          </main>
          <aside className={styles.alerts}>
            <h2><AlertTriangle size={19} color="#e99b08" /> {t("stock.alerts")}</h2>
            <div className={styles.alertIntro}><strong>{t("stock.lowCount").replace("{count}", number(lowItems.length))}</strong><p>{t("stock.alertDescription")}</p></div>
            {lowItems.slice(0, 5).map(item => <article className={styles.alertItem} key={item.id}><strong>{item.name}</strong><div><span>{t("stock.currentStock")}<b>{number(item.quantity)} {item.unit}</b></span><span>{t("stock.minimum")}<b>{number(item.min_stock)} {item.unit}</b></span></div></article>)}
            {!lowItems.length && <div className={styles.empty}>{t("stock.noAlerts")}</div>}
          </aside>
        </div>
      )}
    </div>
  );
}
