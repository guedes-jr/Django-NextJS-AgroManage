import Link from "next/link";
import { Sprout, Beef, ClipboardList, ShieldCheck } from "lucide-react";
import type { OrganizationAccess } from "@/services/organizationAccess";
import { useOrganizationLocale, type TranslationKey } from "@/lib/locale";

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
  const { language, t } = useOrganizationLocale();
  const numberFormat = new Intl.NumberFormat(language);
  const areas = data.access.can_operate_crops || !!data.access.livestock_species?.length;
  const speciesLabels: Record<string, TranslationKey> = {
    suinos: "sidebar.swine",
    bovinos: "sidebar.beefCattle",
    aves: "sidebar.birds",
  };

  return (
    <div className="org-dashboard">
      <header className="org-dashboard-header">
        <div>
          <span className="small text-success fw-semibold">
            <ShieldCheck size={16} /> {t("operator.access")}{data.access.read_only ? ` · ${t("operator.readOnly")}` : ""}
          </span>
          <h1>{t("operator.title")}</h1>
          <p>{data.organization} · {t("operator.description")}</p>
        </div>
        <Link className="btn btn-outline-success" href="/home/profile">{t("operator.account")}</Link>
      </header>
      {!areas && (
        <div className="alert alert-info">
          {t("operator.noAreas")}
        </div>
      )}
      <section className="row g-3 mb-4" aria-label={t("operator.authorizedAreas")}>
        {data.access.can_operate_crops && (
          <div className="col-md-6 col-xl-4">
            <article className="org-info-panel h-100">
              <Sprout className="text-success mb-2" />
              <h2 className="h5">{t("sidebar.plantations")}</h2>
              <strong className="fs-2">{numberFormat.format(data.operational.plantations ?? 0)}</strong>
              <p className="text-muted">{t("operator.plantationsRegistered")}</p>
              <Link href="/home/plantacoes" className="btn btn-success btn-sm">{t("operator.openPlantations")}</Link>
            </article>
          </div>
        )}
        {(data.access.livestock_species || []).map(code => {
          const herd = data.operational.herds.find(entry => entry.code === code);
          return (
            <div className="col-md-6 col-xl-4" key={code}>
              <article className="org-info-panel h-100">
                <Beef className="text-success mb-2" />
                <h2 className="h5">{speciesLabels[code] ? t(speciesLabels[code]) : herd?.name || code}</h2>
                <div className="d-flex gap-4">
                  <div><strong className="fs-2">{numberFormat.format(herd?.batches || 0)}</strong><small className="d-block text-muted">{t("operator.activeHerds")}</small></div>
                  <div><strong className="fs-2">{numberFormat.format(herd?.quantity || 0)}</strong><small className="d-block text-muted">{t("operator.animalsInHerds")}</small></div>
                </div>
                <p className="small text-muted mt-2">{t("operator.individualAnimals").replace("{count}", numberFormat.format(herd?.individuals || 0))}</p>
                <Link href={`/home/seguimento/${encodeURIComponent(code)}`} className="btn btn-success btn-sm">{t("operator.openHerd")}</Link>
              </article>
            </div>
          );
        })}
      </section>
      <section className="org-info-panel">
        <h2 className="h5"><ClipboardList size={20} className="me-2" />{t("operator.assignedTasks")}</h2>
        {!data.tasks.length ? <p className="text-muted mb-0">{t("operator.noPendingTasks")}</p> : (
          <div className="org-task-list">
            {data.tasks.map(task => (
              <div key={task.id} className="info">
                <p>
                  <strong>{task.title}</strong>
                  <small>{task.due_date ? t("operator.dueDate").replace("{date}", new Date(`${task.due_date}T00:00:00`).toLocaleDateString(language)) : t("operator.noDueDate")}</small>
                </p>
                <span className="badge bg-success-subtle text-success">{task.status === "in_progress" ? t("operator.inProgress") : t("operator.pending")}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <p className="small text-muted mt-3">{t("operator.alertsHint")}</p>
    </div>
  );
}
