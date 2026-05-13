"use client";

import { useState } from "react";
import { Eye, Edit2, Zap, Search } from "lucide-react";
import "./reproducao.css";

export type BadgeVariant = "green" | "blue" | "amber" | "red" | "purple" | "gray" | "teal";

export interface TableColumn {
  key: string;
  label: string;
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
}

export interface TableRow {
  [key: string]: unknown;
}

export interface QuickAction {
  label: string;
  icon?: React.ReactNode;
  onClick: (row: TableRow) => void;
  variant?: "primary" | "default" | "danger";
}

interface ReproducaoTabContentProps {
  columns: TableColumn[];
  rows: TableRow[];
  statusKey?: string;
  statusMap?: Record<string, { label: string; variant: BadgeVariant }>;
  searchPlaceholder?: string;
  filterKey?: string;
  filterOptions?: { value: string; label: string }[];
  actions?: QuickAction[];
  emptyIcon?: string;
  emptyText?: string;
}

export function StatusBadge({
  status,
  statusMap,
}: {
  status: string;
  statusMap: Record<string, { label: string; variant: BadgeVariant }>;
}) {
  const cfg = statusMap[status] ?? { label: status, variant: "gray" as BadgeVariant };
  
  const variantStyles: Record<string, string> = {
    green: "bg-success/15 text-success border-success/20",
    blue: "bg-primary/15 text-primary border-primary/20",
    amber: "bg-warning/15 text-warning border-warning/20",
    red: "bg-danger/15 text-danger border-danger/20",
    purple: "bg-info/15 text-info border-info/20",
    gray: "bg-muted text-muted-foreground border-border",
    teal: "bg-info/15 text-info border-info/20",
  };

  const dotColors: Record<string, string> = {
    green: "bg-success",
    blue: "bg-primary",
    amber: "bg-warning",
    red: "bg-danger",
    purple: "bg-info",
    gray: "bg-muted-foreground",
    teal: "bg-info",
  };

  const badgeClass = variantStyles[cfg.variant] || variantStyles.gray;
  const dotClass = dotColors[cfg.variant] || dotColors.gray;

  return (
    <span className={`badge rounded-pill px-3 py-2 fw-semibold d-inline-flex align-items-center gap-1 border ${badgeClass}`}>
      <div className={`rounded-circle ${dotClass}`} style={{ width: '6px', height: '6px' }}></div>
      {cfg.label}
    </span>
  );
}

export function ReproducaoTabContent({
  columns,
  rows,
  statusKey,
  statusMap = {},
  searchPlaceholder = "Buscar...",
  filterKey,
  filterOptions = [],
  actions = [],
  emptyIcon = "🐾",
  emptyText = "Nenhum registro encontrado",
}: ReproducaoTabContentProps) {
  const [search, setSearch] = useState("");
  const [filterVal, setFilterVal] = useState("all");

  const filtered = rows.filter((row) => {
    const searchLower = search.toLowerCase();
    const matchSearch =
      search === "" ||
      Object.values(row).some((v) =>
        String(v ?? "").toLowerCase().includes(searchLower)
      );
    const matchFilter =
      filterVal === "all" ||
      !filterKey ||
      String(row[filterKey] ?? "") === filterVal;
    return matchSearch && matchFilter;
  });

  return (
    <div>
      {/* Filter bar */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <div className="position-relative" style={{ maxWidth: '340px', minWidth: '280px' }}>
            <Search className="position-absolute text-muted-foreground" size={18} style={{ left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="form-control shadow-none transition-all focus-ring"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ 
                paddingLeft: '44px', 
                height: '46px',
                borderRadius: '2rem',
                border: '1px solid var(--border)', 
                backgroundColor: '#ffffff',
                color: '#000000' 
              }}
            />
          </div>

          {filterOptions.length > 0 && filterKey && (
            <select
              className="form-select shadow-none"
              value={filterVal}
              onChange={(e) => setFilterVal(e.target.value)}
              style={{ 
                height: '46px',
                borderRadius: '2rem',
                border: '1px solid var(--border)', 
                backgroundColor: '#ffffff',
                minWidth: '200px'
              }}
            >
              <option value="all">Todos os status</option>
              {filterOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <span
          className="badge bg-muted text-muted-foreground px-3 py-2 rounded-pill fw-medium"
        >
          {filtered.length} registro{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="dashboard-card overflow-hidden p-0 shadow-sm" style={{ border: "1px solid var(--border)", borderRadius: "1.25rem", background: "var(--background)" }}>
        {filtered.length === 0 ? (
          <div className="text-center py-5">
            <div className="d-flex flex-column align-items-center justify-content-center text-muted-foreground opacity-75">
              <span className="mb-3 opacity-50" style={{ fontSize: '3rem' }}>{emptyIcon}</span>
              <h5 className="fw-semibold text-foreground mb-1">{emptyText}</h5>
              {search && (
                <p className="small mb-0">Nenhum resultado para "{search}"</p>
              )}
            </div>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle text-nowrap" style={{ minWidth: '800px' }}>
              <thead>
                <tr style={{ background: 'var(--muted)', borderBottom: '2px solid var(--border)' }}>
                  {columns.map((col) => (
                    <th key={col.key} className="fw-bold text-muted-foreground border-0 py-3 ps-4" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col.label}</th>
                  ))}
                  {statusKey && <th className="fw-bold text-muted-foreground border-0 py-3" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>}
                  {actions.length > 0 && (
                    <th className="fw-bold text-muted-foreground border-0 py-3 text-end pe-4" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ações</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }} className="bg-background hover-bg-muted/50 transition-colors">
                    {columns.map((col, i) => (
                      <td key={col.key} className={`py-3 ${i === 0 ? 'ps-4 fw-bold text-foreground' : 'text-muted-foreground fw-medium'}`} style={{ fontSize: '0.9rem' }}>
                        {col.render
                          ? col.render(row[col.key], row)
                          : String(row[col.key] ?? "—")}
                      </td>
                    ))}
                    {statusKey && (
                      <td className="py-3">
                        <StatusBadge
                          status={String(row[statusKey] ?? "")}
                          statusMap={statusMap}
                        />
                      </td>
                    )}
                    {actions.length > 0 && (
                      <td className="py-3 text-end pe-4">
                        <div className="d-flex align-items-center justify-content-end gap-2">
                          {actions.map((action, ai) => (
                            <button
                              key={ai}
                              className={`btn btn-sm btn-light rounded-circle p-2 transition-colors border-0 ${action.variant === "primary" ? "text-primary hover-bg-primary/10" : action.variant === "danger" ? "text-danger hover-bg-danger/10" : "text-muted-foreground hover-text-primary hover-bg-primary/10"}`}
                              title={action.label}
                              onClick={() => action.onClick(row)}
                              type="button"
                              style={{ width: '36px', height: '36px' }}
                            >
                              {action.icon ?? <Zap size={16} />}
                            </button>
                          ))}
                          <button
                            className="btn btn-sm btn-light rounded-circle p-2 text-muted-foreground hover-text-primary hover-bg-primary/10 transition-colors border-0"
                            title="Ver detalhes"
                            type="button"
                            style={{ width: '36px', height: '36px' }}
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            className="btn btn-sm btn-light rounded-circle p-2 text-muted-foreground hover-text-primary hover-bg-primary/10 transition-colors border-0"
                            title="Editar"
                            type="button"
                            style={{ width: '36px', height: '36px' }}
                          >
                            <Edit2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
