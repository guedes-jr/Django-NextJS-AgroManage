"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileChartColumn, PackageOpen, RefreshCw, ShieldCheck, ShoppingBag, UsersRound, WalletCards, Warehouse } from "lucide-react";
import { apiClient } from "@/services/api";
import styles from "./inventoryPages.module.css";

interface Stats { total_items: number; total_value: string; estoque_baixo: number }
const money = (value: string) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function InventoryHome() {
  const [stats, setStats] = useState<Stats>({ total_items: 0, total_value: "0", estoque_baixo: 0 });
  useEffect(() => { apiClient.get<Stats>("/inventory/items/stats/").then(({ data }) => setStats(data)).catch(() => undefined); }, []);
  const actions = [
    { href: "/home/estoque/produtos", title: "Produtos", text: "Cadastre, edite e visualize todos os produtos, rações, medicamentos e materiais.", icon: ShoppingBag },
    { href: "/home/estoque/movimentacoes", title: "Movimentação", text: "Registre entradas e saídas e acompanhe todo o histórico de movimentações.", icon: RefreshCw },
    { href: "/home/estoque/fornecedores", title: "Fornecedores", text: "Cadastre e gerencie seus fornecedores e mantenha suas informações atualizadas.", icon: UsersRound },
    { href: "/home/relatorios/estoque", title: "Relatórios", text: "Visualize relatórios detalhados e analise o desempenho do seu estoque.", icon: FileChartColumn },
  ];
  return <div className={styles.page}>
    <header className={styles.title}><div><span className={styles.titleIcon}><PackageOpen size={42}/></span><span><h1>Estoque</h1><p>Controle completo dos produtos, rações, medicamentos e materiais da sua granja.</p></span></div></header>
    <section className={styles.panel}><div className={styles.panelHead}><strong><WalletCards size={20}/> Resumo do Estoque</strong><span>Visão rápida do seu estoque para tomada de decisões.</span></div><div className={styles.stats}>
      <article className={styles.stat}><span className={styles.icon}><WalletCards size={35}/></span><div><small>Valor total em estoque</small><strong>{money(stats.total_value)}</strong><span>Valor de custo total</span></div></article>
      <article className={styles.stat}><span className={styles.icon}><PackageOpen size={35}/></span><div><small>Itens cadastrados</small><strong>{stats.total_items}</strong><span>Todos os itens ativos</span></div></article>
      <article className={styles.stat}><span className={styles.icon}><Warehouse size={35}/></span><div><small>Estoque baixo</small><strong>{stats.estoque_baixo}</strong><span>Itens abaixo do mínimo</span></div></article>
    </div></section>
    <section className={styles.panel}><div className={styles.panelHead}><strong><PackageOpen size={20}/> Gerencie seu estoque</strong><span>Acesse as funcionalidades para gerenciar seu estoque de forma completa.</span></div><div className={styles.actions}>{actions.map(({ href,title,text,icon:Icon }) => <Link className={styles.action} href={href} key={href}><span className={styles.icon}><Icon size={34}/></span><h3>{title}</h3><p>{text}</p><span className={styles.actionButton}>Acessar <ArrowRight size={20}/></span></Link>)}</div></section>
    <div className={styles.control}><ShieldCheck size={37} color="#087d31"/><div><strong>Estoque sob controle</strong><span>Acompanhe e gerencie todos os itens da sua granja de forma eficiente.</span></div></div>
  </div>;
}
