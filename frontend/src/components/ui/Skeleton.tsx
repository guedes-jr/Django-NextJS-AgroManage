"use client";

interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({
  width = "100%",
  height = "1rem",
  borderRadius = "0.5rem",
  className = "",
  style,
}: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width,
        height,
        borderRadius,
        background: "linear-gradient(90deg, var(--muted) 25%, rgba(255,255,255,0.4) 50%, var(--muted) 75%)",
        backgroundSize: "200% 100%",
        animation: "skeleton-shimmer 1.5s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="dashboard-card p-3 border border-border bg-background shadow-sm h-100">
      <div className="d-flex justify-content-between align-items-start mb-3">
        <Skeleton width="40px" height="40px" borderRadius="10px" />
        <Skeleton width="40px" height="20px" borderRadius="99px" />
      </div>
      <Skeleton width="60%" height="12px" className="mb-2" />
      <Skeleton width="80%" height="28px" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="dashboard-card overflow-hidden p-0 shadow-sm" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
      <div className="p-4 border-bottom border-border">
        <div className="d-flex gap-4">
          <Skeleton width="280px" height="46px" borderRadius="2rem" />
          <Skeleton width="200px" height="46px" borderRadius="2rem" />
          <Skeleton width="100px" height="46px" borderRadius="2rem" className="ms-auto" />
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="d-flex align-items-center gap-3 px-4 py-3 border-bottom border-border">
          <Skeleton width="48%" height="16px" />
          <Skeleton width="20%" height="16px" />
          <Skeleton width="15%" height="16px" />
          <Skeleton width="12%" height="16px" />
          <Skeleton width="60px" height="24px" borderRadius="99px" className="ms-auto" />
        </div>
      ))}
    </div>
  );
}
