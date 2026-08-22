"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Handshake, MousePointerClick, UserCheck, UserPlus, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import {
  AffiliateCommission,
  AffiliateDashboard,
  AffiliateProfile,
  AffiliateReferral,
  affiliateService,
} from "@/services/affiliateService";
import styles from "./page.module.css";

const money = (value: string) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const date = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("pt-BR") : "—";

const statusClass = (status: string) => {
  if (status === "paid" || status === "converted") return styles.success;
  if (status === "approved") return styles.approved;
  if (status === "cancelled") return styles.cancelled;
  return styles.pending;
};

export default function AffiliatePage() {
  const [profile, setProfile] = useState<AffiliateProfile | null>(null);
  const [dashboard, setDashboard] = useState<AffiliateDashboard | null>(null);
  const [referrals, setReferrals] = useState<AffiliateReferral[]>([]);
  const [commissions, setCommissions] = useState<AffiliateCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      affiliateService.profile(),
      affiliateService.dashboard(),
      affiliateService.referrals(),
      affiliateService.commissions(),
    ])
      .then(([profileData, dashboardData, referralPage, commissionPage]) => {
        if (!active) return;
        setProfile(profileData);
        setDashboard(dashboardData);
        setReferrals(referralPage.results);
        setCommissions(commissionPage.results);
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar sua área de afiliado.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const referralLink = profile && typeof window !== "undefined"
    ? `${window.location.origin}${profile.referral_path}`
    : "";

  const copyLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className={styles.loading}>Carregando área do afiliado…</div>;
  if (error || !profile || !dashboard) {
    return <div className="alert alert-danger">{error || "Perfil de afiliado indisponível."}</div>;
  }

  const cards = [
    { label: "Cliques", value: dashboard.clicks, icon: MousePointerClick },
    { label: "Cadastros", value: dashboard.registrations, icon: UserPlus },
    { label: "Convertidos", value: dashboard.converted_customers, icon: UserCheck },
    { label: "Comissões geradas", value: money(dashboard.commissions.total), icon: Wallet },
  ];

  return (
    <div>
      <PageHeader
        title="Área do afiliado"
        subtitle="Acompanhe suas indicações, conversões e comissões."
      />

      <Card className="mb-4">
        <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-4">
          <div>
            <div className={styles.eyebrow}><Handshake size={16} /> Seu link de indicação</div>
            <div className={styles.link}>{referralLink}</div>
            <div className="text-muted small mt-2">
              Comissão: {profile.commission_type === "percentage"
                ? `${Number(profile.commission_value)}%`
                : money(profile.commission_value)}
            </div>
          </div>
          <button type="button" className="btn btn-success d-flex align-items-center justify-content-center gap-2" onClick={copyLink}>
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? "Link copiado" : "Copiar link"}
          </button>
        </div>
      </Card>

      <div className="row g-3 mb-4">
        {cards.map((item) => (
          <div className="col-sm-6 col-xl-3" key={item.label}>
            <Card className="h-100">
              <div className={styles.metricIcon}><item.icon size={21} /></div>
              <div className={styles.metricValue}>{item.value}</div>
              <div className="text-muted small">{item.label}</div>
            </Card>
          </div>
        ))}
      </div>

      <div className="row g-3 mb-4">
        {(["pending", "approved", "paid"] as const).map((key) => (
          <div className="col-md-4" key={key}>
            <Card>
              <div className="text-muted small text-capitalize">{key === "pending" ? "Pendentes" : key === "approved" ? "Aprovadas" : "Pagas"}</div>
              <div className="fs-4 fw-bold mt-1">{money(dashboard.commissions[key])}</div>
            </Card>
          </div>
        ))}
      </div>

      <Card className="mb-4" header={<h2 className="h5 fw-bold mb-0">Indicações recentes</h2>}>
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead><tr><th>Cliente</th><th>Plano</th><th>Entrada</th><th>Cadastro</th><th>Status</th></tr></thead>
            <tbody>
              {referrals.map((item) => (
                <tr key={item.id}>
                  <td className="fw-semibold">{item.customer}</td><td>{item.plan}</td>
                  <td>{date(item.attributed_at)}</td><td>{date(item.registered_at)}</td>
                  <td><span className={`${styles.status} ${statusClass(item.status)}`}>{item.status_display}</span></td>
                </tr>
              ))}
              {!referrals.length && <tr><td colSpan={5} className="text-center text-muted py-4">Nenhuma indicação registrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card header={<h2 className="h5 fw-bold mb-0">Histórico de comissões</h2>}>
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead><tr><th>Cliente</th><th>Plano</th><th>Contratação</th><th>Comissão</th><th>Conversão</th><th>Status</th></tr></thead>
            <tbody>
              {commissions.map((item) => (
                <tr key={item.id}>
                  <td className="fw-semibold">{item.customer}</td><td>{item.plan}</td>
                  <td>{money(item.transaction_amount)}</td><td>{money(item.commission_amount)}</td>
                  <td>{date(item.conversion_at)}</td>
                  <td><span className={`${styles.status} ${statusClass(item.status)}`}>{item.status_display}</span></td>
                </tr>
              ))}
              {!commissions.length && <tr><td colSpan={6} className="text-center text-muted py-4">Nenhuma comissão gerada.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
