"use client";

import { Dna, FileText } from "lucide-react";
import styles from "./page.module.css";
import { useOrganizationLocale } from "@/lib/locale";

/** Row of GET /livestock/reprodutores/?include_inactive=1 (Relatórios › Reprodutores). */
export interface Male {
  id: string; identifier: string; category: string; breed: string; farm_name: string; status: string;
  idade: number | null; peso: string | number | null; ultima_pesagem: string | null;
  ultima_vacina: string | null; vacina: string; ultima_coleta: string | null; coletas: number;
  doses_produzidas: number; doses_estoque: string | number; custo_coletas: string | number;
  coberturas: number; prenhezes: number; partos: number; nascidos_vivos: number;
}

export const maleIsActive = (male: Male) => male.status === "ativo";
/** Confirmed pregnancies over matings, in %; null without matings. */
export const malePregnancyRate = (male: Male) => male.coberturas ? male.prenhezes / male.coberturas * 100 : null;
/** Diluent cost of the collections over the doses produced. */
export const maleCostPerDose = (male: Male) => male.doses_produzidas ? Number(male.custo_coletas || 0) / male.doses_produzidas : null;

const formatDate = (language: string, value?: string | null) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(language) : "—";

export function MalesTable({ items, onOpen }: { items: Male[]; onOpen: (id: string) => void }) {
  const { language, t } = useOrganizationLocale();
  const num = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  const money = new Intl.NumberFormat(language, { style: "currency", currency: "BRL" });
  const percent = new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 1 });
  const active = items.filter(maleIsActive).length;
  const matings = items.reduce((sum, x) => sum + x.coberturas, 0);
  const pregnancies = items.reduce((sum, x) => sum + x.prenhezes, 0);
  const liveBorn = items.reduce((sum, x) => sum + x.nascidos_vivos, 0);
  const births = items.reduce((sum, x) => sum + x.partos, 0);
  const doses = items.reduce((sum, x) => sum + x.doses_produzidas, 0);
  const stock = items.reduce((sum, x) => sum + Number(x.doses_estoque || 0), 0);
  const cards = [
    { label: t("swine.totalMales"), value: num.format(items.length), meta: t("swine.allCategories"), tone: "purple", icon: "🐗" },
    { label: t("swine.activeMales"), value: num.format(active), meta: items.length ? `${percent.format(active / items.length)} ${t("swine.ofTotal")}` : percent.format(0), tone: "green", icon: "✓" },
    { label: t("swine.maleMatings"), value: num.format(matings), meta: t("swine.malePregnancies", { count: num.format(pregnancies) }), tone: "blue", icon: "♂" },
    { label: t("swine.malePregnancyRate"), value: matings ? percent.format(pregnancies / matings) : "—", meta: t("swine.maleConfirmedOverMatings"), tone: "orange", icon: "%" },
    { label: t("swine.maleLiveBorn"), value: num.format(liveBorn), meta: births ? t("swine.malePerBirth", { count: num.format(liveBorn / births) }) : "—", tone: "pink", icon: "🍼" },
    { label: t("swine.maleDosesProduced"), value: num.format(doses), meta: t("swine.maleDosesInStock", { count: num.format(stock) }), tone: "red", icon: "🧪" },
  ];
  return <div className={styles.femaleReport}>
    <div className={styles.femaleHeading}><div><h2>{t("swine.malesTitle")}</h2><p>{t("swine.malesDescription")}</p></div><Dna size={28} /></div>
    <section className={styles.femaleKpis}>{cards.map(x => <article data-tone={x.tone} key={x.label}><span>{x.icon}</span><div><small>{x.label}</small><strong>{x.value}</strong><em>{x.meta}</em></div></article>)}</section>
    <section className={styles.tablePanel}>
      <div className={styles.tableTitle}><div><span>{t("swine.maleList").toLocaleUpperCase(language)}</span><h2>{t("swine.registeredMales")}</h2></div><strong>{num.format(items.length)} {t("swine.animals")}</strong></div>
      <div className={styles.tableScroll}><table className={styles.femaleTable}>
        <thead><tr>
          <th>{t("swine.male")}</th><th>{t("swine.category")}</th><th>{t("swine.situation")}</th>
          <th>{t("swine.maleLastWeight")}</th><th>{t("swine.maleLastVaccine")}</th>
          <th>{t("swine.maleMatings")}</th><th>{t("swine.malePregnancyRate")}</th><th>{t("swine.maleLiveBorn")}<small>{t("swine.averagePerBirth")}</small></th>
          <th>{t("swine.maleCollections")}<small>{t("swine.maleLastCollectionShort")}</small></th><th>{t("swine.maleDosesProduced")}</th><th>{t("swine.maleDosesStock")}</th><th>{t("swine.maleCostPerDose")}</th>
          <th>{t("swine.actions")}</th>
        </tr></thead>
        <tbody>{items.length ? items.map(x => {
          const rate = malePregnancyRate(x), costPerDose = maleCostPerDose(x);
          return <tr key={x.id}>
            <td><b>{x.identifier}</b>{x.breed && <small className="d-block text-muted">{x.breed}</small>}</td>
            <td>{x.category || "—"}</td>
            <td><span className={styles.matrixSituation} data-status={maleIsActive(x) ? "active" : x.status}>{maleIsActive(x) ? t("swine.activeStatus") : t("swine.discardedStatus")}</span></td>
            <td>{x.peso != null ? `${num.format(Number(x.peso))} kg` : "—"}{x.ultima_pesagem && <small className="d-block text-muted">{formatDate(language, x.ultima_pesagem)}</small>}</td>
            <td>{x.ultima_vacina ? x.vacina || "—" : "—"}{x.ultima_vacina && <small className="d-block text-muted">{formatDate(language, x.ultima_vacina)}</small>}</td>
            <td>{num.format(x.coberturas)}</td>
            <td>{rate == null ? "—" : percent.format(rate / 100)}</td>
            <td>{num.format(x.nascidos_vivos)}{x.partos > 0 && <small className="d-block text-muted">{num.format(x.nascidos_vivos / x.partos)}</small>}</td>
            <td>{num.format(x.coletas)}{x.ultima_coleta && <small className="d-block text-muted">{formatDate(language, x.ultima_coleta)}</small>}</td>
            <td>{num.format(x.doses_produzidas)}</td>
            <td>{num.format(Number(x.doses_estoque || 0))}</td>
            <td>{costPerDose == null ? "—" : money.format(costPerDose)}</td>
            <td><div className={styles.rowActions}><button type="button" title={t("swine.viewMaleRecord")} aria-label={`${t("swine.viewMaleRecord")}: ${x.identifier}`} onClick={() => onOpen(x.id)}><FileText size={15} aria-hidden="true" /></button></div></td>
          </tr>;
        }) : <tr><td colSpan={13} className={styles.empty}>{t("swine.noMales")}</td></tr>}</tbody>
      </table></div>
      <div className={styles.tableFooter}><span>{t("swine.showingMales", { count: num.format(items.length) })}</span></div>
    </section>
  </div>;
}
