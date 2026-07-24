"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Building2, Plus, Search } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { OrganizationFormModal } from "@/components/platform/OrganizationFormModal";
import { PLATFORM_STAFF, platformService } from "@/services/platformApi";
import type { PlatformOrganizationPage, PlatformStaff } from "@/types/platform";

export default function PlatformOrganizationsPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<PlatformOrganizationPage | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [canManage] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const role = (JSON.parse(localStorage.getItem(PLATFORM_STAFF) || "{}") as PlatformStaff).role;
      return role === "platform_owner" || role === "platform_admin";
    } catch { return false; }
  });

  useEffect(() => {
    let active = true;
    const params: Record<string, string> = {};
    if (query) params.search = query;
    if (statusFilter) params.is_active = statusFilter;
    platformService.organizations(params)
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) showToast("Não foi possível carregar as organizações.", "error"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, refreshKey, showToast, statusFilter]);
  const submit = (event: FormEvent) => { event.preventDefault(); setLoading(true); setQuery(search.trim()); };

  return <>
    <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4"><div><div className="platform-label mb-2">Clientes</div><h1 className="h2 fw-bold mb-1">Organizações</h1><p className="text-muted mb-0">Cadastre, consulte e gerencie organizações e assinaturas.</p></div><div className="d-flex align-items-center gap-2"><div className="platform-status active"><Building2 size={14}/>{data?.count ?? 0} organizações</div>{canManage && <button className="btn btn-dark d-flex align-items-center gap-2" onClick={() => setShowForm(true)}><Plus size={17}/>Nova organização</button>}</div></div>
    <div className="platform-card overflow-hidden">
      <div className="p-3 border-bottom"><form className="row g-2" onSubmit={submit}><div className="col-md"><div className="input-group"><span className="input-group-text bg-white"><Search size={17}/></span><input className="form-control" placeholder="Nome, documento, slug ou e-mail" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div><div className="col-md-3"><select className="form-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todos os status</option><option value="true">Ativas</option><option value="false">Suspensas</option></select></div><div className="col-auto"><button className="btn btn-dark">Buscar</button></div></form></div>
      <div className="table-responsive"><table className="table platform-table mb-0"><thead><tr><th>Organização</th><th>Plano</th><th>Usuários</th><th>Fazendas</th><th>Status</th><th>Cadastro</th><th /></tr></thead><tbody>{loading ? <tr><td colSpan={7} className="text-center py-5"><div className="spinner-border spinner-border-sm text-success" /></td></tr> : data?.results.length ? data.results.map((organization) => <tr key={organization.id}><td><div className="fw-semibold">{organization.name}</div><div className="text-muted small">{organization.document || organization.email || organization.slug}</div></td><td><span className="badge text-bg-light text-uppercase">{organization.plan}</span></td><td>{organization.users_count}</td><td>{organization.farms_count}</td><td><span className={`platform-status ${organization.is_active ? "active" : "suspended"}`}>{organization.is_active ? "Ativa" : "Suspensa"}</span></td><td className="text-muted small">{new Date(organization.created_at).toLocaleDateString("pt-BR")}</td><td className="text-end"><Link href={`/platform/organizations/${organization.id}`} className="btn btn-outline-secondary btn-sm">Detalhes</Link></td></tr>) : <tr><td colSpan={7} className="text-center text-muted py-5">Nenhuma organização encontrada.</td></tr>}</tbody></table></div>
    </div>
    {showForm && <OrganizationFormModal onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); setRefreshKey((value) => value + 1); showToast("Organização criada com sucesso.", "success"); }} />}
  </>;
}
