import { ButtonHTMLAttributes, forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "success" | "danger" | "warning" | "info" | "outline-primary" | "outline-secondary" | "outline-success" | "outline-danger" | "outline-warning" | "outline-info" | "link" | "agro" | "outline-agro";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", loading = false, fullWidth = false, children, disabled, ...props }, ref) => {
    const sizeClass = {
      sm: "btn-sm",
      md: "",
      lg: "btn-lg",
    }[size];

    const widthClass = fullWidth ? "w-100" : "";

    return (
      <button
        ref={ref}
        className={`btn ${variant === "agro" ? "btn-agro" : variant === "outline-agro" ? "btn-outline-agro" : variant} ${sizeClass} ${widthClass} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
            Carregando...
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";