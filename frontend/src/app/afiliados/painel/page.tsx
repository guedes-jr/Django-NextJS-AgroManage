"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, MousePointerClick, TrendingUp, UserCheck, UserPlus, Wallet } from "lucide-react";
import { AffiliateCommission, AffiliateDashboard, AffiliateProfile, AffiliateReferral, affiliateService } from "@/services/affiliateService";
import styles from "./dashboard.module.css";

const money = (value: string) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("pt-BR") : "—";
const duration = { first_payment: "1ª mensalidade", first_three_payments: "3 primeiras mensalidades", permanent: "todas as mensalidades" };

export default function AffiliateDashboardPage() {
  const [data, setData] = useState<{ profile: AffiliateProfile; dashboard: AffiliateDashboard; referrals: AffiliateReferral[]; commissions: AffiliateCommission[] } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { Promise.all([affiliateService.profile(), affiliateService.dashboard(), affiliateService.referrals(), affiliateService.commissions()]).then(([profile, dashboard, referrals, commissions]) => setData({ profile, dashboard, referrals: referrals.results, commissions: commissions.results })).catch(() => setError("Não foi possível carregar o dashboard.")); }, []);
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!data) return <div className={styles.loading}>Carregando dashboard…</div>;
  const { profile, dashboard, referrals, commissions } = data;
  const link = `${window.location.origin}${profile.referral_path}`;
  const registrationRate = dashboard.unique_visitors ? dashboard.registrations / dashboard.unique_visitors * 100 : 0;
  const salesRate = dashboard.registrations ? dashboard.converted_customers / dashboard.registrations * 100 : 0;
  const metrics = [
    { label: "Cliques totais", value: dashboard.clicks, detail: `${dashboard.unique_visitors} visitantes únicos`, icon: MousePointerClick },
    { label: "Cadastros", value: dashboard.registrations, detail: `${registrationRate.toFixed(1)}% dos visitantes`, icon: UserPlus },
    { label: "Clientes convertidos", value: dashboard.converted_customers, detail: `${salesRate.toFixed(1)}% dos cadastros`, icon: UserCheck },
    { label: "Comissões geradas", value: money(dashboard.commissions.total), detail: `${money(dashboard.commissions.paid)} já pagos`, icon: Wallet },
  ];
  const copy = async () => { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1800); };
  return <div className={styles.page}>
    <div className={styles.heading}><div><span className={styles.eyebrow}>Visão geral</span><h1>Dashboard de performance</h1><p>Acompanhe seu funil de indicações e o saldo das suas comissões.</p></div><Link href="/afiliados/painel/relatorios" className={styles.secondaryButton}><TrendingUp size={17} /> Ver relatório</Link></div>
    <section className={styles.linkCard}><div><span>Seu link exclusivo</span><strong>{link}</strong><small>{profile.commission_type === "percentage" ? `${Number(profile.commission_value)}%` : money(profile.commission_value)} em {duration[profile.commission_duration]}</small></div><button onClick={copy}>{copied ? <Check size={18} /> : <Copy size={18} />}{copied ? "Copiado" : "Copiar link"}</button></section>
    <div className={styles.metricGrid}>{metrics.map((metric) => <article className={styles.metricCard} key={metric.label}><span className={styles.metricIcon}><metric.icon size={21} /></span><div><strong>{metric.value}</strong><span>{metric.label}</span><small>{metric.detail}</small></div></article>)}</div>
    <div className={styles.balanceGrid}><article><span>Saldo pendente</span><strong>{money(dashboard.commissions.pending)}</strong><small>Aguardando aprovação</small></article><article><span>Saldo aprovado</span><strong>{money(dashboard.commissions.approved)}</strong><small>Disponível para pagamento</small></article><article><span>Total recebido</span><strong>{money(dashboard.commissions.paid)}</strong><small>Comissões já pagas</small></article><article><span>Cancelado/estornado</span><strong>{money(dashboard.commissions.cancelled)}</strong><small>Estornos: {money(dashboard.reversed_total)}</small></article></div>
    <div className={styles.twoColumns}><section className={styles.panel}><div className={styles.panelHeader}><div><h2>Funil de conversão</h2><p>Da visita à contratação do plano.</p></div></div><div className={styles.funnel}><div><span>Visitantes únicos</span><strong>{dashboard.unique_visitors}</strong><i style={{ width: "100%" }} /></div><div><span>Cadastros</span><strong>{dashboard.registrations}</strong><i style={{ width: `${Math.max(registrationRate, 4)}%` }} /></div><div><span>Clientes pagos</span><strong>{dashboard.converted_customers}</strong><i style={{ width: `${Math.max(dashboard.unique_visitors ? dashboard.converted_customers / dashboard.unique_visitors * 100 : 0, 4)}%` }} /></div></div></section>
      <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Comissões recentes</h2><p>Últimos lançamentos da carteira.</p></div><Link href="/afiliados/painel/comissoes">Ver todas <ArrowRight size={15} /></Link></div><div className={styles.list}>{commissions.slice(0, 5).map((item) => <div key={item.id}><span className={styles.avatar}>{item.customer.charAt(0)}</span><div><strong>{item.customer}</strong><small>{item.plan} • {date(item.conversion_at)}</small></div><div className={styles.amount}><strong>{money(item.commission_amount)}</strong><span data-status={item.status}>{item.status_display}</span></div></div>)}{!commissions.length && <p className={styles.empty}>Nenhuma comissão gerada.</p>}</div></section></div>
    <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Indicações recentes</h2><p>Últimos contatos atribuídos ao seu link.</p></div><Link href="/afiliados/painel/indicacoes">Ver todas <ArrowRight size={15} /></Link></div><div className="table-responsive"><table className={styles.table}><thead><tr><th>Cliente</th><th>Plano</th><th>Primeiro acesso</th><th>Cadastro</th><th>Status</th></tr></thead><tbody>{referrals.slice(0, 6).map((item) => <tr key={item.id}><td><strong>{item.customer}</strong></td><td>{item.plan}</td><td>{date(item.attributed_at)}</td><td>{date(item.registered_at)}</td><td><span data-status={item.status}>{item.status_display}</span></td></tr>)}{!referrals.length && <tr><td colSpan={5} className={styles.empty}>Nenhuma indicação registrada.</td></tr>}</tbody></table></div></section>
  </div>;
}
