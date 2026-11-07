"use client";

import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { useId } from "react";
import { useInterfaceLocale } from "@/lib/interfaceLocale";

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
  const { t } = useInterfaceLocale();
  return <fieldset disabled={disabled} className="d-flex flex-column gap-3 p-3 rounded-3" style={{ border: "1px solid var(--border)", background: "var(--background)" }}>
    <legend className="float-none w-auto px-1 mb-0 small fw-semibold">{t("whatsapp.title")}</legend>
    <label htmlFor={`${id}-contact`} className="d-flex align-items-start gap-2 mb-0">
      <input id={`${id}-contact`} type="checkbox" className="form-check-input flex-shrink-0" checked={value.phone_is_whatsapp} onChange={event => onChange({ phone_is_whatsapp: event.target.checked, receive_system_alerts: value.receive_system_alerts })} />
      <span>{t("whatsapp.contact")}</span>
    </label>
    <div className="d-flex align-items-start gap-1">
      <label htmlFor={`${id}-alerts`} className="d-flex align-items-start gap-2 mb-0 flex-grow-1">
        <input id={`${id}-alerts`} type="checkbox" className="form-check-input flex-shrink-0" checked={value.receive_system_alerts} onChange={event => onChange({ ...value, receive_system_alerts: event.target.checked })} />
        <span>{t("whatsapp.receiveAlerts")}</span>
      </label>
      <HelpTooltip id={`${id}-alerts-help`} label={t("whatsapp.alertsHelp")} text={t("whatsapp.description")}/>
    </div>
  </fieldset>;
}
