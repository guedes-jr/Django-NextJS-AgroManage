"use client";

import { useInterfaceLocale } from "@/lib/interfaceLocale";

export type ContactChannel = "email" | "whatsapp" | "telegram";
export type UserContact = {
  name: string;
  kind: "phone" | "email";
  value: string;
  is_whatsapp: boolean;
  is_telegram: boolean;
  notifications: ContactChannel[];
};

export function initialContacts(email: string, phone: string, whatsapp: boolean, telegram: boolean): UserContact[] {
  const contacts: UserContact[] = [];
  if (email) contacts.push({name: "E-mail", kind: "email", value: email, is_whatsapp: false, is_telegram: false, notifications: ["email"]});
  if (phone) contacts.push({name: "Telefone", kind: "phone", value: phone, is_whatsapp: whatsapp, is_telegram: telegram,
    notifications: [...(whatsapp ? ["whatsapp" as const] : []), ...(telegram ? ["telegram" as const] : [])]});
  return contacts;
}

export default function UserContacts({ contacts, defaults, onChange, disabled }: {
  contacts: UserContact[] | null;
  defaults: () => UserContact[];
  onChange: (contacts: UserContact[]) => void;
  disabled?: boolean;
}) {
  const { t } = useInterfaceLocale();
  const rows = contacts ?? [];
  function update(index: number, next: UserContact) {
    onChange(rows.map((row, current) => current === index ? next : row));
  }
  return <fieldset disabled={disabled} className="d-flex flex-column gap-2 mt-2">
    <legend className="small fw-semibold">{t("userContacts.title")}</legend>
    <p className="small mb-0">{t("userContacts.hint")}</p>
    {rows.map((row, index) => {
      const channels: ContactChannel[] = row.kind === "email" ? ["email"] : [
        ...(row.is_whatsapp ? ["whatsapp" as const] : []), ...(row.is_telegram ? ["telegram" as const] : []),
      ];
      return <div key={index} className="border rounded p-2 d-grid gap-2">
        <div className="d-flex flex-wrap gap-2">
          <input className="form-control" aria-label={t("userContacts.name")} placeholder={t("userContacts.name")} required maxLength={150} value={row.name} onChange={event => update(index, {...row, name: event.target.value})} />
          <select className="form-select" aria-label={t("userContacts.kind")} value={row.kind} onChange={event => update(index, {...row, kind: event.target.value === "email" ? "email" : "phone", value: "", is_whatsapp: false, is_telegram: false, notifications: []})}>
            <option value="phone">{t("userContacts.phone")}</option><option value="email">E-mail</option>
          </select>
          <input className="form-control" type={row.kind === "email" ? "email" : "tel"} aria-label={t("userContacts.value")} placeholder={t("userContacts.value")} required maxLength={255} value={row.value} onChange={event => update(index, {...row, value: event.target.value})} />
        </div>
        {row.kind === "phone" && <div className="d-flex flex-wrap gap-2">
          {(["whatsapp", "telegram"] as const).map(channel => <label key={channel} className="d-flex gap-1 align-items-center">
            <input type="checkbox" className="form-check-input" checked={row[`is_${channel}`]} onChange={event => update(index, {...row, [`is_${channel}`]: event.target.checked, notifications: event.target.checked ? row.notifications : row.notifications.filter(item => item !== channel)})} />
            {t(channel === "telegram" ? "userContacts.hasTelegram" : "userContacts.hasWhatsApp")}
          </label>)}
        </div>}
        <div className="d-flex flex-wrap gap-2">
          {channels.map(channel => <label key={channel} className="d-flex gap-1 align-items-center">
            <input type="checkbox" className="form-check-input" checked={row.notifications.includes(channel)}
              disabled={rows.some((other, current) => current !== index && other.notifications.includes(channel))}
              onChange={event => update(index, {...row, notifications: event.target.checked ? [...row.notifications, channel] : row.notifications.filter(item => item !== channel)})} />
            {t(`userContacts.notify.${channel}`)}
          </label>)}
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onChange(rows.filter((_, current) => current !== index))}>{t("userContacts.remove")}</button>
        </div>
      </div>;
    })}
    <button type="button" className="btn btn-sm btn-outline-secondary align-self-start" onClick={() => onChange([...(contacts ?? defaults()), {name: "", kind: "phone", value: "", is_whatsapp: false, is_telegram: false, notifications: []}])}>{t("userContacts.add")}</button>
  </fieldset>;
}
