"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import "./clinico.css";

export interface ModalField {
  name: string;
  label: string;
  type: "text" | "date" | "number" | "select" | "textarea" | "hidden";
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  colSpan?: "full" | "half";
  initialValue?: string | number;
  disabled?: boolean;
  showIf?: (values: Record<string, string>) => boolean;
}

interface ClinicalModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  fields: ModalField[];
  confirmLabel?: string;
  onConfirm?: (data: Record<string, string>) => Promise<void>;
}

export function ClinicalModal({
  open,
  onClose,
  title,
  subtitle,
  fields,
  confirmLabel = "Salvar",
  onConfirm,
}: ClinicalModalProps) {
  const [loading, setLoading] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  // Reset/Initialize values when modal opens or fields change
  useEffect(() => {
    if (open) {
      const initial: Record<string, string> = {};
      fields.forEach((f) => {
        initial[f.name] = String(f.initialValue ?? "");
      });
      setFormValues(initial);
    }
  }, [open, fields]);

  if (!open) return null;

  const handleFieldChange = (name: string, val: string) => {
    setFormValues((prev) => ({ ...prev, [name]: val }));
  };

  const visibleFields = fields.filter((f) => !f.showIf || f.showIf(formValues));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!onConfirm || loading) return;
    
    const data: Record<string, string> = {};
    visibleFields.forEach((f) => {
      data[f.name] = formValues[f.name] || "";
    });

    setLoading(true);
    try {
      await onConfirm(data);
    } catch {
      // error handled upstream via toast
    } finally {
      setLoading(false);
      onClose();
    }
  }

  return (
    <div className="clinico-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div className="clinico-modal">
        <div className="clinico-modal-header">
          <div>
            <div className="clinico-modal-title">{title}</div>
            {subtitle && <div className="clinico-modal-subtitle">{subtitle}</div>}
          </div>
          <button className="clinico-modal-close" onClick={onClose} type="button" disabled={loading}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="clinico-modal-body">
            <div className="clinico-fields-grid">
              {visibleFields.map((field) => (
                <div
                  key={field.name}
                  className="clinico-field"
                  style={{
                    ...(field.colSpan === "full" ? { gridColumn: "1 / -1" } : {}),
                    ...(field.type === "hidden" ? { display: "none" } : {})
                  }}
                >
                  {field.type !== "hidden" && (
                    <label htmlFor={`modal-${field.name}`}>
                      {field.label}
                      {field.required && <span style={{ color: "var(--destructive)", marginLeft: "2px" }}>*</span>}
                    </label>
                  )}

                  {field.type === "select" ? (
                    <select 
                      id={`modal-${field.name}`} 
                      name={field.name} 
                      required={field.required} 
                      disabled={loading || field.disabled}
                      value={formValues[field.name] ?? ""}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                    >
                      <option value="">Selecione...</option>
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea
                      id={`modal-${field.name}`}
                      name={field.name}
                      placeholder={field.placeholder}
                      required={field.required}
                      disabled={loading || field.disabled}
                      value={formValues[field.name] ?? ""}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                    />
                  ) : (
                    <input
                      id={`modal-${field.name}`}
                      name={field.name}
                      type={field.type}
                      placeholder={field.placeholder}
                      required={field.required}
                      disabled={loading || field.disabled}
                      value={formValues[field.name] ?? ""}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="clinico-modal-footer">
            <button type="button" className="clinico-btn-secondary" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="clinico-btn-primary" disabled={loading}>
              {loading ? <Loader2 size={16} className="spinner" /> : null}
              {loading ? "Salvando..." : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
