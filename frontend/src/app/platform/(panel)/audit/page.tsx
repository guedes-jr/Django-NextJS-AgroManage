"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Eye, Filter, Search, ShieldCheck, X } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { platformService } from "@/services/platformApi";
import type { PlatformAuditLog, PlatformAuditLogPage, PlatformOrganization } from "@/types/platform";

interface AuditFilters {
  search: string;
  action: string;
  organization: string;
  created_after: string;
  created_before: string;
}

const emptyFilters: AuditFilters = { search: "", action: "", organization: "", created_after: "", created_before: "" };

export default function PlatformAuditPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<PlatformAuditLogPage | null>(null);
  const [organizations, setOrganizations] = useState<PlatformOrganization[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [draft, setDraft] = useState<AuditFilters>(emptyFilters);
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<PlatformAuditLog | null>(null);

  const params = useMemo(() => {
    const result: Record<string, string | number> = { page, page_size: 25 };
    Object.entries(filters).forEach(([key, value]) => { if (value) result[key] = value; });
    return result;
  }, [filters, page]);

  const load = useCallback(() => {
    platformService.auditLogs(params)
      .then(setData)
      .catch(() => showToast("Não foi possível carregar os registros de auditoria.", "error"))
      .finally(() => setLoading(false));
  }, [params, showToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    Promise.all([
      platformService.auditOptions(),
      platformService.organizations({ page_size: 200 }),
    ]).then(([options, organizationPage]) => {
      setActions(options.actions);
      setOrganizations(organizationPage.results);
    }).catch(() => undefined);
  }, []);

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setLoading(true);
    setFilters(draft);
  };

  const clearFilters = () => {
    setDraft(emptyFilters);
    setFilters(emptyFilters);
    setPage(1);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const exportParams = { ...params };
      delete exportParams.page;
      delete exportParams.page_size;
      await platformService.exportAuditLogs(exportParams);
      showToast("Relatório de auditoria exportado.", "success");
    } catch { showToast("Não foi possível exportar a auditoria.", "error"); }
    finally { setExporting(false); }
  };

  return <>
    <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
      <div><div className="platform-label mb-2">Governança e segurança</div><h1 className="h2 fw-bold mb-1">Central de Auditoria</h1><p className="text-muted mb-0">Histórico imutável das ações realizadas no backoffice.</p></div>
      <button className="btn btn-outline-dark d-flex align-items-center gap-2" onClick={exportCsv} disabled={exporting}><Download size={17} />{exporting ? "Exportando..." : "Exportar CSV"}</button>
    </div>

    <form className="platform-card p-3 mb-3" onSubmit={applyFilters}>
      <div className="row g-2">
        <div className="col-lg-4"><div className="input-group"><span className="input-group-text bg-white"><Search size={17} /></span><input className="form-control" placeholder="Ator, descrição, objeto, IP ou request ID" value={draft.search} onChange={(event) => setDraft({ ...draft, search: event.target.value })} /></div></div>
        <div className="col-md-4 col-lg-2"><select className="form-select" value={draft.action} onChange={(event) => setDraft({ ...draft, action: event.target.value })}><option value="">Todas as ações</option>{actions.map((action) => <option key={action} value={action}>{action}</option>)}</select></div>
        <div className="col-md-4 col-lg-2"><select className="form-select" value={draft.organization} onChange={(event) => setDraft({ ...draft, organization: event.target.value })}><option value="">Todas as organizações</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></div>
        <div className="col-md-2 col-lg"><input type="date" className="form-control" title="Data inicial" value={draft.created_after} onChange={(event) => setDraft({ ...draft, created_after: event.target.value })} /></div>
        <div className="col-md-2 col-lg"><input type="date" className="form-control" title="Data final" value={draft.created_before} onChange={(event) => setDraft({ ...draft, created_before: event.target.value })} /></div>
        <div className="col-auto"><button className="btn btn-dark d-flex gap-2 align-items-center"><Filter size={16} />Filtrar</button></div>
        <div className="col-auto"><button type="button" className="btn btn-outline-secondary" onClick={clearFilters} title="Limpar filtros"><X size={17} /></button></div>
      </div>
    </form>

    <div className="platform-card overflow-hidden">
      <div className="table-responsive"><table className="table platform-table mb-0">
        <thead><tr><th>Data e hora</th><th>Ação</th><th>Ator</th><th>Organização</th><th>Descrição</th><th>IP</th><th /></tr></thead>
        <tbody>{loading ? <tr><td colSpan={7} className="text-center py-5"><span className="spinner-border spinner-border-sm text-success" /></td></tr> : data?.results.length ? data.results.map((log) => <tr key={log.id}>
          <td className="small text-nowrap">{new Date(log.created_at).toLocaleString("pt-BR")}</td>
          <td><code className="small">{log.action}</code></td>
          <td><div className="fw-semibold">{log.actor_name || "Sistema"}</div><div className="text-muted small">{log.actor_email}</div></td>
          <td>{log.organization_name || <span className="text-muted">Global</span>}</td>
          <td><div style={{ maxWidth: 360 }} className="text-truncate">{log.description || "—"}</div></td>
          <td className="small text-muted">{log.ip_address || "—"}</td>
          <td className="text-end"><button className="btn btn-sm btn-outline-secondary" onClick={() => setSelected(log)} title="Ver detalhes"><Eye size={15} /></button></td>
        </tr>) : <tr><td colSpan={7} className="text-center text-muted py-5">Nenhum registro encontrado para os filtros selecionados.</td></tr>}</tbody>
      </table></div>
      <div className="p-3 border-top d-flex justify-content-between align-items-center">
        <span className="small text-muted">{data?.count || 0} registros · Página {page} de {Math.max(data?.total_pages || 1, 1)}</span>
        <div className="btn-group"><button className="btn btn-sm btn-outline-secondary" disabled={!data?.previous} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16} /> Anterior</button><button className="btn btn-sm btn-outline-secondary" disabled={!data?.next} onClick={() => setPage((value) => value + 1)}>Próxima <ChevronRight size={16} /></button></div>
      </div>
    </div>
    {selected && <AuditDetail log={selected} onClose={() => setSelected(null)} />}
  </>;
}

