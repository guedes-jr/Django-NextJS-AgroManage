"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ChevronRight, Search, Users } from "lucide-react";

import { getOrganizationErrorMessage } from "@/services/organizationInvitations";
import { platformService } from "@/services/platformApi";
import type { PlatformUserPage } from "@/types/platform";

const roleOptions: Record<string, string> = { admin: "Administrador", manager: "Gerente", operator: "Operador", feeder: "Tratador", veterinarian: "Veterinário" };
type Filters = { search: string; role: string; is_active: string; organization: string; page: number };

function readFilters(): Filters {
  const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  return { search: params.get("search") || "", role: params.get("role") || "", is_active: params.get("is_active") || "", organization: params.get("organization") || "", page: Number(params.get("page")) || 1 };
}

export default function PlatformUsersPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(readFilters);
  const [search, setSearch] = useState(filters.search);
  const [data, setData] = useState<PlatformUserPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const params: Record<string, string | number> = { page: filters.page };
    for (const key of ["search", "role", "is_active", "organization"] as const) if (filters[key]) params[key] = filters[key];
    const url = new URL(window.location.href);
    url.search = new URLSearchParams(Object.entries(params).filter(([key, value]) => !(key === "page" && value === 1)).map(([key, value]) => [key, String(value)])).toString();
    window.history.replaceState(null, "", url);
    platformService.users(params)
      .then(result => { if (active) { setData(result); setError(""); } })
      .catch(cause => { if (active) { setData(null); setError(getOrganizationErrorMessage(cause, "Não foi possível carregar os usuários.")); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, attempt]);

  const update = (patch: Partial<Filters>) => { setLoading(true); setFilters(current => ({ ...current, page: 1, ...patch })); };
  const submit = (event: FormEvent) => { event.preventDefault(); update({ search: search.trim() }); };
  const hasFilters = Boolean(filters.search || filters.role || filters.is_active || filters.organization);
  const totalPages = data?.total_pages || 1;

  return <div className="platform-management">
    <div className="platform-page-header">
      <div><div className="platform-label">Contas dos clientes</div><h1>Usuários</h1><p>Consulte, corrija dados, redefina senhas e controle o acesso das contas.</p></div>
      <span className="platform-pill success"><Users size={14}/><span className="tabular-nums">{data?.count ?? 0}</span> usuários</span>
    </div>
    <div className="platform-card overflow-hidden">
      <form className="platform-filter-bar" onSubmit={submit} role="search">
        <div className="input-group platform-search">
          <span className="input-group-text bg-white"><Search size={16}/></span>
          <input className="form-control" aria-label="Buscar usuários" placeholder="Nome, e-mail, telefone ou organização" value={search} onChange={event => setSearch(event.target.value)}/>
        </div>
        <select className="form-select" aria-label="Papel" value={filters.role} onChange={event => update({ role: event.target.value })}>
          <option value="">Todos os papéis</option>{Object.entries(roleOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select className="form-select" aria-label="Situação" value={filters.is_active} onChange={event => update({ is_active: event.target.value })}>
          <option value="">Todas as situações</option><option value="true">Ativos</option><option value="false">Bloqueados</option>
        </select>
        <button className="btn btn-dark">Buscar</button>
        {hasFilters && <button type="button" className="btn btn-link btn-sm" onClick={() => { setSearch(""); update({ search: "", role: "", is_active: "", organization: "" }); }}>Limpar filtros</button>}
      </form>
      {filters.organization && <div className="px-3 pt-2 small text-muted">Filtrando por uma organização. <button className="btn btn-link btn-sm p-0 align-baseline" onClick={() => update({ organization: "" })}>Ver todas</button></div>}
      {error ? <div className="alert alert-danger m-3" role="alert">{error} <button className="btn btn-sm btn-outline-danger ms-2" onClick={() => { setLoading(true); setAttempt(value => value + 1); }}>Tentar novamente</button></div> :
      <div className="table-responsive"><table className="table platform-table mb-0">
        <thead><tr><th>Usuário</th><th>Organização</th><th>Papel</th><th>Situação</th><th>Último acesso</th><th><span className="visually-hidden">Abrir</span></th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={6} className="text-center py-5" role="status"><div className="spinner-border spinner-border-sm text-success"/><span className="ms-2">Carregando usuários…</span></td></tr>
          : data?.results.length ? data.results.map(user => <tr key={user.id} className="platform-row-link" onClick={() => router.push(`/platform/users/${user.id}`)}>
            <td><div className="fw-semibold">{user.full_name}</div><div className="text-muted small">{user.email}</div></td>
            <td>{user.organization_name || <span className="platform-pill warning">Sem organização</span>}</td>
            <td><span className="platform-pill">{user.role_display}</span>{user.organization_responsible && <div className="small text-muted mt-1">Responsável</div>}</td>
            <td><span className={`platform-pill ${user.is_active ? "success" : "danger"}`}>{user.is_active ? "Ativo" : "Bloqueado"}</span>{user.force_password_change && <div className="small text-muted mt-1">Troca de senha pendente</div>}</td>
            <td className="text-muted small tabular-nums">{user.last_login ? new Date(user.last_login).toLocaleString("pt-BR") : "Nunca acessou"}</td>
            <td className="text-end"><Link href={`/platform/users/${user.id}`} className="btn btn-outline-secondary btn-sm" onClick={event => event.stopPropagation()}>Gerenciar<ChevronRight size={14}/></Link></td>
          </tr>) : <tr><td colSpan={6} className="text-center text-muted py-5">{hasFilters ? "Nenhum usuário corresponde aos filtros." : "Nenhum usuário cadastrado."}</td></tr>}
        </tbody>
      </table></div>}
      {data && data.count > 0 && <div className="platform-pagination">
        <span>Página {filters.page} de {totalPages} · {data.count} usuários</span>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-secondary" disabled={loading || !data.previous} onClick={() => { setLoading(true); setFilters(current => ({ ...current, page: current.page - 1 })); }}>Anterior</button>
          <button className="btn btn-sm btn-outline-secondary" disabled={loading || !data.next} onClick={() => { setLoading(true); setFilters(current => ({ ...current, page: current.page + 1 })); }}>Próxima</button>
        </div>
      </div>}
    </div>
  </div>;
}
