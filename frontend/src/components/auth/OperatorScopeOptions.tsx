"use client";

import { useEffect, useState } from "react";
import apiClient from "@/services/api";

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

export default function OperatorScopeOptions({ value, onChange, disabled = false }: {
  value: OperatorScope;
  onChange: (value: OperatorScope) => void;
  disabled?: boolean;
}) {
  const [species, setSpecies] = useState<SpeciesOption[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiClient.get<{ species: SpeciesOption[] }>("/auth/operator-options/")
      .then(({ data }) => { if (active) setSpecies(data.species); })
      .catch(() => { if (active) setError("Não foi possível carregar os tipos de rebanho."); })
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
      <legend className="float-none w-auto h6 px-1">Áreas de atuação do operador</legend>
      <label className="form-check">
        <input className="form-check-input" type="checkbox" checked={value.can_operate_crops}
          onChange={event => onChange({ ...value, can_operate_crops: event.target.checked })} />
        Pode operar em plantações
      </label>
      <p className="fw-semibold small mt-3 mb-2">Rebanhos autorizados</p>
      {error && <p className="text-danger small" role="alert">{error}</p>}
      {species.map(option => (
        <label className="form-check" key={option.id}>
          <input className="form-check-input" type="checkbox" checked={value.allowed_livestock.includes(option.id)}
            onChange={event => toggleSpecies(option.id, event.target.checked)} />
          {option.name}
        </label>
      ))}
      {loading && <small className="text-muted" role="status">Carregando tipos de rebanho…</small>}
      {!loading && !error && !species.length && <small className="text-muted">Nenhum tipo de rebanho disponível.</small>}
      <label className="form-check mt-3">
        <input className="form-check-input" type="checkbox" checked={value.operator_read_only}
          onChange={event => onChange({ ...value, operator_read_only: event.target.checked })} />
        Somente consulta nas áreas autorizadas
      </label>
      <p className="small text-muted mb-0 mt-3">
        A dashboard exibirá apenas informações operacionais das áreas selecionadas.
        Sem acesso financeiro, gestão de usuários ou exclusão de históricos.
        Novos tipos de rebanho precisam de autorização.
      </p>
      {!value.can_operate_crops && !value.allowed_livestock.length && (
        <p className="small text-warning mb-0 mt-2">
          Nenhuma área liberada: o usuário terá acesso somente à conta, tarefas atribuídas e notificações permitidas.
        </p>
      )}
    </fieldset>
  );
}
