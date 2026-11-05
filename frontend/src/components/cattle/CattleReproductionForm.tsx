"use client";

import { useMemo } from "react";
import { ReproducaoModal, type ModalField } from "@/components/reproducao/ReproducaoModal";
import { CattleForm, type CattleFormSpec } from "./CattleForm";
import { useOrganizationLocale } from "@/lib/locale";

export function CattleReproductionForm({ spec, onClose, onSaved }: { spec: CattleFormSpec; onClose: () => void; onSaved: () => void }) {
  const { t } = useOrganizationLocale();
  const fields = useMemo<ModalField[]>(() => spec.fields.map(field => ({
    name: field.name, label: field.label, type: field.type === "checkbox" ? "text" : field.type || "text",
    required: field.required, options: field.options, min: field.min, max: field.max, step: field.step,
    maxLength: field.maxLength ?? (field.type === "textarea" ? 2000 : undefined),
    disabled: field.readOnly, initialValue: spec.initial?.[field.name], colSpan: field.type === "textarea" ? "full" : "half",
    showIf: field.visibleWhen ? values => values[field.visibleWhen!.field] === field.visibleWhen!.value : undefined,
  })), [spec]);
  if (spec.sections || spec.fields.some(field => field.type === "checkbox")) return <CattleForm reproduction spec={spec} onClose={onClose} onSaved={onSaved}/>;
  return <ReproducaoModal open title={spec.title} subtitle={spec.description} fields={fields} confirmLabel={spec.submitLabel || t("reproduction.save")} onClose={onClose} onConfirm={async values => { await spec.save(values); onSaved(); }}/>;
}
