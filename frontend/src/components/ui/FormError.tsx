import { AlertCircle } from "lucide-react";

interface FormErrorProps {
  message?: string;
  className?: string;
}

/**
 * Displays inline form validation error message
 * Used for individual field errors in forms
 */
export function FormError({ message, className = "" }: FormErrorProps) {
  if (!message) return null;

  return (
    <div className={`d-flex align-items-start gap-2 mt-2 p-3 rounded-2 bg-danger-subtle border border-danger-subtle ${className}`}>
      <AlertCircle size={18} className="text-danger flex-shrink-0 mt-1" />
      <span className="text-danger small">{message}</span>
    </div>
  );
}

/**
 * Input field with optional error state
 */
interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  helperText?: string;
  required?: boolean;
}

export function FormInput({
  label,
  error,
  icon,
  helperText,
  required,
  className = "",
  ...props
}: FormInputProps) {
  const borderColor = error ? "border-danger" : "var(--border)";
  const inputStyle = {
    height: "48px",
    padding: icon ? "0 1rem 0 2.75rem" : "0 1rem",
    border: `1.5px solid ${borderColor}`,
    borderRadius: "12px",
    transition: "border-color 0.2s",
  };

  return (
    <div>
      {label && (
        <label className="small fw-bold text-muted-foreground mb-2 d-block">
          {label}
          {required && <span className="text-danger ms-1">*</span>}
        </label>
      )}
      <div className="position-relative">
        <input
          className={`w-100 bg-transparent text-foreground ${className}`}
          style={inputStyle}
          {...props}
        />
        {icon && (
          <div className="position-absolute" style={{
            left: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            color: error ? "#dc3545" : "#9ca3af",
            pointerEvents: "none",
          }}>
            {icon}
          </div>
        )}
      </div>
      {error && <FormError message={error} />}
      {helperText && !error && (
        <small className="d-block mt-2 text-muted-foreground">{helperText}</small>
      )}
    </div>
  );
}

/**
 * Select field with optional error state
 */
interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
}

export function FormSelect({
  label,
  error,
  helperText,
  required,
  options = [],
  className = "",
  ...props
}: FormSelectProps) {
  const borderColor = error ? "border-danger" : "var(--border)";
  const selectStyle = {
    height: "48px",
    padding: "0 1rem",
    border: `1.5px solid ${borderColor}`,
    borderRadius: "12px",
    background: "white",
    transition: "border-color 0.2s",
  };

  return (
    <div>
      {label && (
        <label className="small fw-bold text-muted-foreground mb-2 d-block">
          {label}
          {required && <span className="text-danger ms-1">*</span>}
        </label>
      )}
      <select
        className={`w-100 ${className}`}
        style={selectStyle}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <FormError message={error} />}
      {helperText && !error && (
        <small className="d-block mt-2 text-muted-foreground">{helperText}</small>
      )}
    </div>
  );
}

/**
 * Textarea field with optional error state
 */
interface FormTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
}

export function FormTextarea({
  label,
  error,
  helperText,
  required,
  className = "",
  ...props
}: FormTextareaProps) {
  const borderColor = error ? "border-danger" : "var(--border)";
  const style = {
    padding: "0.75rem 1rem",
    border: `1.5px solid ${borderColor}`,
    borderRadius: "12px",
    transition: "border-color 0.2s",
  };

  return (
    <div>
      {label && (
        <label className="small fw-bold text-muted-foreground mb-2 d-block">
          {label}
          {required && <span className="text-danger ms-1">*</span>}
        </label>
      )}
      <textarea
        className={`w-100 bg-transparent text-foreground ${className}`}
        style={style}
        {...props}
      />
      {error && <FormError message={error} />}
      {helperText && !error && (
        <small className="d-block mt-2 text-muted-foreground">{helperText}</small>
      )}
    </div>
  );
}
