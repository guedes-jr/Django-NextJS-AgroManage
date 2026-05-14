"use client";

import { useState, useMemo, useCallback } from "react";
import { Search, ChevronUp, ChevronDown, Eye, Edit2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CheckSquare, Square, X } from "lucide-react";

export interface Column<T> {
  key: string;
  label: string;
  render?: (value: unknown, row: T) => React.ReactNode;
  sortable?: boolean;
}

export interface Action<T> {
  label: string;
  icon?: React.ReactNode;
  onClick: (row: T) => void;
  variant?: "primary" | "default" | "danger";
}

export interface BatchAction<T> {
  label: string;
  icon?: React.ReactNode;
  onClick: (selectedRows: T[]) => void | Promise<void>;
  variant?: "primary" | "default" | "danger";
}

interface FilterOption {
  value: string;
  label: string;
}

interface FilterConfig {
  key: string;
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

interface DataTableProps<T extends Record<string, unknown>> {
  columns: Column<T>[];
  rows: T[];
  pageSize?: number;
  pageSizeOptions?: number[];
  emptyIcon?: string;
  emptyText?: string;
  searchQuery?: string;
  statusKey?: string;
  statusMap?: Record<string, { label: string; variant: string }>;
  actions?: Action<T>[];
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  rowKey?: string;
  batchActions?: BatchAction<T>[];
  title?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterConfig[];
}

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

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [5, 10, 20, 50],
  emptyIcon = "📋",
  emptyText = "Nenhum registro encontrado",
  searchQuery,
  statusKey,
  statusMap,
  actions,
  onRowClick,
  selectable,
  rowKey,
  batchActions,
  title = "Histórico de Registros",
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar por lote, animal, data...",
  filters,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let data = rows;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter((row) =>
        Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(q))
      );
    }
    if (sortKey) {
      data = [...data].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") {
          return sortDir === "asc" ? av - bv : bv - av;
        }
        if (typeof av === "string" && typeof bv === "string") {
          const da = Date.parse(av);
          const db = Date.parse(bv);
          if (!isNaN(da) && !isNaN(db)) {
            return sortDir === "asc" ? da - db : db - da;
          }
          return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        }
        const sa = String(av);
        const sb = String(bv);
        return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
      });
    }
    return data;
  }, [rows, searchQuery, sortKey, sortDir]);

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const startItem = totalItems === 0 ? 0 : safePage * pageSize + 1;
  const endItem = Math.min((safePage + 1) * pageSize, totalItems);

  const getRowId = useCallback((row: T, idx: number): string => {
    return rowKey ? String(row[rowKey] ?? idx) : String(idx);
  }, [rowKey]);

  const allPageSelected = paged.length > 0 && paged.every((r, i) => selected.has(getRowId(r, safePage * pageSize + i)));
  const somePageSelected = !allPageSelected && paged.some((r, i) => selected.has(getRowId(r, safePage * pageSize + i)));

  function toggleSelect(row: T, idx: number) {
    const id = getRowId(row, idx);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allPageSelected) {
      const ids = new Set(selected);
      paged.forEach((r, i) => ids.delete(getRowId(r, safePage * pageSize + i)));
      setSelected(ids);
    } else {
      const ids = new Set(selected);
      paged.forEach((r, i) => ids.add(getRowId(r, safePage * pageSize + i)));
      setSelected(ids);
    }
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const selectedRows = useMemo(() => {
    const idToRow = new Map<string, T>();
    filtered.forEach((r, i) => idToRow.set(getRowId(r, i), r));
    return Array.from(selected).map((id) => idToRow.get(id)).filter(Boolean) as T[];
  }, [filtered, selected, getRowId]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  function goToPage(p: number) {
    setPage(Math.max(0, Math.min(totalPages - 1, p)));
  }

  function changePageSize(size: number) {
    setPageSize(size);
    setPage(0);
  }

  const pageNumbers = useMemo(() => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 0; i < totalPages; i++) pages.push(i);
    } else {
      pages.push(0);
      if (safePage > 2) pages.push("ellipsis");
      for (let i = Math.max(1, safePage - 1); i <= Math.min(totalPages - 2, safePage + 1); i++) {
        pages.push(i);
      }
      if (safePage < totalPages - 3) pages.push("ellipsis");
      pages.push(totalPages - 1);
    }
    return pages;
  }, [totalPages, safePage]);

  const showHeader = title || onSearchChange || (filters && filters.length > 0);

  return (
    <div className="dashboard-card overflow-hidden shadow-sm" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
      {/* Header with title + search + filters */}
      {showHeader && (
        <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 px-4 py-3 border-bottom border-border" style={{ background: "var(--card)" }}>
          {title && (
            <div className="flex-shrink-0">
              <h5 className="fw-bold mb-0 text-foreground" style={{ fontSize: "1rem", whiteSpace: "nowrap" }}>{title}</h5>
            </div>
          )}
          <div className="d-flex align-items-center gap-3 flex-wrap flex-grow-1 justify-content-md-end">
            {onSearchChange && (
              <div className="position-relative" style={{ minWidth: "220px", maxWidth: "320px" }}>
                <Search
                  className="position-absolute text-muted-foreground"
                  size={16}
                  style={{ left: "12px", top: "50%", transform: "translateY(-50%)" }}
                />
                <input
                  type="text"
                  className="form-control shadow-none"
                  placeholder={searchPlaceholder}
                  value={searchValue ?? ""}
                  onChange={(e) => onSearchChange(e.target.value)}
                  style={{
                    paddingLeft: "36px",
                    height: "36px",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border)",
                    fontSize: "0.85rem",
                    background: "var(--muted)",
                  }}
                />
              </div>
            )}
            {filters?.map((f) => (
              <select
                key={f.key}
                className="form-select shadow-none"
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                style={{
                  height: "36px",
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border)",
                  fontSize: "0.85rem",
                  minWidth: "160px",
                  width: "auto",
                }}
              >
                <option value="all">{f.label}</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ))}
            <span className="badge px-3 py-2 rounded-pill fw-semibold small flex-shrink-0" style={{ background: "oklch(0.92 0.03 220)", color: "oklch(0.4 0.12 220)" }}>
              {totalItems} registro{totalItems !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}

      {/* Batch action bar */}
      {selectable && selectedRows.length > 0 && batchActions && batchActions.length > 0 && (
        <div className="d-flex align-items-center justify-content-between px-4 py-2 border-bottom border-border" style={{ background: "var(--muted)" }}>
          <div className="d-flex align-items-center gap-2">
            <span className="fw-semibold small">{selectedRows.length} selecionado{selectedRows.length !== 1 ? "s" : ""}</span>
            <button
              className="btn btn-sm btn-light border-0 d-flex align-items-center gap-1 text-muted-foreground"
              onClick={clearSelection}
              style={{ borderRadius: "0.5rem", fontSize: "0.75rem" }}
            >
              <X size={14} /> Limpar
            </button>
          </div>
          <div className="d-flex align-items-center gap-2">
            {batchActions.map((ba, i) => (
              <button
                key={i}
                className={`btn btn-sm d-flex align-items-center gap-1 fw-semibold ${
                  ba.variant === "danger" ? "btn-outline-danger" : ba.variant === "primary" ? "btn-primary" : "btn-light border"
                }`}
                onClick={() => ba.onClick(selectedRows)}
                style={{ borderRadius: "0.5rem", fontSize: "0.75rem" }}
              >
                {ba.icon}
                {ba.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {paged.length === 0 ? (
        <div className="text-center py-5">
          <div className="d-flex flex-column align-items-center justify-content-center text-muted-foreground opacity-75">
            <span className="mb-3 opacity-50" style={{ fontSize: "3rem" }}>{emptyIcon}</span>
            <h5 className="fw-semibold text-foreground mb-1">{emptyText}</h5>
          </div>
        </div>
      ) : (
        <>
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle text-nowrap" style={{ minWidth: "800px" }}>
              <thead>
                <tr style={{ background: "var(--muted)", borderBottom: "2px solid var(--border)" }}>
                  {selectable && (
                    <th className="border-0 py-3 ps-4" style={{ width: "48px" }}>
                      <button
                        className="btn btn-sm p-0 border-0 bg-transparent d-flex align-items-center"
                        onClick={toggleSelectAll}
                        type="button"
                      >
                        {allPageSelected ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} className="text-muted-foreground" />}
                      </button>
                    </th>
                  )}
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className="fw-bold text-muted-foreground border-0 py-3 ps-4"
                      style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", cursor: col.sortable !== false ? "pointer" : "default" }}
                      onClick={() => col.sortable !== false && toggleSort(col.key)}
                    >
                      <span className="d-inline-flex align-items-center gap-1">
                        {col.label}
                        {sortKey === col.key && (
                          sortDir === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                        )}
                      </span>
                    </th>
                  ))}
                  {statusKey && <th className="fw-bold text-muted-foreground border-0 py-3" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</th>}
                  {actions && actions.length > 0 && (
                    <th className="fw-bold text-muted-foreground border-0 py-3 text-end pe-4" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Ações</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {paged.map((row, idx) => {
                  const globalIdx = safePage * pageSize + idx;
                  const rowId = getRowId(row, globalIdx);
                  const isSelected = selected.has(rowId);
                  return (
                    <tr
                      key={rowId}
                      style={{ borderBottom: "1px solid var(--border)", cursor: onRowClick ? "pointer" : "default" }}
                      className={`${isSelected ? "bg-primary/5" : "bg-background"} hover-bg-muted/50 transition-colors`}
                      onClick={() => { onRowClick?.(row); }}
                    >
                      {selectable && (
                        <td className="py-3 ps-4" onClick={(e) => e.stopPropagation()} style={{ width: "48px" }}>
                          <button
                            className="btn btn-sm p-0 border-0 bg-transparent d-flex align-items-center"
                            onClick={() => toggleSelect(row, globalIdx)}
                            type="button"
                          >
                            {isSelected ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} className="text-muted-foreground" />}
                          </button>
                        </td>
                      )}
                      {columns.map((col, i) => (
                        <td key={col.key} className={`py-3 ${i === 0 && !selectable ? "ps-4 fw-bold text-foreground" : i === 0 ? "fw-bold text-foreground" : "text-muted-foreground fw-medium"}`} style={{ fontSize: "0.9rem" }}>
                          {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "—")}
                        </td>
                      ))}
                      {statusKey && (
                        <td className="py-3">
                          <StatusBadge status={String(row[statusKey] ?? "")} statusMap={statusMap ?? {}} />
                        </td>
                      )}
                      {actions && actions.length > 0 && (
                        <td className="py-3 text-end pe-4" onClick={(e) => e.stopPropagation()}>
                          <div className="d-flex align-items-center justify-content-end gap-2">
                            {actions.map((action, ai) => (
                              <button
                                key={ai}
                                className={`btn btn-sm btn-light rounded-circle p-2 transition-colors border-0 ${
                                  action.variant === "primary"
                                    ? "text-primary hover-bg-primary/10"
                                    : action.variant === "danger"
                                    ? "text-danger hover-bg-danger/10"
                                    : "text-muted-foreground hover-text-primary hover-bg-primary/10"
                                }`}
                                title={action.label}
                                onClick={() => action.onClick(row)}
                                type="button"
                                style={{ width: "36px", height: "36px" }}
                              >
                                {action.icon ?? <Edit2 size={16} />}
                              </button>
                            ))}
                            <button
                              className="btn btn-sm btn-light rounded-circle p-2 text-muted-foreground hover-text-primary hover-bg-primary/10 transition-colors border-0"
                              title="Ver detalhes"
                              type="button"
                              style={{ width: "36px", height: "36px" }}
                            >
                              <Eye size={16} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Selection count + Pagination */}
          <div className="d-flex flex-column flex-md-row align-items-center justify-content-between px-4 py-3 border-top border-border gap-3">
            <div className="d-flex align-items-center gap-2">
              {selectable && selectedRows.length > 0 ? (
                <span className="text-muted-foreground small fw-semibold">
                  {selectedRows.length} de {totalItems} selecionado{selectedRows.length !== 1 ? "s" : ""}
                </span>
              ) : (
                <span className="text-muted-foreground small">
                  {startItem}–{endItem} de {totalItems}
                </span>
              )}
              <span className="text-muted-foreground small mx-1">|</span>
              <select
                className="form-select form-select-sm shadow-none"
                value={pageSize}
                onChange={(e) => changePageSize(Number(e.target.value))}
                style={{
                  width: "auto",
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border)",
                  fontSize: "0.75rem",
                  padding: "0.2rem 1.5rem 0.2rem 0.5rem",
                }}
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>{size} / pág</option>
                ))}
              </select>
            </div>

            <div className="d-flex align-items-center gap-1">
              <button
                className="btn btn-sm btn-light border-0 d-flex align-items-center justify-content-center text-muted-foreground"
                disabled={safePage === 0}
                onClick={() => goToPage(0)}
                title="Primeira página"
                style={{ width: "32px", height: "32px", borderRadius: "0.5rem" }}
              >
                <ChevronsLeft size={16} />
              </button>
              <button
                className="btn btn-sm btn-light border-0 d-flex align-items-center justify-content-center text-muted-foreground"
                disabled={safePage === 0}
                onClick={() => goToPage(safePage - 1)}
                title="Página anterior"
                style={{ width: "32px", height: "32px", borderRadius: "0.5rem" }}
              >
                <ChevronLeft size={16} />
              </button>

              <div className="d-flex align-items-center gap-1 mx-1">
                {pageNumbers.map((p, i) =>
                  p === "ellipsis" ? (
                    <span key={`e-${i}`} className="text-muted-foreground px-1" style={{ fontSize: "0.75rem" }}>...</span>
                  ) : (
                    <button
                      key={p}
                      className={`btn btn-sm border-0 d-flex align-items-center justify-content-center fw-bold ${
                        p === safePage ? "bg-primary text-white" : "text-muted-foreground hover-bg-primary/10"
                      }`}
                      onClick={() => goToPage(p)}
                      style={{ width: "32px", height: "32px", borderRadius: "0.5rem", fontSize: "0.75rem" }}
                    >
                      {p + 1}
                    </button>
                  )
                )}
              </div>

              <button
                className="btn btn-sm btn-light border-0 d-flex align-items-center justify-content-center text-muted-foreground"
                disabled={safePage >= totalPages - 1}
                onClick={() => goToPage(safePage + 1)}
                title="Próxima página"
                style={{ width: "32px", height: "32px", borderRadius: "0.5rem" }}
              >
                <ChevronRight size={16} />
              </button>
              <button
                className="btn btn-sm btn-light border-0 d-flex align-items-center justify-content-center text-muted-foreground"
                disabled={safePage >= totalPages - 1}
                onClick={() => goToPage(totalPages - 1)}
                title="Última página"
                style={{ width: "32px", height: "32px", borderRadius: "0.5rem" }}
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({
  status,
  statusMap,
}: {
  status: string;
  statusMap: Record<string, { label: string; variant: string }>;
}) {
  const cfg = statusMap[status] ?? { label: status, variant: "gray" };
  const badgeClass = variantStyles[cfg.variant] || variantStyles.gray;
  const dotClass = dotColors[cfg.variant] || dotColors.gray;

  return (
    <span className={`badge rounded-pill px-3 py-2 fw-semibold d-inline-flex align-items-center gap-1 border ${badgeClass}`}>
      <div className={`rounded-circle ${dotClass}`} style={{ width: "6px", height: "6px" }}></div>
      {cfg.label}
    </span>
  );
}