function AuditDetail({ log, onClose }: { log: PlatformAuditLog; onClose: () => void }) {
  return <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3" style={{ zIndex: 1100, background: "rgba(15,23,42,.55)", backdropFilter: "blur(3px)" }} onMouseDown={onClose}><div className="platform-card w-100 overflow-auto" style={{ maxWidth: 760, maxHeight: "calc(100vh - 32px)" }} onMouseDown={(event) => event.stopPropagation()}>
    <div className="p-4 border-bottom d-flex justify-content-between"><div className="d-flex gap-3"><div className="platform-icon"><ShieldCheck size={20} /></div><div><h2 className="h4 fw-bold mb-1">Detalhes da auditoria</h2><code>{log.action}</code></div></div><button className="btn btn-sm btn-light align-self-start" onClick={onClose}><X size={18} /></button></div>
    <div className="p-4"><div className="row g-4">
      <Detail label="Data e hora" value={new Date(log.created_at).toLocaleString("pt-BR")} />
      <Detail label="Ator" value={`${log.actor_name || "Sistema"}${log.actor_email ? ` · ${log.actor_email}` : ""}`} />
      <Detail label="Organização" value={log.organization_name || "Ação global"} />
      <Detail label="Endereço IP" value={log.ip_address || "Não registrado"} />
      <Detail label="Objeto afetado" value={log.object_type ? `${log.object_type} #${log.object_id}` : "Não informado"} />
      <Detail label="Request ID" value={log.request_id || "Não registrado"} />
      <div className="col-12"><div className="platform-label mb-1">Descrição</div><div>{log.description || "Sem descrição"}</div></div>
      <div className="col-12"><div className="platform-label mb-1">Alterações e dados adicionais</div><pre className="bg-light border rounded p-3 small mb-0 overflow-auto">{Object.keys(log.extra_data).length ? JSON.stringify(log.extra_data, null, 2) : "Nenhum dado adicional registrado."}</pre></div>
      <div className="col-12"><div className="platform-label mb-1">Navegador / agente</div><div className="small text-muted text-break">{log.user_agent || "Não registrado"}</div></div>
    </div></div>
  </div></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="col-md-6"><div className="platform-label mb-1">{label}</div><div>{value}</div></div>;
}
