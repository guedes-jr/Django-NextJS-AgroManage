"use client";

import { useId } from "react";

export type WhatsAppContactValues = {
  phone_is_whatsapp: boolean;
  receive_system_alerts: boolean;
};

export default function WhatsAppContactOptions({ value, onChange, disabled = false }: {
  value: WhatsAppContactValues;
  onChange: (value: WhatsAppContactValues) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return <fieldset disabled={disabled} className="d-flex flex-column gap-3 p-3 rounded-3" style={{ border: "1px solid var(--border)", background: "var(--background)" }}>
    <legend className="float-none w-auto px-1 mb-0 small fw-semibold">Contato e alertas</legend>
    <label htmlFor={`${id}-contact`} className="d-flex align-items-start gap-2 mb-0">
      <input id={`${id}-contact`} type="checkbox" className="form-check-input flex-shrink-0" checked={value.phone_is_whatsapp} onChange={event => onChange({ phone_is_whatsapp: event.target.checked, receive_system_alerts: value.receive_system_alerts })} />
      <span>Este contato também possui WhatsApp</span>
    </label>
    <label htmlFor={`${id}-alerts`} className="d-flex align-items-start gap-2 mb-0">
      <input id={`${id}-alerts`} type="checkbox" className="form-check-input flex-shrink-0" checked={value.receive_system_alerts} onChange={event => onChange({ ...value, receive_system_alerts: event.target.checked })} />
      <span>Desejo receber notificações de alerta do sistema<small className="d-block text-muted-foreground mt-1">Inclui notificações no sistema, e-mail, push e WhatsApp, conforme suas preferências de canais e permissões. Você pode desativar a qualquer momento.</small></span>
    </label>
  </fieldset>;
}
