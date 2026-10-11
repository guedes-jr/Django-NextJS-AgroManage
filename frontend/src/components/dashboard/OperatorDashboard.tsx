import Link from "next/link";
import { Sprout, Beef, ClipboardList, ShieldCheck } from "lucide-react";
import type { OrganizationAccess } from "@/services/organizationAccess";

export type OperationalDashboardData = {
  mode: "operational";
  organization: string | null;
  access: OrganizationAccess;
  operational: {
    plantations: number | null;
    herds: { code: string; name: string; batches: number; quantity: number; individuals: number }[];
  };
  tasks: { id: string; title: string; due_date: string | null; priority: string; status: string }[];
};

export default function OperatorDashboard({ data }: { data: OperationalDashboardData }) {
  const areas = data.access.can_operate_crops || !!data.access.livestock_species?.length;

  return (
    <div className="org-dashboard">
      <header className="org-dashboard-header">
        <div>
          <span className="small text-success fw-semibold">
            <ShieldCheck size={16} /> Acesso operacional{data.access.read_only ? " · Somente consulta" : ""}
          </span>
          <h1>Minha operação</h1>
          <p>{data.organization} · Acompanhe as áreas autorizadas pelo administrador.</p>
        </div>
        <Link className="btn btn-outline-success" href="/home/profile">Minha conta</Link>
      </header>
      {!areas && (
        <div className="alert alert-info">
          Nenhuma área foi liberada para seu acesso. Solicite ao administrador a autorização para plantações ou rebanhos.
        </div>
      )}
      <section className="row g-3 mb-4" aria-label="Áreas autorizadas">
        {data.access.can_operate_crops && (
          <div className="col-md-6 col-xl-4">
            <article className="org-info-panel h-100">
              <Sprout className="text-success mb-2" />
              <h2 className="h5">Plantações</h2>
              <strong className="fs-2">{data.operational.plantations ?? 0}</strong>
              <p className="text-muted">Plantações cadastradas</p>
              <Link href="/home/plantacoes" className="btn btn-success btn-sm">Acessar plantações</Link>
            </article>
          </div>
        )}
        {(data.access.livestock_species || []).map(code => {
          const herd = data.operational.herds.find(entry => entry.code === code);
          return (
            <div className="col-md-6 col-xl-4" key={code}>
              <article className="org-info-panel h-100">
                <Beef className="text-success mb-2" />
                <h2 className="h5">{herd?.name || code}</h2>
                <div className="d-flex gap-4">
                  <div><strong className="fs-2">{herd?.batches || 0}</strong><small className="d-block text-muted">Lotes ativos</small></div>
                  <div><strong className="fs-2">{herd?.quantity || 0}</strong><small className="d-block text-muted">Animais nos lotes</small></div>
                </div>
                <p className="small text-muted mt-2">{herd?.individuals || 0} animais com cadastro individual</p>
                <Link href={`/home/rebanho/${encodeURIComponent(code)}`} className="btn btn-success btn-sm">Acessar rebanho</Link>
              </article>
            </div>
          );
        })}
      </section>
      <section className="org-info-panel">
        <h2 className="h5"><ClipboardList size={20} className="me-2" />Tarefas atribuídas a mim</h2>
        {!data.tasks.length ? <p className="text-muted mb-0">Nenhuma tarefa pendente.</p> : (
          <div className="org-task-list">
            {data.tasks.map(task => (
              <div key={task.id} className="info">
                <p>
                  <strong>{task.title}</strong>
                  <small>{task.due_date ? `Prazo: ${new Date(`${task.due_date}T00:00:00`).toLocaleDateString("pt-BR")}` : "Sem prazo definido"}</small>
                </p>
                <span className="badge bg-success-subtle text-success">{task.status === "in_progress" ? "Em andamento" : "Pendente"}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <p className="small text-muted mt-3">Consulte os alertas das áreas autorizadas na central de notificações.</p>
    </div>
  );
}
