"use client";

import { Search } from "lucide-react";

interface FilterOption {
  value: string;
  label: string;
}

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: {
    key: string;
    label: string;
    value: string;
    options: FilterOption[];
    onChange: (value: string) => void;
  }[];
  total?: number;
}

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Buscar...",
  filters,
  total,
}: FilterBarProps) {
  return (
    <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
      <div className="d-flex align-items-center gap-3 flex-wrap">
        <div className="position-relative" style={{ maxWidth: "340px", minWidth: "280px" }}>
          <Search
            className="position-absolute text-muted-foreground"
            size={18}
            style={{ left: "16px", top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            type="text"
            className="form-control shadow-none transition-all focus-ring"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              paddingLeft: "44px",
              height: "46px",
              borderRadius: "2rem",
              border: "1px solid var(--border)",
              backgroundColor: "#ffffff",
              color: "#000000",
            }}
          />
        </div>

        {filters?.map((f) => (
          <select
            key={f.key}
            className="form-select shadow-none"
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            style={{
              height: "46px",
              borderRadius: "2rem",
              border: "1px solid var(--border)",
              backgroundColor: "#ffffff",
              minWidth: "200px",
            }}
          >
            <option value="all">{f.label}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
      </div>

      {total !== undefined && (
        <span className="badge bg-muted text-muted-foreground px-3 py-2 rounded-pill fw-medium">
          {total} registro{total !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}
