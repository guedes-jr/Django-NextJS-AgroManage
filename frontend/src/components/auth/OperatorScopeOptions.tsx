"use client";

import { useEffect, useState } from "react";
import apiClient from "@/services/api";
import { useOrganizationLocale } from "@/lib/locale";

/** Segments a member may open. Admin and manager see every contracted segment. */
export type OperatorScope = {
  segments: string[];
  operator_read_only: boolean;
};

type SegmentOption = { code: string; name: string; contracted: boolean };
export const VETERINARY_SEGMENT = "area-veterinario";
export const emptyOperatorScope: OperatorScope = { segments: [], operator_read_only: false };
export const scopedRoles = ["operator", "veterinarian"];

export default function OperatorScopeOptions({ value, onChange, disabled = false, role = "operator" }: {
  value: OperatorScope;
  onChange: (value: OperatorScope) => void;
  disabled?: boolean;
  role?: string;
}) {
  const { t } = useOrganizationLocale();
  const [segments, setSegments] = useState<SegmentOption[]>([]);
  const [hasError, setHasError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiClient.get<{ segments: SegmentOption[] }>("/auth/operator-options/")
      .then(({ data }) => { if (active) setSegments(data.segments || []); })
      .catch(() => { if (active) setHasError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const vet = role === "veterinarian";
  const contracted = segments.filter(option => option.contracted);
  const toggle = (code: string, checked: boolean) => onChange({
    ...value,
    segments: checked ? [...new Set([...value.segments, code])] : value.segments.filter(selected => selected !== code),
  });
  const granted = value.segments.filter(code => code !== VETERINARY_SEGMENT || !vet);

  return (
    <fieldset className="member-scope" disabled={disabled}>
      <legend>{t("memberScope.title")}</legend>
      <p className="member-scope-hint">{t(vet ? "memberScope.vetHint" : "memberScope.operatorHint")}</p>
      {hasError && <p className="text-danger small mb-2" role="alert">{t("operatorScope.loadFailed")}</p>}
      {loading && <small className="text-muted" role="status">{t("operatorScope.loading")}</small>}
      <div className="member-scope-grid">
        {contracted.map(option => {
          const isVet = option.code === VETERINARY_SEGMENT;
          const fixed = isVet && vet;
          const checked = fixed || value.segments.includes(option.code);
          return <label key={option.code} className={`member-scope-option ${checked ? "is-checked" : ""}`}>
            <input type="checkbox" className="form-check-input" checked={checked} disabled={fixed} onChange={event => toggle(option.code, event.target.checked)}/>
            <span>
              <strong>{option.name}</strong>
              <small>{fixed ? t("memberScope.includedInRole") : isVet ? t("memberScope.vetOptIn") : t("memberScope.segmentHint")}</small>
            </span>
          </label>;
        })}
      </div>
      {!loading && !hasError && !contracted.length && <small className="text-muted">{t("memberScope.noneContracted")}</small>}
      <label className="form-check mt-3">
        <input className="form-check-input" type="checkbox" checked={value.operator_read_only}
          onChange={event => onChange({ ...value, operator_read_only: event.target.checked })} />
        {t("operatorScope.readOnly")}
      </label>
      {!vet && !loading && !granted.length && contracted.length > 0 && (
        <p className="small text-warning-emphasis mb-0 mt-2" role="status">{t("memberScope.noneSelected")}</p>
      )}
    </fieldset>
  );
}
