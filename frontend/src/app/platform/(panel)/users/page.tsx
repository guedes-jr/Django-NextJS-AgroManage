"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Search, Users } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { platformService } from "@/services/platformApi";
import type { PlatformUserPage } from "@/types/platform";

export default function PlatformUsersPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<PlatformUserPage | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const params: Record<string, string> = {};
    if (query) params.search = query;
    if (role) params.role = role;
    if (statusFilter) params.is_active = statusFilter;
    platformService.users(params)
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) showToast("Não foi possível carregar os usuários.", "error"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, role, showToast, statusFilter]);
  const submit = (event: FormEvent) => { event.preventDefault(); setLoading(true); setQuery(search.trim()); };

  return <>
    <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4"><div><div className="platform-label mb-2">Contas dos clientes</div><h1 className="h2 fw-bold mb-1">Usuários</h1><p className="text-muted mb-0">Consulte acessos, vínculos e situação das contas.</p></div><div className="platform-status active"><Users size={14}/>{data?.count ?? 0} usuários</div></div>
    <div className="platform-card overflow-hidden">
      <div className="p-3 border-bottom"><form className="row g-2" onSubmit={submit}><div className="col-lg"><div className="input-group"><span className="input-group-text bg-white"><Search size={17}/></span><input className="form-control" placeholder="Nome, e-mail, telefone ou organização" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div><div className="col-sm-4 col-lg-2"><select className="form-select" value={role} onChange={(event) => setRole(event.target.value)}><option value="">Todos os papéis</option><option value="owner">Owner</option><option value="admin">Admin</option><option value="manager">Gerente</option><option value="operator">Operador</option><option value="viewer">Visualizador</option></select></div><div className="col-sm-4 col-lg-2"><select className="form-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todos os status</option><option value="true">Ativos</option><option value="false">Bloqueados</option></select></div><div className="col-auto"><button className="btn btn-dark">Buscar</button></div></form></div>
      <div className="table-responsive"><table className="table platform-table mb-0"><thead><tr><th>Usuário</th><th>Organização</th><th>Papel</th><th>Status</th><th>Último login</th><th /></tr></thead><tbody>{loading ? <tr><td colSpan={6} className="text-center py-5"><div className="spinner-border spinner-border-sm text-success" /></td></tr> : data?.results.length ? data.results.map((user) => <tr key={user.id}><td><div className="fw-semibold">{user.full_name}</div><div className="text-muted small">{user.email}</div></td><td>{user.organization_name || <span className="text-warning">Sem organização</span>}</td><td><span className="badge text-bg-light">{user.role_display}</span></td><td><span className={`platform-status ${user.is_active ? "active" : "suspended"}`}>{user.is_active ? "Ativo" : "Bloqueado"}</span></td><td className="text-muted small">{user.last_login ? new Date(user.last_login).toLocaleString("pt-BR") : "Nunca acessou"}</td><td className="text-end"><Link href={`/platform/users/${user.id}`} className="btn btn-outline-secondary btn-sm">Detalhes</Link></td></tr>) : <tr><td colSpan={6} className="text-center text-muted py-5">Nenhum usuário encontrado.</td></tr>}</tbody></table></div>
    </div>
  </>;
}
