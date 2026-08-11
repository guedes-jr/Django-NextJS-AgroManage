"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ChartNoAxesCombined,
  CircleAlert,
  CircleCheck,
  Clock3,
  Layers3,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Users,
} from "lucide-react";

import { platformService } from "@/services/platformApi";
import type { PlatformDashboard } from "@/types/platform";

const PLAN_NAMES: Record<string, string> = {
  basic: "Básico",
  starter: "Inicial",
  professional: "Profissional",
  enterprise: "Empresarial",
};

const PLAN_COLORS = ["#16803c", "#2f9e57", "#63b77c", "#a4d4af", "#dcecdf"];

function percentage(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function DashboardSkeleton() {
  return (
    <div className="platform-dashboard-skeleton" aria-label="Carregando indicadores">
      <div className="platform-skeleton platform-skeleton-title" />
      <div className="row g-3 mt-2">
        {[0, 1, 2, 3].map((item) => <div className="col-sm-6 col-xl-3" key={item}><div className="platform-skeleton platform-skeleton-card" /></div>)}
      </div>
      <div className="platform-skeleton platform-skeleton-panel mt-3" />
    </div>
  );
}

export default function PlatformDashboardPage() {
  const [data, setData] = useState<PlatformDashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    platformService.dashboard().then(setData).catch(() => setError("Não foi possível carregar os indicadores da plataforma."));
  }, []);

  const planData = useMemo(() => {
    if (!data) return [];
    return [...data.organizations.by_plan]
      .sort((a, b) => b.total - a.total)
      .map((item, index) => ({
        ...item,
        label: PLAN_NAMES[item.plan] || item.plan,
        percent: percentage(item.total, data.organizations.total),
        color: PLAN_COLORS[index % PLAN_COLORS.length],
      }));
  }, [data]);

  if (!data && !error) return <DashboardSkeleton />;
  if (error) return <div className="alert alert-danger border-0 rounded-4 p-4">{error}</div>;
  if (!data) return null;

  const activeOrganizationsRate = percentage(data.organizations.active, data.organizations.total);
  const activeUsersRate = percentage(data.users.active, data.users.total);
  const activeTeamRate = percentage(data.platform_team.active, data.platform_team.total);

  const metrics = [
    {
      label: "Organizações",
      value: data.organizations.total,
      note: `${data.organizations.created_last_30_days} novas nos últimos 30 dias`,
      icon: Building2,
      tone: "green",
    },
    {
      label: "Organizações ativas",
      value: data.organizations.active,
      note: `${activeOrganizationsRate}% da base com acesso liberado`,
      icon: ShieldCheck,
      tone: "blue",
    },
    {
      label: "Usuários ativos",
      value: data.users.active,
      note: `${data.users.created_last_30_days} novos nos últimos 30 dias`,
      icon: UserRoundCheck,
      tone: "orange",
    },
    {
      label: "Adoção da plataforma",
      value: `${activeUsersRate}%`,
      note: `${data.users.active} de ${data.users.total} usuários ativos`,
      icon: ChartNoAxesCombined,
      tone: "purple",
    },
  ];

  const pendingItems = [
    {
      label: "Organizações suspensas",
      value: data.organizations.suspended,
      detail: data.organizations.suspended ? "Revisar situação e acesso dos clientes" : "Nenhuma organização requer revisão",
      href: "/platform/organizations",
      status: data.organizations.suspended ? "attention" : "ok",
    },
    {
      label: "Contas sem organização",
      value: data.users.without_organization,
      detail: data.users.without_organization ? "Contas aguardando vínculo ou análise" : "Todos os usuários estão vinculados",
      href: "/platform/users",
      status: data.users.without_organization ? "attention" : "ok",
    },
  ];

  return (
    <div className="platform-dashboard">
      <section className="platform-dashboard-heading">
        <div>
          <div className="platform-dashboard-eyebrow"><Sparkles size={15} /> Visão executiva</div>
          <h1>Dashboard da plataforma</h1>
          <p>Acompanhe crescimento, adoção e pontos de atenção da operação.</p>
        </div>
        <div className="platform-dashboard-period"><Clock3 size={17} /><span>Atualização em tempo real</span></div>
      </section>

      <section className="row g-3 platform-dashboard-metrics" aria-label="Indicadores principais">
        {metrics.map((metric) => (
          <div className="col-sm-6 col-xl-3" key={metric.label}>
            <article className={`platform-overview-card tone-${metric.tone}`}>
              <div className="platform-overview-icon"><metric.icon size={25} /></div>
              <div className="platform-overview-content">
                <span>{metric.label}</span>
                <strong>{typeof metric.value === "number" ? metric.value.toLocaleString("pt-BR") : metric.value}</strong>
                <small>{metric.note}</small>
              </div>
            </article>
          </div>
        ))}
      </section>

      <section className="platform-insight-grid">
        <article className="platform-dashboard-panel platform-plan-panel">
          <header className="platform-panel-heading">
            <div><span className="platform-panel-kicker">Carteira de clientes</span><h2>Distribuição por plano</h2></div>
            <div className="platform-panel-total"><strong>{data.organizations.total}</strong><span>organizações</span></div>
          </header>

          {planData.length ? (
            <>
              <div className="platform-plan-stacked" aria-label="Distribuição percentual por plano">
                {planData.map((plan) => <span key={plan.plan} style={{ width: `${plan.percent}%`, background: plan.color }} title={`${plan.label}: ${plan.percent}%`} />)}
              </div>
              <div className="platform-plan-list">
                {planData.map((plan) => (
                  <div className="platform-plan-row" key={plan.plan}>
                    <div className="platform-plan-name"><i style={{ background: plan.color }} /><span>{plan.label}</span></div>
                    <div className="platform-plan-bar"><span style={{ width: `${plan.percent}%`, background: plan.color }} /></div>
                    <strong>{plan.total}</strong><small>{plan.percent}%</small>
                  </div>
                ))}
              </div>
            </>
          ) : <div className="platform-panel-empty">Nenhum plano em uso no momento.</div>}
        </article>

        <article className="platform-dashboard-panel platform-health-panel">
          <header className="platform-panel-heading">
            <div><span className="platform-panel-kicker">Engajamento</span><h2>Saúde da base</h2></div>
            <div className="platform-health-badge"><CircleCheck size={15} /> Monitorado</div>
          </header>
          <div className="platform-health-items">
            <div className="platform-health-item">
              <div className="platform-health-label"><span>Organizações com acesso ativo</span><strong>{activeOrganizationsRate}%</strong></div>
              <div className="platform-health-track"><span style={{ width: `${activeOrganizationsRate}%` }} /></div>
              <small>{data.organizations.active} ativas de {data.organizations.total} cadastradas</small>
            </div>
            <div className="platform-health-item">
              <div className="platform-health-label"><span>Usuários ativos</span><strong>{activeUsersRate}%</strong></div>
              <div className="platform-health-track blue"><span style={{ width: `${activeUsersRate}%` }} /></div>
              <small>{data.users.active} ativos de {data.users.total} cadastrados</small>
            </div>
            <div className="platform-health-item">
              <div className="platform-health-label"><span>Equipe interna ativa</span><strong>{activeTeamRate}%</strong></div>
              <div className="platform-health-track purple"><span style={{ width: `${activeTeamRate}%` }} /></div>
              <small>{data.platform_team.active} ativos de {data.platform_team.total} membros</small>
            </div>
          </div>
        </article>
      </section>

      <section className="platform-bottom-grid">
        <article className="platform-dashboard-panel platform-pending-panel">
          <header className="platform-panel-heading">
            <div><span className="platform-panel-kicker">Acompanhamento</span><h2>Alertas e pendências</h2></div>
          </header>
          <div className="platform-pending-list">
            {pendingItems.map((item) => (
              <Link href={item.href} className={`platform-pending-item ${item.status}`} key={item.label}>
                <span className="platform-pending-icon">{item.status === "ok" ? <CircleCheck size={20} /> : <CircleAlert size={20} />}</span>
                <span className="platform-pending-copy"><strong>{item.label}</strong><small>{item.detail}</small></span>
                <b>{item.value}</b><ArrowRight size={18} />
              </Link>
            ))}
          </div>
        </article>

        <article className="platform-dashboard-panel platform-growth-panel">
          <header className="platform-panel-heading">
            <div><span className="platform-panel-kicker">Últimos 30 dias</span><h2>Crescimento da base</h2></div>
          </header>
          <div className="platform-growth-stats">
            <div><span className="platform-growth-icon"><Building2 size={21} /></span><strong>+{data.organizations.created_last_30_days}</strong><small>novas organizações</small></div>
            <div><span className="platform-growth-icon users"><Users size={21} /></span><strong>+{data.users.created_last_30_days}</strong><small>novos usuários</small></div>
          </div>
          <Link href="/platform/organizations" className="platform-inline-link">Acompanhar organizações <ArrowRight size={16} /></Link>
        </article>

        <article className="platform-dashboard-panel platform-shortcuts-panel">
          <header className="platform-panel-heading">
            <div><span className="platform-panel-kicker">Gestão</span><h2>Acessos rápidos</h2></div>
          </header>
          <div className="platform-shortcut-list">
            <Link href="/platform/organizations"><Building2 size={19} /><span><strong>Organizações</strong><small>Cadastros e acessos</small></span><ArrowRight size={17} /></Link>
            <Link href="/platform/users"><Users size={19} /><span><strong>Usuários</strong><small>Contas e vínculos</small></span><ArrowRight size={17} /></Link>
            <Link href="/platform/plans"><Layers3 size={19} /><span><strong>Planos</strong><small>Assinaturas e limites</small></span><ArrowRight size={17} /></Link>
          </div>
        </article>
      </section>
    </div>
  );
}
