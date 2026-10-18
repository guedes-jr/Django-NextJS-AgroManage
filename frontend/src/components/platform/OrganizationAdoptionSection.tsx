"use client";

import { useEffect, useState } from "react";
import { platformService } from "@/services/platformApi";
import { getOrganizationErrorMessage } from "@/services/organizationInvitations";
import type { OrganizationAdoption } from "@/types/platform";

export const adoptionLabels = {
  active: "Uso nos últimos 7 dias", inactive_7: "Sem uso há 7–14 dias", inactive_15: "Sem uso há 15–29 dias",
  inactive_30: "Sem uso há 30 dias ou mais", never: "Nunca acessou", unknown: "Histórico desconhecido",
};
const date = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "Sem registro observado";

export function OrganizationAdoptionSection({ id }: { id: string }) {
  const [data, setData] = useState<OrganizationAdoption | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    platformService.organizationAdoption(id).then(result => { if (active) { setData(result.metrics); setError(""); } })
      .catch(reason => { if (active) setError(getOrganizationErrorMessage(reason, "Não foi possível carregar a adoção.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, attempt]);
  const retry = () => { setLoading(true); setAttempt(value => value + 1); };
  if (loading) return <p role="status">Carregando indicadores de adoção…</p>;
  if (error) return <div className="alert alert-danger" role="alert">{error}<button className="btn btn-link" onClick={retry}>Tentar novamente</button></div>;
  if (!data) return <div className="platform-card p-4"><p>Aguardando o primeiro cálculo dos indicadores.</p><button className="btn btn-outline-secondary" onClick={retry}>Consultar novamente</button></div>;
  return <div className="d-flex flex-column gap-3">
    <section className="platform-card p-4"><div className="d-flex flex-wrap justify-content-between gap-2"><h2 className="h5">{adoptionLabels[data.status]}</h2><button className="btn btn-sm btn-outline-secondary" onClick={retry}>Atualizar leitura</button></div><p className="small text-muted mb-1">Observação desde {date(data.observed_since)} · Cálculo em {date(data.calculated_at)}</p><p className="small text-muted mb-0">Atualização a cada hora. Contamos logins e alterações operacionais concluídas pelo cliente. Consultas automáticas, equipe interna e acesso assistido ficam fora da contagem.</p>{!data.history_complete && <p className="small mt-2 mb-0">O período anterior ao início da observação é desconhecido.</p>}</section>
    <div className="row g-3">{([7, 30] as const).map(days => <div className="col-sm-6" key={days}><section className="platform-card p-4 h-100"><h3 className="h6">Usuários com uso em {days} dias</h3><div className="h2">{days === 7 ? data.active_users_7d : data.active_users_30d}</div>{!(days === 7 ? data.period_7d_complete : data.period_30d_complete) && <small className="text-muted">Período de observação parcial</small>}</section></div>)}</div>
    <section className="platform-card p-4"><h3 className="h6">Última atividade observada</h3><dl className="row mb-0"><div className="col-md-6"><dt>Login do cliente</dt><dd>{date(data.last_customer_login_at)}</dd></div><div className="col-md-6"><dt>Alteração operacional</dt><dd>{date(data.last_operation_at)}</dd></div></dl></section>
    <section className="platform-card p-4"><h3 className="h6">Implantação</h3><ul className="mb-0">{([["Responsável ativo", data.checklist.responsible_activated], ["Primeira fazenda cadastrada", data.checklist.first_farm], ["Primeira alteração operacional observada", data.checklist.first_operation]] as const).map(([label, value]) => <li key={label}>{label}: <strong>{value === null ? "Histórico desconhecido" : value ? "Concluído" : "Pendente"}</strong></li>)}</ul></section>
  </div>;
}
