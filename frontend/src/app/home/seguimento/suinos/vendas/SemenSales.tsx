"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { isAxiosError } from "axios";
import { useOrganizationLocale } from "@/lib/locale";
import { listSemenSales, sellSemenDoses, type SemenSaleBook, type SemenSaleCommand } from "@/services/livestockService";
import styles from "../operations.module.css";
import sales from "./sales.module.css";

function saleKey() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

export function SemenSales() {
  const { t, language } = useOrganizationLocale();
  const [data, setData] = useState<SemenSaleBook>();
  const [collection, setCollection] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [buyer, setBuyer] = useState("");
  const [date, setDate] = useState("");
  const [due, setDue] = useState("");
  const [review, setReview] = useState<SemenSaleCommand>();
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const [refresh, setRefresh] = useState(0);
  const lock = useRef(false);
  const lot = data?.lots.find(row => row.collection === collection);
  const day = date || data?.today || "";
  const money = new Intl.NumberFormat(language, { style: "currency", currency: "BRL" });

  useEffect(() => {
    const controller = new AbortController();
    listSemenSales(controller.signal).then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(() => { if (!controller.signal.aborted) setError(t("livestock.sale.registerFailed")); });
    return () => controller.abort();
  }, [refresh, t]);

  function prepare(event: FormEvent) {
    event.preventDefault();
    if (!lot || !buyer.trim() || lock.current) return;
    setError("");
    setReference("");
    setReview({ request_key: saleKey(), collection, expected_balance: lot.balance,
      quantity: Number(quantity), price: price.replace(",", "."), buyer: buyer.trim(), date: day, due_date: due || day });
  }

  async function confirm() {
    if (!review || lock.current) return;
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await sellSemenDoses(review);
      setReference(result.reference);
      setReview(undefined);
      setUncertain(false);
      setQuantity("");
      if (result.remaining === 0) setCollection("");
      setRefresh(value => value + 1);
    } catch (caught) {
      const status = isAxiosError(caught) ? caught.response?.status : undefined;
      if (!status || status >= 500 || status === 408) {
        setUncertain(true);
        setError(t("semenSale.uncertain"));
      } else if (status === 409 || status === 404) {
        setReview(undefined);
        setUncertain(false);
        setRefresh(value => value + 1);
        setError(t("livestock.sale.registerFailed"));
      } else {
        setError(uncertain ? t("semenSale.uncertain") : t("livestock.sale.registerFailed"));
      }
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return <div className={sales.layout}>
    <form className={styles.card} onSubmit={prepare}>
      <h2>{t("semenSale.sellDoses")}</h2>
      {error ? <div role="alert" className={styles.error}>{error}
        {!data ? <button type="button" onClick={() => { setError(""); setRefresh(value => value + 1); }}>{t("livestock.sale.retry")}</button> : null}
      </div> : null}
      {reference ? <div role="status" className={styles.success}>{reference}</div> : null}
      {review ? <div className={styles.grid}>
        <p className={styles.wide}>{lot?.lot} · {review.buyer} · {review.quantity} × {money.format(Number(review.price))} = {money.format(review.quantity * Number(review.price))}</p>
        <p className={styles.wide}>{review.date} · {t("semenSale.due")}: {review.due_date}</p>
        <p className={styles.wide}>{t("semenSale.effect")}</p>
        {!uncertain ? <button type="button" className={sales.clear} disabled={saving} onClick={() => setReview(undefined)}>{t("reproduction.cancel")}</button> : null}
        <button type="button" className={styles.submit} disabled={saving} onClick={() => void confirm()}>{uncertain ? t("livestock.sale.retry") : t("livestock.sale.register")}</button>
      </div> : <fieldset className={sales.fields} disabled={!data}>
        <div className={styles.grid}>
          <div className={`${styles.field} ${styles.wide}`}><label htmlFor="semen-sale-lot">{t("semenSale.lot")}</label><select id="semen-sale-lot" required value={collection} onChange={e => { setCollection(e.target.value); setQuantity(""); }}>
            <option value="">{t("reproduction.select")}</option>
            {data?.lots.map(row => <option key={row.collection} value={row.collection}>{row.lot} · {row.breeder} · {row.farm} · {row.balance}</option>)}
          </select>{data && !data.lots.length ? <small>{t("semenSale.empty")}</small> : null}</div>
          <div className={styles.field}><label htmlFor="semen-sale-quantity">{t("livestock.sale.quantity")}</label><input id="semen-sale-quantity" type="number" min="1" max={lot?.balance} step="1" required value={quantity} onChange={e => setQuantity(e.target.value)}/></div>
          <div className={styles.field}><label htmlFor="semen-sale-price">{t("semenSale.price")}</label><input id="semen-sale-price" type="number" min="0.01" max="99999999.99" step="0.01" required value={price} onChange={e => setPrice(e.target.value)}/></div>
          <div className={styles.field}><label htmlFor="semen-sale-buyer">{t("livestock.sale.buyer")}</label><input id="semen-sale-buyer" required maxLength={100} value={buyer} onChange={e => setBuyer(e.target.value)}/></div>
          <div className={styles.field}><label htmlFor="semen-sale-day">{t("livestock.sale.saleDate")}</label><input id="semen-sale-day" type="date" required min={lot?.date} max={data?.today} value={day} onChange={e => setDate(e.target.value)}/></div>
          <div className={styles.field}><label htmlFor="semen-sale-due">{t("semenSale.due")}</label><input id="semen-sale-due" type="date" required min={day} value={due || day} onChange={e => setDue(e.target.value)}/></div>
          <button className={styles.submit} disabled={!lot}>{t("semenSale.review")}</button>
        </div>
      </fieldset>}
    </form>
    <section className={styles.card}>
      <h2>{t("livestock.sale.recent")}</h2>
      {data?.sales.length ? <ul>{data.sales.map(row => <li key={row.reference}>{row.date} · {row.lot} · {row.buyer} · {row.quantity} · {money.format(Number(row.amount))}</li>)}</ul> : <p>{data ? t("livestock.sale.none") : t("livestock.loading")}</p>}
    </section>
  </div>;
}
