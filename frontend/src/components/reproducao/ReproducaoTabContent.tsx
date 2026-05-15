"use client";

import { useState } from "react";
import { KpiCard } from "./ReproducaoKpiCards";
import {
  DataTable,
  BatchAction,
  QuickActionsCard,
  AlertListCard,
  AiSuggestionsCard,
} from "@/components/ui";
import { Search } from "lucide-react";

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

interface AlertItem {
  type: "warning" | "danger" | "info" | "success";
  icon: string;
  text: string;
  time: string;
}

interface AiSuggestion {
  text: string;
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
  kpis?: KpiCard[];
  tabActions?: { label: string; icon: string; color: string; desc: string }[];
  tabAlerts?: AlertItem[];
  tabAiSuggestions?: AiSuggestion[];
  selectable?: boolean;
  rowKey?: string;
  batchActions?: BatchAction<TableRow>[];
  onRowClick?: (row: TableRow) => void;
  onSelectionChange?: (selectedRows: TableRow[]) => void;
}

export function ReproducaoTabContent({
  columns,
  rows,
  statusKey,
  statusMap = {},
  searchPlaceholder = "Buscar por lote, animal, data...",
  filterKey,
  filterOptions = [],
  actions = [],
  emptyIcon = "🐾",
  emptyText = "Nenhum registro encontrado",
  kpis,
  tabActions,
  tabAlerts,
  tabAiSuggestions,
  selectable,
  rowKey,
  batchActions,
  onRowClick,
  onSelectionChange,
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

  const statusMapForDataTable = statusMap as Record<string, { label: string; variant: string }>;

  const dtFilters = filterOptions.length > 0 && filterKey
    ? [{
        key: filterKey,
        label: "Todos os status",
        value: filterVal,
        options: filterOptions,
        onChange: setFilterVal,
      }]
    : undefined;

  return (
    <div>
      {kpis && kpis.length > 0 && (
        <div className="row g-3 mb-5">
          {kpis.map((k, i) => {
            const trendStyles: Record<string, { bg: string; text: string; symbol: string }> = {
              up:      { bg: "oklch(0.95 0.05 145)", text: "oklch(0.45 0.15 145)", symbol: "↑" },
              down:    { bg: "oklch(0.96 0.04 25)",  text: "oklch(0.5 0.15 25)",   symbol: "↓" },
              neutral: { bg: "var(--muted)",         text: "var(--muted-foreground)", symbol: "→" },
            };
            const trend = trendStyles[k.trend ?? "neutral"];
            return (
              <div key={i} className="col-12 col-sm-6 col-lg">
                <div className="dashboard-card p-3 border border-border bg-background shadow-sm h-100">
                  <div className="d-flex align-items-center gap-3 mb-3">
                    <div
                      className="p-2 rounded-lg d-flex align-items-center justify-content-center"
                      style={{ background: k.color, color: k.color.replace('0.95', '0.45').replace('0.96', '0.5'), width: 40, height: 40 }}
                    >
                      <span style={{ fontSize: '1.1rem' }}>{k.icon}</span>
                    </div>
                    <div className="flex-grow-1">
                      <div className="h4 fw-black mb-0">{k.value}</div>
                      <div className="text-muted-foreground small fw-semibold">{k.label}</div>
                      {k.sub && <div className="text-muted-foreground" style={{ fontSize: '0.7rem' }}>{k.sub}</div>}
                    </div>
                    {k.trend && (
                      <span
                        className="d-inline-flex align-items-center"
                        style={{
                          padding: "0.1rem 0.4rem",
                          borderRadius: "99px",
                          fontSize: "0.65rem",
                          fontWeight: 800,
                          background: trend.bg,
                          color: trend.text,
                        }}
                      >
                        {trend.symbol}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tabActions && tabActions.length > 0 && (
        <QuickActionsCard actions={tabActions} />
      )}

      <DataTable<TableRow>
        columns={columns}
        rows={filtered}
        statusKey={statusKey}
        statusMap={statusMapForDataTable}
        actions={[
          {
            label: "Ver detalhes do animal",
            icon: <Search size={16} />,
            onClick: (row) => onRowClick?.(row),
          },
          ...actions
        ]}
        emptyIcon={emptyIcon}
        emptyText={emptyText}
        selectable={selectable}
        rowKey={rowKey}
        batchActions={batchActions}
        onSelectionChange={onSelectionChange}
        title="Histórico de Registros"
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={searchPlaceholder}
        filters={dtFilters}
      />

      {(tabAlerts && tabAlerts.length > 0) || (tabAiSuggestions && tabAiSuggestions.length > 0) ? (
        <div className="row g-4 mt-4">
          <div className="col-12 col-lg-7">
            <AlertListCard alerts={tabAlerts ?? []} />
          </div>
          <div className="col-12 col-lg-5">
            <AiSuggestionsCard suggestions={tabAiSuggestions ?? []} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
