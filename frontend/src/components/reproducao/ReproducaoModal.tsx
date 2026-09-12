"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Plus, Trash2 } from "lucide-react";
import "./reproducao.css";

export interface ModalField {
  name: string;
  label: string;
  type: "text" | "date" | "time" | "number" | "select" | "textarea" | "hidden" | "inventory-list";
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  colSpan?: "full" | "half";
  initialValue?: string | number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  showIf?: (values: Record<string, string>) => boolean;
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

  const inventoryRows = (field: ModalField) => {
    try {
      const parsed = JSON.parse(formValues[field.name] || "[]");
      return Array.isArray(parsed) && parsed.length ? parsed : [{ inventory_item: "", dose_per_animal: "" }];
    } catch {
      return [{ inventory_item: "", dose_per_animal: "" }];
    }
  };

  const updateInventoryRows = (field: ModalField, rows: Array<Record<string, string>>) => {
    handleFieldChange(field.name, JSON.stringify(rows));
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

        <form onSubmit={handleSubmit}>
          <div className="repro-modal-body">
            <div className="repro-fields-grid">
              {visibleFields.map((field) => (
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

                  {field.type === "inventory-list" ? (
                    <div className="repro-inventory-list">
                      {inventoryRows(field).map((row: Record<string, string>, index: number, rows: Array<Record<string, string>>) => (
                        <div className="repro-inventory-row" key={`${field.name}-${index}`}>
                          <select
                            required={field.required}
                            disabled={loading || field.disabled}
                            value={row.inventory_item || ""}
                            aria-label={`${field.label} ${index + 1}`}
                            onChange={(event) => {
                              const next = [...rows];
                              next[index] = { ...row, inventory_item: event.target.value };
                              updateInventoryRows(field, next);
                            }}
                          >
                            <option value="">Selecione...</option>
                            {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                          <input
                            type="number"
                            required
                            min="0.01"
                            step="0.01"
                            placeholder="Dose/leitão"
                            value={row.dose_per_animal || ""}
                            disabled={loading || field.disabled}
                            aria-label={`Dose do ${field.label.toLowerCase()} ${index + 1}`}
                            onChange={(event) => {
                              const next = [...rows];
                              next[index] = { ...row, dose_per_animal: event.target.value };
                              updateInventoryRows(field, next);
                            }}
                          />
                          {rows.length > 1 && (
                            <button type="button" className="repro-inventory-remove" aria-label={`Remover ${field.label.toLowerCase()} ${index + 1}`} onClick={() => updateInventoryRows(field, rows.filter((_, rowIndex) => rowIndex !== index))}>
                              <Trash2 size={17} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button type="button" className="repro-inventory-add" onClick={() => updateInventoryRows(field, [...inventoryRows(field), { inventory_item: "", dose_per_animal: "" }])}>
                        <Plus size={17} /> Adicionar {field.label.toLowerCase()}
                      </button>
                    </div>
                  ) : field.type === "select" ? (
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
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      disabled={loading || field.disabled}
                      value={formValues[field.name] ?? ""}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
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
