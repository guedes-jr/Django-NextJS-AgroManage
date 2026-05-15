"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import "./reproducao.css";

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
}

interface ReproducaoModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  fields: ModalField[];
  confirmLabel?: string;
  onConfirm?: (data: Record<string, string>) => Promise<void>;
}

export function ReproducaoModal({
  open,
  onClose,
  title,
  subtitle,
  fields,
  confirmLabel = "Salvar",
  onConfirm,
}: ReproducaoModalProps) {
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!onConfirm || loading) return;
    const form = e.currentTarget;
    const data: Record<string, string> = {};
    fields.forEach((f) => {
      const el = form.elements.namedItem(f.name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
      if (el) data[f.name] = el.value;
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
    <div className="repro-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div className="repro-modal">
        <div className="repro-modal-header">
          <div>
            <div className="repro-modal-title">{title}</div>
            {subtitle && <div className="repro-modal-subtitle">{subtitle}</div>}
          </div>
          <button className="repro-modal-close" onClick={onClose} type="button" disabled={loading}>
            <X size={16} />
          </button>
        </div>

        <form 
          key={`${title}-${fields.length}-${open}`} 
          onSubmit={handleSubmit}
        >
          <div className="repro-modal-body">
            <div className="repro-fields-grid">
              {fields.map((field) => (
                <div
                  key={field.name}
                  className="repro-field"
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
                      defaultValue={field.initialValue}
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
                      defaultValue={field.initialValue}
                    />
                  ) : (
                    <input
                      id={`modal-${field.name}`}
                      name={field.name}
                      type={field.type}
                      placeholder={field.placeholder}
                      required={field.required}
                      disabled={loading || field.disabled}
                      defaultValue={field.initialValue}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="repro-modal-footer">
            <button type="button" className="repro-btn-secondary" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="repro-btn-primary" disabled={loading}>
              {loading ? <Loader2 size={16} className="spinner" /> : null}
              {loading ? "Salvando..." : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
