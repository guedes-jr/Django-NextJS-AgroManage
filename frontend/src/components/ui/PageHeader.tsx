"use client";

import { ChevronRight } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, breadcrumbs, action }: PageHeaderProps) {
  return (
    <div className="mb-5">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="d-flex align-items-center gap-2 small mb-3" style={{ color: "var(--muted-foreground)" }}>
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="d-flex align-items-center gap-2">
              {i > 0 && <ChevronRight size={14} />}
              {crumb.href ? (
                <a href={crumb.href} className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>
                  {crumb.label}
                </a>
              ) : (
                <span className={i === breadcrumbs.length - 1 ? "fw-semibold text-foreground" : ""}>
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
        <div>
          <h1 className="fw-bold mb-1" style={{ fontSize: "2rem", letterSpacing: "-0.03em", color: "var(--foreground)" }}>
            {title}
          </h1>
          {subtitle && <p className="mb-0 text-muted-foreground fw-medium">{subtitle}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
    </div>
  );
}
