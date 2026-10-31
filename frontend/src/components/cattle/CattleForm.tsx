"use client";

import { useId, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { cattleError } from "@/services/cattleService";
import styles from "./cattle.module.css";

export type CattleField = {
  name: string; label: string; type?: "text" | "number" | "date" | "select" | "textarea";
  required?: boolean; min?: string; max?: string; step?: string; maxLength?: number;
  options?: { value: string; label: string }[];
  visibleWhen?: { field: string; value: string };
};
export type CattleFormSpec = {
  title: string; description?: string; fields: CattleField[]; initial?: Record<string, string>;
  submitLabel?: string; save: (values: Record<string, string>) => Promise<unknown>;
};

export function CattleForm({ spec, onClose, onSaved }: { spec: CattleFormSpec; onClose: () => void; onSaved: () => void }) {
  const formId = useId();
  const [values, setValues] = useState<Record<string, string>>(spec.initial || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await spec.save(values);
      onSaved();
    } catch (error) {
      setError(cattleError(error));
      setSaving(false);
    }
  }
  return <Modal isOpen onClose={() => { if (!saving) onClose(); }} title={spec.title} description={spec.description} maxWidth={styles.formDialog}
    footer={<div className={styles.dialogActions}><button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose} disabled={saving}>Cancelar</button><button form={formId} type="submit" className="btn btn-success btn-sm" disabled={saving}>{saving ? "Salvando..." : spec.submitLabel || "Salvar registro"}</button></div>}>
    <form id={formId} onSubmit={submit} className={styles.form}>
      <p className={styles.formHint}>Preencha as informações do registro. Campos marcados com * são obrigatórios.</p>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <div className={styles.fields}>{spec.fields.filter(field => !field.visibleWhen || values[field.visibleWhen.field] === field.visibleWhen.value).map(field => {
        const id = `cattle-${field.name}`;
        const common = { id, name: field.name, value: values[field.name] || "", required: field.required, disabled: saving, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setValues(previous => ({ ...previous, [field.name]: event.target.value })) };
        return <label className={styles.field} htmlFor={id} key={field.name}>{field.label}{field.required && " *"}
          {field.type === "select" ? <select {...common} className="form-select form-select-sm"><option value="">Selecione</option>{field.options?.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
            : field.type === "textarea" ? <textarea {...common} className="form-control form-control-sm" rows={3} maxLength={field.maxLength || 2000} />
              : <input {...common} className="form-control form-control-sm" type={field.type || "text"} min={field.min} max={field.max} step={field.step} maxLength={field.maxLength || 100} />}
        </label>;
      })}</div>
    </form>
  </Modal>;
}
