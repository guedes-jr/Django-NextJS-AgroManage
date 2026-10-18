"use client";

import { FormEvent, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { platformService } from "@/services/platformApi";
import { getOrganizationErrorMessage } from "@/services/organizationInvitations";
import type { OrganizationResponsible, OrganizationResponsiblePage, PlatformOrganization } from "@/types/platform";

export function OrganizationResponsibleModal({ organization, onClose, onSaved }: {
  organization: PlatformOrganization;
  onClose: () => void;
  onSaved: (organization: PlatformOrganization) => void;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OrganizationResponsiblePage | null>(null);
  const [selected, setSelected] = useState<OrganizationResponsible | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    platformService.responsibleCandidates(organization.id, { search: query, page }).then(result => {
      if (active) { setData(result); setLoadError(""); }
    }).catch(reason => {
      if (active) { setData(null); setLoadError(getOrganizationErrorMessage(reason, "Não foi possível carregar os usuários.")); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organization.id, page, query, refresh]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);

  const keyboard = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !saving) onClose();
    if (event.key !== "Tab") return;
    const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)") || []);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  const searchUsers = (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setPage(1);
    setQuery(search.trim());
    setRefresh(value => value + 1);
  };
  const transfer = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      onSaved(await platformService.transferResponsible(organization.id, selected.id, organization.responsible?.id || null));
    } catch (reason) {
      setError(getOrganizationErrorMessage(reason, "Não foi possível transferir o responsável."));
    } finally { setSaving(false); }
  };

  return <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3" style={{ zIndex: 1100, background: "rgba(15,23,42,.55)" }} onClick={() => { if (!saving) onClose(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="responsible-title" className="platform-card p-4 w-100 overflow-auto" style={{ maxWidth: 760, maxHeight: "90vh" }} onClick={event => event.stopPropagation()} onKeyDown={keyboard}>
      <div className="d-flex justify-content-between align-items-start gap-3 mb-3"><div><h2 className="h4" id="responsible-title">{organization.responsible ? "Transferir responsável" : "Definir responsável"}</h2><p className="text-muted mb-0">{organization.name}</p></div><button ref={closeButton} type="button" className="btn btn-sm btn-light" aria-label="Fechar" disabled={saving} onClick={onClose}><X size={18}/></button></div>
      <p>Responsável atual: <strong>{organization.responsible?.full_name || "Não definido"}</strong></p>
      <form className="d-flex gap-2 mb-3" onSubmit={searchUsers}><input aria-label="Buscar usuário por nome ou e-mail" className="form-control" placeholder="Nome ou e-mail" value={search} onChange={event => setSearch(event.target.value)} disabled={saving}/><button className="btn btn-outline-secondary" disabled={saving}>Buscar</button></form>
      {loading ? <p role="status">Carregando usuários…</p> : loadError ? <div className="alert alert-danger" role="alert">{loadError}<button className="btn btn-link" onClick={() => { setLoading(true); setRefresh(value => value + 1); }}>Tentar novamente</button></div> : <>
        {!data?.results.length ? <div className="alert alert-info">Nenhum usuário ativo elegível encontrado nesta organização.</div> : <fieldset disabled={saving}><legend className="h6">Selecione o novo responsável</legend>{data.results.map(user => <label key={user.id} className="d-flex align-items-center gap-3 border rounded p-3 mb-2"><input type="radio" name="responsible" checked={selected?.id === user.id} onChange={() => { setSelected(user); setError(""); }}/><span><strong>{user.full_name}</strong><span className="d-block small text-muted">{user.email} · {user.role_display}</span></span></label>)}</fieldset>}
        {data && <div className="d-flex align-items-center gap-2 my-3"><button className="btn btn-sm btn-outline-secondary" disabled={!data.previous || saving} onClick={() => { setLoading(true); setPage(value => value - 1); }}>Anterior</button><span className="small">Página {page} · {data.count} usuários</span><button className="btn btn-sm btn-outline-secondary" disabled={!data.next || saving} onClick={() => { setLoading(true); setPage(value => value + 1); }}>Próxima</button></div>}
      </>}
      <form onSubmit={transfer}>
        {selected && <div className="alert alert-info"><strong>Novo responsável: {selected.full_name}</strong><div>{selected.role !== "admin" ? "O usuário será promovido a administrador e precisará entrar novamente." : "O usuário manterá seu acesso de administrador."} O responsável anterior mantém seu cargo de administrador e o estado atual da conta.</div></div>}
        {organization.administrator_invitation && !organization.administrator_invitation.accepted_at && !organization.administrator_invitation.revoked_at && <p className="small text-muted">O convite pendente do primeiro administrador será invalidado ao confirmar a troca.</p>}
        {error && <div className="alert alert-danger" role="alert">{error} <span>Se os dados mudaram, feche esta janela e recarregue a organização.</span></div>}
        <div className="d-flex justify-content-end gap-2"><button className="btn btn-outline-secondary" type="button" disabled={saving} onClick={onClose}>Cancelar</button><button className="btn btn-success" disabled={!selected || saving || loading || !!loadError}>{saving ? "Transferindo…" : "Confirmar responsável"}</button></div>
      </form>
    </div>
  </div>;
}
