"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Archive, ArrowLeft, Boxes, Building2, Eye, Pencil, RefreshCcw, Sprout, Users, WalletCards } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { OrganizationFormModal } from "@/components/platform/OrganizationFormModal";
import { PLATFORM_STAFF, platformService } from "@/services/platformApi";
import type { PlatformOrganization, PlatformStaff } from "@/types/platform";

export default function PlatformOrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const [organization, setOrganization] = useState<PlatformOrganization | null>(null);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [canManage] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const role = (JSON.parse(localStorage.getItem(PLATFORM_STAFF) || "{}") as PlatformStaff).role;
      return role === "platform_owner" || role === "platform_admin";
    } catch { return false; }
  });

  useEffect(() => {
    let active = true;
    platformService.organization(id)
      .then((result) => { if (active) setOrganization(result); })
      .catch(() => { if (active) showToast("Não foi possível carregar a organização.", "error"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, showToast]);

  const changeStatus = async () => {
    if (!organization) return;
    const action = organization.is_active ? "suspender" : "reativar";
    if (!window.confirm(`Deseja realmente ${action} ${organization.name}?`)) return;
    setChanging(true);
    try {
      if (organization.is_active) await platformService.suspendOrganization(organization.id);
      else await platformService.activateOrganization(organization.id);
      showToast(`Organização ${organization.is_active ? "suspensa" : "reativada"} com sucesso.`, "success");
      setOrganization(await platformService.organization(id));
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      showToast(status === 403 ? "Seu papel não permite alterar organizações." : "Não foi possível alterar a organização.", "error");
    } finally { setChanging(false); }
  };

  const archive = async () => {
    if (!organization || !window.confirm(`Arquivar ${organization.name}? Os dados serão preservados e o acesso dos usuários será bloqueado.`)) return;
    setChanging(true);
    try {
      await platformService.archiveOrganization(organization.id);
      setOrganization(await platformService.organization(id));
      showToast("Organização arquivada com sucesso.", "success");
    } catch { showToast("Não foi possível arquivar a organização.", "error"); }
    finally { setChanging(false); }
  };

  if (loading) return <div className="py-5 text-center"><div className="spinner-border text-success" /></div>;
  if (!organization) return <div className="alert alert-danger">Organização não encontrada.</div>;

  const metrics = [
    {label:"Usuários", value:organization.users_count, icon:Users},
    {label:"Fazendas", value:organization.farms_count, icon:Building2},
    {label:"Ciclos de plantio", value:organization.planting_cycles_count ?? 0, icon:Sprout},
    {label:"Itens de estoque", value:organization.inventory_items_count ?? 0, icon:Boxes},
    {label:"Transações", value:organization.transactions_count ?? 0, icon:WalletCards},
  ];

  return <>
    <Link href="/platform/organizations" className="text-decoration-none text-muted d-inline-flex align-items-center gap-2 mb-3"><ArrowLeft size={16}/> Voltar às organizações</Link>
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4"><div><div className="d-flex align-items-center gap-2 mb-2"><span className={`platform-status ${organization.is_active ? "active" : "suspended"}`}>{organization.is_active ? "Ativa" : "Arquivada"}</span><span className="badge text-bg-dark text-uppercase">{organization.plan}</span></div><h1 className="h2 fw-bold mb-1">{organization.name}</h1><p className="text-muted mb-0">{organization.document || "Documento não informado"} · {organization.slug}</p></div><div className="d-flex flex-wrap gap-2">{organization.is_active && <Link className="btn btn-outline-dark d-flex align-items-center gap-2" href={`/platform/support-access?organization=${organization.id}`}><Eye size={16}/>Acesso assistido</Link>}{canManage && <button className="btn btn-outline-secondary d-flex align-items-center gap-2" onClick={() => setShowEdit(true)}><Pencil size={16}/>Editar</button>}{canManage && (organization.is_active ? <button className="btn btn-outline-danger d-flex align-items-center gap-2" onClick={archive} disabled={changing}><Archive size={16}/>{changing ? "Processando..." : "Arquivar"}</button> : <button className="btn btn-success d-flex align-items-center gap-2" onClick={changeStatus} disabled={changing}><RefreshCcw size={16}/>{changing ? "Processando..." : "Reativar organização"}</button>)}</div></div>
    <div className="row g-3 mb-4">{metrics.map((metric) => <div className="col-6 col-lg" key={metric.label}><div className="platform-card p-3 h-100"><div className="platform-icon mb-3"><metric.icon size={19}/></div><div className="fs-4 fw-bold">{metric.value}</div><div className="text-muted small">{metric.label}</div></div></div>)}</div>
    <div className="platform-card p-4"><h2 className="h5 fw-bold mb-4">Dados cadastrais</h2><div className="row g-4"><div className="col-md-6"><div className="platform-label mb-1">E-mail</div><div>{organization.email || "Não informado"}</div></div><div className="col-md-6"><div className="platform-label mb-1">Telefone</div><div>{organization.phone || "Não informado"}</div></div><div className="col-md-6"><div className="platform-label mb-1">Endereço</div><div>{organization.address || "Não informado"}</div></div><div className="col-md-3"><div className="platform-label mb-1">Plano</div><div className="text-uppercase fw-semibold">{organization.plan}</div></div><div className="col-md-3"><div className="platform-label mb-1">Ciclo</div><div className="text-capitalize">{organization.billing_cycle === "yearly" ? "Anual" : organization.billing_cycle === "custom" ? "Personalizado" : "Mensal"}</div></div><div className="col-md-6"><div className="platform-label mb-1">Última atualização</div><div>{new Date(organization.updated_at).toLocaleString("pt-BR")}</div></div></div></div>
    {showEdit && <OrganizationFormModal organization={organization} onClose={() => setShowEdit(false)} onSaved={(updated) => { setOrganization(updated); setShowEdit(false); showToast("Organização atualizada com sucesso.", "success"); }} />}
  </>;
}
