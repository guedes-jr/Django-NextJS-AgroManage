"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, CirclePause, TrendingUp, UserRoundCheck, Users } from "lucide-react";

import { platformService } from "@/services/platformApi";
import type { PlatformDashboard } from "@/types/platform";

export default function PlatformDashboardPage() {
  const [data, setData] = useState<PlatformDashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { platformService.dashboard().then(setData).catch(() => setError("Não foi possível carregar os indicadores.")); }, []);

  if (!data && !error) return <div className="py-5 text-center"><div className="spinner-border text-success" /></div>;
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!data) return null;

  const metrics = [
    { label:"Organizações", value:data.organizations.total, note:`${data.organizations.created_last_30_days} novas em 30 dias`, icon:Building2 },
    { label:"Organizações ativas", value:data.organizations.active, note:"Clientes com acesso liberado", icon:TrendingUp },
    { label:"Suspensas", value:data.organizations.suspended, note:"Acesso bloqueado", icon:CirclePause },
    { label:"Usuários ativos", value:data.users.active, note:`${data.users.total} usuários cadastrados`, icon:UserRoundCheck },
  ];

  return <>
    <div className="d-flex justify-content-between align-items-end mb-4"><div><div className="platform-label mb-2">Visão executiva</div><h1 className="h2 fw-bold mb-1">Dashboard da plataforma</h1><p className="text-muted mb-0">Acompanhamento global das organizações e usuários.</p></div><Link href="/platform/organizations" className="btn btn-dark">Gerenciar organizações</Link></div>
    <div className="row g-3 mb-4">{metrics.map((metric) => <div className="col-sm-6 col-xl-3" key={metric.label}><div className="platform-card platform-metric"><div className="d-flex justify-content-between"><div className="platform-label">{metric.label}</div><div className="platform-icon"><metric.icon size={20}/></div></div><div className="platform-value mt-2">{metric.value.toLocaleString("pt-BR")}</div><div className="small text-muted">{metric.note}</div></div></div>)}</div>
    <div className="row g-3"><div className="col-lg-7"><div className="platform-card p-4 h-100"><h2 className="h5 fw-bold mb-4">Distribuição por plano</h2>{data.organizations.by_plan.map((item) => { const percent = data.organizations.total ? Math.round(item.total / data.organizations.total * 100) : 0; return <div className="mb-3" key={item.plan}><div className="d-flex justify-content-between mb-1"><span className="text-capitalize fw-semibold">{item.plan}</span><span className="text-muted small">{item.total} · {percent}%</span></div><div className="progress" style={{height:8}}><div className="progress-bar bg-success" style={{width:`${percent}%`}} /></div></div>; })}</div></div><div className="col-lg-5"><div className="platform-card p-4 h-100"><h2 className="h5 fw-bold mb-4">Operação interna</h2><div className="d-flex align-items-center gap-3 mb-4"><div className="platform-icon"><Users size={20}/></div><div><div className="fw-bold fs-4">{data.platform_team.active}</div><div className="text-muted small">membros internos ativos</div></div></div><div className="border-top pt-3 text-muted small">{data.users.without_organization} contas sem organização aguardando revisão.</div></div></div></div>
  </>;
}
