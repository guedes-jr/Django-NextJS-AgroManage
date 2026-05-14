"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";

interface DrawerField {
  name: string;
  label: string;
  type: "text" | "date" | "number" | "select" | "textarea";
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
}

interface FormDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  fields: DrawerField[];
  confirmLabel?: string;
  onConfirm?: (data: Record<string, string>) => Promise<void>;
  width?: number;
}

export function FormDrawer({
  open,
  onClose,
  title,
  subtitle,
  fields,
  confirmLabel = "Salvar",
  onConfirm,
  width = 480,
}: FormDrawerProps) {
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
      // handled upstream
    } finally {
      setLoading(false);
      onClose();
    }
  }

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          onClick={() => { if (!loading) onClose(); }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(4px)",
            zIndex: 2000,
            animation: "fadeIn 0.2s ease",
          }}
        />
      )}

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: `${width}px`,
          maxWidth: "100vw",
          background: "white",
          zIndex: 2001,
          boxShadow: "-8px 0 30px rgba(0,0,0,0.12)",
          display: "flex",
          flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.25s cubic-bezier(0.34, 1.2, 0.64, 1)",
        }}
      >
        {/* Header */}
        <div className="d-flex align-items-start justify-content-between gap-3 p-4 border-bottom border-border">
          <div>
            <h5 className="fw-bold mb-1" style={{ fontSize: "1.1rem", color: "var(--foreground)" }}>
              {title}
            </h5>
            {subtitle && (
              <p className="text-muted-foreground small mb-0">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              border: "1.5px solid var(--border)",
              background: "white",
              color: "var(--muted-foreground)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div className="p-4 flex-grow-1 overflow-auto">
            <div className="d-flex flex-column gap-3">
              {fields.map((field) => (
                <div key={field.name} className="repro-field">
                  <label htmlFor={`drawer-${field.name}`}>
                    {field.label}
                    {field.required && (
                      <span style={{ color: "var(--destructive)", marginLeft: "2px" }}>*</span>
                    )}
                  </label>

                  {field.type === "select" ? (
                    <select id={`drawer-${field.name}`} name={field.name} required={field.required} disabled={loading}>
                      <option value="">Selecione...</option>
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea
                      id={`drawer-${field.name}`}
                      name={field.name}
                      placeholder={field.placeholder}
                      required={field.required}
                      disabled={loading}
                    />
                  ) : (
                    <input
                      id={`drawer-${field.name}`}
                      name={field.name}
                      type={field.type}
                      placeholder={field.placeholder}
                      required={field.required}
                      disabled={loading}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-top border-border d-flex gap-2 justify-content-end">
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
    </>
  );
}
