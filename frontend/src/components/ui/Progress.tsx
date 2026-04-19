import { HTMLAttributes, forwardRef } from "react";

interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  ({ className = "", value = 0, max = 100, ...props }, ref) => {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));

    return (
      <div
        ref={ref}
        className={`progress rounded-pill ${className}`}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        style={{ height: "8px", background: "var(--muted)" }}
        {...props}
      >
        <div
          className="progress-bar rounded-pill"
          style={{
            width: `${percentage}%`,
            background: "var(--primary)",
            transition: "width 0.3s ease",
          }}
        />
      </div>
    );
  }
);

Progress.displayName = "Progress";