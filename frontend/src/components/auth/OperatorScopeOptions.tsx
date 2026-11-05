"use client";

import { useEffect, useState } from "react";
import apiClient from "@/services/api";
import { useOrganizationLocale } from "@/lib/locale";

export type OperatorScope = {
  can_operate_crops: boolean;
  allowed_livestock: string[];
  operator_read_only: boolean;
};

type SpeciesOption = { id: string; name: string; code: string };
export const emptyOperatorScope: OperatorScope = {
  can_operate_crops: false,
  allowed_livestock: [],
  operator_read_only: false,
};

export default function OperatorScopeOptions({ value, onChange, disabled = false, role = "operator" }: {
  value: OperatorScope;
  onChange: (value: OperatorScope) => void;
  disabled?: boolean;
  role?: string;
}) {
  const { t } = useOrganizationLocale();
  const [species, setSpecies] = useState<SpeciesOption[]>([]);
  const [hasError, setHasError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiClient.get<{ species: SpeciesOption[] }>("/auth/operator-options/")
      .then(({ data }) => { if (active) setSpecies(data.species); })
      .catch(() => { if (active) setHasError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const toggleSpecies = (id: string, checked: boolean) => onChange({
    ...value,
    allowed_livestock: checked
      ? [...value.allowed_livestock, id]
      : value.allowed_livestock.filter(selected => selected !== id),
  });

  return (
    <fieldset className="border rounded-3 p-3" disabled={disabled}>
      <legend className="float-none w-auto h6 px-1">{t(role === "feeder" ? "operatorScope.titleFeeder" : "operatorScope.titleOperator")}</legend>
      {role !== "feeder" && <label className="form-check">
        <input className="form-check-input" type="checkbox" checked={value.can_operate_crops}
          onChange={event => onChange({ ...value, can_operate_crops: event.target.checked })} />
        {t("operatorScope.crops")}
      </label>}
      <p className="fw-semibold small mt-3 mb-2">{t("operatorScope.authorizedLivestock")}</p>
      {hasError && <p className="text-danger small" role="alert">{t("operatorScope.loadFailed")}</p>}
      {species.filter(option => role !== "feeder" || option.code === "bovinos").map(option => (
        <label className="form-check" key={option.id}>
          <input className="form-check-input" type="checkbox" checked={value.allowed_livestock.includes(option.id)}
            onChange={event => toggleSpecies(option.id, event.target.checked)} />
          {option.name}
        </label>
      ))}
      {loading && <small className="text-muted" role="status">{t("operatorScope.loading")}</small>}
      {!loading && !hasError && !species.length && <small className="text-muted">{t("operatorScope.noneAvailable")}</small>}
      <label className="form-check mt-3">
        <input className="form-check-input" type="checkbox" checked={value.operator_read_only}
          onChange={event => onChange({ ...value, operator_read_only: event.target.checked })} />
        {t("operatorScope.readOnly")}
      </label>
      <p className="small text-muted mb-0 mt-3">
        {t(role === "feeder" ? "operatorScope.feederDescription" : "operatorScope.operatorDescription")}{" "}
        {t("operatorScope.restrictions")}
      </p>
      {!value.can_operate_crops && !value.allowed_livestock.length && (
        <p className="small text-warning mb-0 mt-2">
          {t(role === "feeder" ? "operatorScope.noFeederAreas" : "operatorScope.noOperatorAreas")}
        </p>
      )}
    </fieldset>
  );
}
