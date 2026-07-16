"use client";

import { useCallback, useEffect, useState } from "react";
import { Play, RefreshCw, ShieldCheck } from "lucide-react";

import { platformService } from "@/services/platformApi";
import type { SqlExplainResult, SqlHistoryPage, SqlQueryResult } from "@/types/platform";

const initialQuery = "SELECT id, name, slug, is_active, created_at\nFROM organizations_organization\nORDER BY created_at DESC";

function showCell(value: unknown) {
  if (value === null) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function SqlConsolePage() {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<SqlQueryResult | null>(null);
  const [explain, setExplain] = useState<SqlExplainResult | null>(null);
  const [history, setHistory] = useState<SqlHistoryPage | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const loadHistory = useCallback(() => {
    platformService.sqlHistory().then(setHistory).catch(() => setHistory(null));
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const execute = async () => {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      setResult(await platformService.executeSql(query));
    } catch (requestError: unknown) {
      const candidate = requestError as { response?: { data?: { detail?: string; query?: string[] } } };
      setError(candidate.response?.data?.detail || candidate.response?.data?.query?.[0] || "Não foi possível executar a consulta.");
    } finally {
      setRunning(false);
      loadHistory();
    }
  };

  const explainQuery = async () => {
    setRunning(true);
    setError("");
    setExplain(null);
    try {
      setExplain(await platformService.explainSql(query));
    } catch (requestError: unknown) {
      const candidate = requestError as { response?: { data?: { detail?: string } } };
      setError(candidate.response?.data?.detail || "Não foi possível gerar o plano da consulta.");
    } finally {
      setRunning(false);
      loadHistory();
    }
  };

  return (
    <>
      <div className="mb-4">
        <div className="platform-label mb-2">Ferramenta de desenvolvedor</div>
        <h1 className="h2 fw-bold mb-1">Console SQL somente leitura</h1>
        <p className="text-muted mb-0">Uma instrução SELECT/WITH por vez, timeout de 3 segundos e até 200 linhas.</p>
      </div>

      <div className="alert alert-warning d-flex gap-2"><ShieldCheck size={20} className="flex-shrink-0" />As consultas e tentativas rejeitadas são auditadas. Valores literais são ocultados no histórico.</div>
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="platform-card p-4">
        <label className="form-label fw-semibold" htmlFor="sql-query">Consulta</label>
        <textarea id="sql-query" className="form-control font-monospace" rows={9} value={query} onChange={(event) => setQuery(event.target.value)} spellCheck={false} maxLength={10000} />
        <div className="d-flex justify-content-between align-items-center mt-3">
          <span className="text-muted small">Escrita, COPY, múltiplas instruções e funções sensíveis são bloqueadas.</span>
          <div className="d-flex gap-2"><button className="btn btn-outline-dark" disabled={running || !query.trim()} onClick={explainQuery}>Analisar plano</button><button className="btn btn-dark d-flex gap-2 align-items-center" disabled={running || !query.trim()} onClick={execute}><Play size={16} />{running ? "Processando..." : "Executar"}</button></div>
        </div>
      </div>

      {result && <div className="platform-card overflow-hidden mt-4"><div className="p-4 border-bottom d-flex justify-content-between"><div><h2 className="h5 fw-bold mb-1">Resultado</h2><div className="text-muted small">{result.row_count} linhas · {result.duration_ms} ms{result.was_truncated ? " · resultado truncado" : ""}</div></div></div><div className="table-responsive"><table className="table platform-table mb-0"><thead><tr>{result.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td className="font-monospace small" key={cellIndex}>{showCell(cell)}</td>)}</tr>)}</tbody></table></div></div>}

      {explain && <div className="platform-card overflow-hidden mt-4"><div className="p-4 border-bottom"><h2 className="h5 fw-bold mb-1">Plano estimado</h2><div className="text-muted small">{explain.database} · {explain.duration_ms} ms · sem ANALYZE</div></div><pre className="p-4 mb-0 overflow-auto small">{JSON.stringify(explain.plan, null, 2)}</pre></div>}

      <div className="platform-card overflow-hidden mt-4">
        <div className="p-4 border-bottom d-flex justify-content-between align-items-center"><div><h2 className="h5 fw-bold mb-1">Histórico recente</h2><div className="text-muted small">Consultas com literais redigidos e resultado resumido.</div></div><button className="btn btn-outline-secondary btn-sm" onClick={loadHistory}><RefreshCw size={15} /></button></div>
        <div className="table-responsive"><table className="table platform-table mb-0"><thead><tr><th>Consulta</th><th>Status</th><th>Linhas</th><th>Duração</th><th>Data</th></tr></thead><tbody>{history?.results.length ? history.results.map((item) => <tr key={item.id}><td><code className="text-wrap">{item.query_text}</code>{item.error_message && <div className="text-danger small mt-1">{item.error_message}</div>}</td><td><span className={`platform-status ${item.status === "success" ? "active" : "suspended"}`}>{item.status_display}</span></td><td>{item.row_count}{item.was_truncated ? "+" : ""}</td><td>{item.duration_ms} ms</td><td className="small">{new Date(item.created_at).toLocaleString("pt-BR")}</td></tr>) : <tr><td colSpan={5} className="text-center text-muted py-4">Nenhuma consulta registrada.</td></tr>}</tbody></table></div>
      </div>
    </>
  );
}
