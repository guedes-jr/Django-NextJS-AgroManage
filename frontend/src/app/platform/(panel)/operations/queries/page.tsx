"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Database, Play, Terminal } from "lucide-react";

import { platformService } from "@/services/platformApi";
import type { ApprovedQuery, PlatformOrganization, SqlQueryResult } from "@/types/platform";

const cell = (value: unknown) => value === null ? "NULL" : typeof value === "object" ? JSON.stringify(value) : String(value);

export default function ApprovedQueriesPage() {
  const [queries, setQueries] = useState<ApprovedQuery[]>([]);
  const [organizations, setOrganizations] = useState<PlatformOrganization[]>([]);
  const [selected, setSelected] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [result, setResult] = useState<SqlQueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([platformService.approvedQueries(), platformService.organizations({ page_size: 100 })])
      .then(([catalog, organizationPage]) => {
        setQueries(catalog);
        setOrganizations(organizationPage.results);
        if (catalog[0]) setSelected(catalog[0].key);
      })
      .catch(() => setError("Não foi possível carregar as consultas aprovadas."));
  }, []);

  const current = queries.find((query) => query.key === selected);
  const execute = async () => {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      setResult(await platformService.runApprovedQuery(selected, organizationId));
    } catch (requestError: unknown) {
      const candidate = requestError as { response?: { data?: { detail?: string } } };
      setError(candidate.response?.data?.detail || "Não foi possível executar a consulta.");
    } finally { setRunning(false); }
  };

  return <>
    <div className="d-flex justify-content-between align-items-end mb-4"><div><div className="platform-label mb-2">Diagnósticos controlados</div><h1 className="h2 fw-bold mb-1">Consultas aprovadas</h1><p className="text-muted mb-0">Relatórios operacionais predefinidos, mascarados e auditados.</p></div><Link className="btn btn-outline-dark d-flex gap-2" href="/platform/operations/sql"><Terminal size={16}/>Console SQL avançado</Link></div>
    {error && <div className="alert alert-danger">{error}</div>}
    <div className="row g-4"><div className="col-lg-5"><div className="platform-card p-4"><div className="platform-icon mb-3"><Database size={20}/></div><label className="form-label fw-semibold">Consulta</label><select className="form-select" value={selected} onChange={(event) => { setSelected(event.target.value); setResult(null); }}><option value="">Selecione</option>{queries.map((query) => <option key={query.key} value={query.key}>{query.name}</option>)}</select>{current && <p className="text-muted small mt-3">{current.description}</p>}{current?.requires_organization && <><label className="form-label fw-semibold">Organização</label><select className="form-select" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}><option value="">Selecione</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></>}<button className="btn btn-dark d-flex gap-2 mt-4" disabled={running || !selected || Boolean(current?.requires_organization && !organizationId)} onClick={execute}><Play size={16}/>{running ? "Executando..." : "Executar consulta"}</button></div></div><div className="col-lg-7">{result ? <div className="platform-card overflow-hidden"><div className="p-4 border-bottom"><h2 className="h5 fw-bold mb-1">Resultado</h2><div className="text-muted small">{result.row_count} linhas · {result.duration_ms} ms{result.truncated ? " · truncado" : ""}</div></div><div className="table-responsive"><table className="table platform-table mb-0"><thead><tr>{result.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((value, index) => <td key={index} className="small">{cell(value)}</td>)}</tr>)}</tbody></table></div></div> : <div className="platform-card p-5 text-center text-muted">Selecione uma consulta para visualizar o resultado.</div>}</div></div>
  </>;
}
