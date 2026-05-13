"use client";

import { X } from "lucide-react";
import "./reproducao.css";

export interface ModalField {
  name: string;
  label: string;
  type: "text" | "date" | "number" | "select" | "textarea";
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  colSpan?: "full" | "half";
}

interface ReproducaoModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  fields: ModalField[];
  confirmLabel?: string;
  onConfirm?: (data: Record<string, string>) => void;
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
  if (!open) return null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data: Record<string, string> = {};
    fields.forEach((f) => {
      const el = form.elements.namedItem(f.name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
      if (el) data[f.name] = el.value;
    });
    onConfirm?.(data);
    onClose();
  }

  return (
    <div className="repro-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="repro-modal">
        <div className="repro-modal-header">
          <div>
            <div className="repro-modal-title">{title}</div>
            {subtitle && <div className="repro-modal-subtitle">{subtitle}</div>}
          </div>
          <button className="repro-modal-close" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="repro-modal-body">
            <div className="repro-fields-grid">
              {fields.map((field) => (
                <div
                  key={field.name}
                  className="repro-field"
                  style={field.colSpan === "full" ? { gridColumn: "1 / -1" } : {}}
                >
                  <label htmlFor={`modal-${field.name}`}>
                    {field.label}
                    {field.required && <span style={{ color: "var(--destructive)", marginLeft: "2px" }}>*</span>}
                  </label>

                  {field.type === "select" ? (
                    <select id={`modal-${field.name}`} name={field.name} required={field.required}>
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
                    />
                  ) : (
                    <input
                      id={`modal-${field.name}`}
                      name={field.name}
                      type={field.type}
                      placeholder={field.placeholder}
                      required={field.required}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="repro-modal-footer">
            <button type="button" className="repro-btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="repro-btn-primary">
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
