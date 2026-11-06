"use client";

import { useId, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { cattleError } from "@/services/cattleService";
import { useOrganizationLocale } from "@/lib/locale";
import styles from "./cattle.module.css";

export type CattleField = {
  name: string; label: string; type?: "text" | "number" | "date" | "select" | "textarea" | "checkbox";
  section?: string; readOnly?: boolean;
  required?: boolean; min?: string; max?: string; step?: string; maxLength?: number;
  options?: { value: string; label: string; parentValue?: string }[]; dependsOn?: string;
  visibleWhen?: { field: string; value: string };
};
export type CattleFormSpec = {
  title: string; description?: string; fields: CattleField[]; initial?: Record<string, string>;
  submitLabel?: string; save: (values: Record<string, string>) => Promise<unknown>;
  sections?: { id: string; title: string; description?: string }[];
};

export function CattleForm({ spec, onClose, onSaved, reproduction = false }: { reproduction?: boolean; spec: CattleFormSpec; onClose: () => void; onSaved: () => void }) {
  const { language, t } = useOrganizationLocale();
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
      setError(cattleError(error, language));
      setSaving(false);
    }
  }
  function renderField(field: CattleField) {
    const id = `${formId}-${field.name}`;
    const common = { id, name: field.name, value: values[field.name] || "", required: field.required, disabled: saving || field.readOnly, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setValues(previous => ({ ...previous, ...Object.fromEntries(spec.fields.filter(child => child.dependsOn === field.name).map(child => [child.name, ""])), [field.name]: event.target.value })) };
    return <label className={field.type === "checkbox" ? styles.checkField : reproduction ? "repro-field" : styles.field} htmlFor={id} key={field.name}>
      {field.type === "checkbox" ? <><input id={id} type="checkbox" checked={values[field.name] === "true"} disabled={common.disabled} onChange={event => setValues(previous => ({ ...previous, [field.name]: String(event.target.checked) }))} />{field.label}</> : <>{field.label}{field.required && " *"}
        {field.type === "select" ? <select {...common} className="form-select form-select-sm"><option value="">{t("cattle.form.select")}</option>{field.options?.filter(option => !field.dependsOn || option.parentValue === values[field.dependsOn]).map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
          : field.type === "textarea" ? <textarea {...common} className="form-control form-control-sm" rows={3} maxLength={field.maxLength || 2000} />
            : <input {...common} className="form-control form-control-sm" type={field.type || "text"} min={field.min} max={field.max} step={field.step} maxLength={field.maxLength || 100} />}
      </>}
    </label>;
  }
  const visibleFields = spec.fields.filter(field => !field.visibleWhen || values[field.visibleWhen.field] === field.visibleWhen.value);
  return <Modal variant={reproduction ? "reproduction" : "default"} isOpen onClose={() => { if (!saving) onClose(); }} title={spec.title} description={spec.description} maxWidth={spec.sections ? styles.animalDialog : styles.formDialog}
    footer={<div className={reproduction ? "d-flex justify-content-end gap-2 w-100" : styles.dialogActions}><button type="button" className={reproduction ? "repro-btn-secondary" : "btn btn-outline-secondary btn-sm"} onClick={onClose} disabled={saving}>{t("cattle.form.cancel")}</button><button form={formId} type="submit" className={reproduction ? "repro-btn-primary" : "btn btn-success btn-sm"} disabled={saving}>{saving ? t("cattle.form.saving") : spec.submitLabel || t("cattle.form.saveRecord")}</button></div>}>
    <form id={formId} onSubmit={submit} className={styles.form}>
      <p className={styles.formHint}>{t("cattle.form.requiredHint")}</p>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {spec.sections ? <div className={styles.animalSections}>{spec.sections.filter(section => visibleFields.some(field => field.section === section.id)).map(section => <fieldset className={styles.animalSection} key={section.id}><legend>{section.title}</legend>{section.description && <p className={styles.formHint}>{section.description}</p>}<div className={styles.fields}>{visibleFields.filter(field => field.section === section.id).map(renderField)}</div></fieldset>)}</div> : <div className={styles.fields}>{visibleFields.map(renderField)}</div>}
    </form>
  </Modal>;
}
