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
  return (
    <span className={`repro-badge repro-badge-${cfg.variant}`}>{cfg.label}</span>
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
      <div className="repro-filter-bar">
        <div className="repro-search-wrap">
          <Search size={14} className="repro-search-icon" />
          <input
            className="repro-search"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {filterOptions.length > 0 && filterKey && (
          <select
            className="repro-select"
            value={filterVal}
            onChange={(e) => setFilterVal(e.target.value)}
          >
            <option value="all">Todos os status</option>
            {filterOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}

        <span
          style={{
            marginLeft: "auto",
            fontSize: "0.78rem",
            color: "var(--muted-foreground)",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {filtered.length} registro{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="repro-table-wrap">
        {filtered.length === 0 ? (
          <div className="repro-empty">
            <span className="repro-empty-icon">{emptyIcon}</span>
            <span className="fw-semibold" style={{ color: "var(--muted-foreground)" }}>
              {emptyText}
            </span>
            {search && (
              <span className="small text-muted">
                Nenhum resultado para "{search}"
              </span>
            )}
          </div>
        ) : (
          <table className="repro-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
                {statusKey && <th>Status</th>}
                {actions.length > 0 && (
                  <th style={{ textAlign: "right" }}>Ações</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <tr key={idx}>
                  {columns.map((col) => (
                    <td key={col.key}>
                      {col.render
                        ? col.render(row[col.key], row)
                        : String(row[col.key] ?? "—")}
                    </td>
                  ))}
                  {statusKey && (
                    <td>
                      <StatusBadge
                        status={String(row[statusKey] ?? "")}
                        statusMap={statusMap}
                      />
                    </td>
                  )}
                  {actions.length > 0 && (
                    <td>
                      <div className="repro-table-actions">
                        {actions.map((action, ai) => (
                          <button
                            key={ai}
                            className={`repro-action-btn ${action.variant === "primary" ? "primary" : action.variant === "danger" ? "danger" : ""}`}
                            title={action.label}
                            onClick={() => action.onClick(row)}
                            type="button"
                          >
                            {action.icon ?? <Zap size={14} />}
                          </button>
                        ))}
                        <button
                          className="repro-action-btn"
                          title="Ver detalhes"
                          type="button"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          className="repro-action-btn"
                          title="Editar"
                          type="button"
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
