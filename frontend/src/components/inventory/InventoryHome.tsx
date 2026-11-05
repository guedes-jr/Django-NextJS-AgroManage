"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileChartColumn, PackageOpen, RefreshCw, ShieldCheck, ShoppingBag, UsersRound, WalletCards, Warehouse } from "lucide-react";
import { apiClient } from "@/services/api";
import { useOrganizationLocale } from "@/lib/locale";
import styles from "./inventoryPages.module.css";

interface Stats { total_items: number; total_value: string; estoque_baixo: number }

export function InventoryHome() {
  const { language, t } = useOrganizationLocale();
  const [stats, setStats] = useState<Stats>({ total_items: 0, total_value: "0", estoque_baixo: 0 });
  useEffect(() => { apiClient.get<Stats>("/inventory/items/stats/").then(({ data }) => setStats(data)).catch(() => undefined); }, []);
  const money = (value: string) => Number(value || 0).toLocaleString(language, { style: "currency", currency: "BRL" });
  const actions = [
    { href: "/home/estoque/produtos", title: t("inventory.home.products"), text: t("inventory.home.productsDescription"), icon: ShoppingBag },
    { href: "/home/estoque/movimentacoes", title: t("inventory.home.movements"), text: t("inventory.home.movementsDescription"), icon: RefreshCw },
    { href: "/home/estoque/fornecedores", title: t("inventory.home.suppliers"), text: t("inventory.home.suppliersDescription"), icon: UsersRound },
    { href: "/home/relatorios/estoque", title: t("inventory.home.reports"), text: t("inventory.home.reportsDescription"), icon: FileChartColumn },
  ];
  return <div className={styles.page}>
    <header className={styles.title}><div><span className={styles.titleIcon}><PackageOpen size={42}/></span><span><h1>{t("inventory.home.title")}</h1><p>{t("inventory.home.description")}</p></span></div></header>
    <section className={styles.panel}><div className={styles.panelHead}><strong><WalletCards size={20}/> {t("inventory.home.summary")}</strong><span>{t("inventory.home.summaryDescription")}</span></div><div className={styles.stats}>
      <article className={styles.stat}><span className={styles.icon}><WalletCards size={35}/></span><div><small>{t("inventory.home.totalValue")}</small><strong>{money(stats.total_value)}</strong><span>{t("inventory.home.costValue")}</span></div></article>
      <article className={styles.stat}><span className={styles.icon}><PackageOpen size={35}/></span><div><small>{t("inventory.home.registeredItems")}</small><strong>{stats.total_items.toLocaleString(language)}</strong><span>{t("inventory.home.activeItems")}</span></div></article>
      <Link className={styles.stat} href="/home/estoque/produtos?status=baixo" aria-label={t("inventory.home.lowStockAria", { count: stats.estoque_baixo.toLocaleString(language) })} style={{ cursor: "pointer", color: "var(--foreground)", textDecoration: "none" }}><span className={styles.icon}><Warehouse size={35}/></span><div><small>{t("inventory.home.lowStock")}</small><strong>{stats.estoque_baixo.toLocaleString(language)}</strong><span>{t("inventory.home.belowMinimum")}</span></div></Link>
    </div></section>
    <section className={styles.panel}><div className={styles.panelHead}><strong><PackageOpen size={20}/> {t("inventory.home.manage")}</strong><span>{t("inventory.home.manageDescription")}</span></div><div className={styles.actions}>{actions.map(({ href,title,text,icon:Icon }) => <Link className={styles.action} href={href} key={href}><span className={styles.icon}><Icon size={34}/></span><h3>{title}</h3><p>{text}</p><span className={styles.actionButton}>{t("inventory.home.access")} <ArrowRight size={20}/></span></Link>)}</div></section>
    <div className={styles.control}><ShieldCheck size={37} color="#087d31"/><div><strong>{t("inventory.home.control")}</strong><span>{t("inventory.home.controlDescription")}</span></div></div>
  </div>;
}
