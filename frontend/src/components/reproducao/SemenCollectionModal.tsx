"use client";

import { FormEvent, useEffect, useState } from "react";
import { Info, Loader2, Plus, Trash2, X } from "lucide-react";
import { listSemenComponentStock, registerSemenCollection, type SemenComponentStockItem } from "@/services/livestockService";
import { useOrganizationLocale } from "@/lib/locale";

type Option = { id: string; label: string };
type Component = { item: string; quantity: string; unit: string };

const UNITS = ["ml", "l", "g", "kg", "unidade", "dose"] as const;
const UNIT_LABELS: Record<string, string> = { ml: "mL", l: "L", g: "g", kg: "kg", unidade: "un", dose: "dose" };
const today = () => new Date().toISOString().slice(0, 10);
const emptyComponent = (): Component => ({ item: "", quantity: "", unit: "ml" });

/** First readable message of a DRF validation error. */
function apiMessage(error: unknown): string | null {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  const find = (value: unknown): string | null => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(find).find(Boolean) ?? null;
    if (value && typeof value === "object") return Object.values(value).map(find).find(Boolean) ?? null;
    return null;
  };
  return find(data);
}

/**
 * Reprodução › Reprodutores › Coleta de sêmen.
 * The diluent components leave the stock and the doses produced enter it as the reproducer's semen.
 */
/** Mounted only while open (the parent renders it conditionally), so each opening starts clean. */
export function SemenCollectionModal({ onClose, onSaved, reproducers, responsibles, initialAnimal }: {
  onClose: () => void; onSaved: (doses: number) => void;
  reproducers: Option[]; responsibles: Option[]; initialAnimal?: string;
}) {
  const { language, t } = useOrganizationLocale();
  const [items, setItems] = useState<SemenComponentStockItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(() => ({ animal: initialAnimal || (reproducers.length === 1 ? reproducers[0].id : ""), date: today(), volume: "", responsible: "", diluted: true, doses: "", notes: "" }));
  const [components, setComponents] = useState<Component[]>([emptyComponent()]);

  useEffect(() => {
    const controller = new AbortController();
    listSemenComponentStock(controller.signal)
      .then(data => { if (!controller.signal.aborted) { setItems(data); setItemsError(""); } })
      .catch(() => { if (!controller.signal.aborted) setItemsError(t("semen.loadFailed")); })
      .finally(() => { if (!controller.signal.aborted) setItemsLoading(false); });
    return () => controller.abort();
  }, [t]);

  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 3 });
  const update = (key: keyof typeof form, value: string | boolean) => setForm(current => ({ ...current, [key]: value }));
  const changeComponent = (index: number, patch: Partial<Component>) => setComponents(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || (form.diluted && (itemsLoading || !items.length))) return;
    setSaving(true); setError("");
    try {
      await registerSemenCollection({
        animal: form.animal, collection_date: form.date, volume_ml: form.volume.replace(",", "."), responsible: form.responsible,
        diluted: form.diluted, doses_produced: Number(form.doses), notes: form.notes,
        components: form.diluted ? components.map(row => ({ item: row.item, quantity: row.quantity.replace(",", "."), unit: row.unit })) : [],
      });
      onSaved(Number(form.doses));
    } catch (err) {
      setError(apiMessage(err) || t("semen.saveFailed"));
    } finally { setSaving(false); }
  };

  return (
    <div className="repro-modal-overlay" onClick={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <div className="repro-modal" role="dialog" aria-modal="true" aria-labelledby="semen-title">
        <div className="repro-modal-header">
          <div>
            <div className="repro-modal-title" id="semen-title">{t("semen.title")}</div>
            <div className="repro-modal-subtitle">{t("semen.subtitle")}</div>
          </div>
          <button className="repro-modal-close" onClick={onClose} type="button" disabled={saving} aria-label={t("reproduction.cancel")}><X size={16} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="repro-modal-body">
            <div className="repro-fields-grid">
              <div className="repro-field">
                <label htmlFor="semen-animal">{t("semen.reproducer")}<span className="repro-required">*</span></label>
                <select id="semen-animal" required disabled={saving} value={form.animal} onChange={e => update("animal", e.target.value)}>
                  <option value="">{t("reproduction.select")}</option>
                  {reproducers.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
                {!reproducers.length && <small className="repro-field-hint">{t("semen.noReproducers")}</small>}
              </div>
              <div className="repro-field">
                <label htmlFor="semen-date">{t("semen.date")}<span className="repro-required">*</span></label>
                <input id="semen-date" type="date" required max={today()} disabled={saving} value={form.date} onChange={e => update("date", e.target.value)} />
              </div>
              <div className="repro-field">
                <label htmlFor="semen-volume">{t("semen.volume")}<span className="repro-required">*</span></label>
                <input id="semen-volume" type="number" inputMode="decimal" required min="0.01" step="0.01" placeholder="0,00" disabled={saving} value={form.volume} onChange={e => update("volume", e.target.value)} />
              </div>
              <div className="repro-field">
                <label htmlFor="semen-responsible">{t("semen.responsible")}<span className="repro-required">*</span></label>
                <select id="semen-responsible" required disabled={saving} value={form.responsible} onChange={e => update("responsible", e.target.value)}>
                  <option value="">{t("reproduction.select")}</option>
                  {responsibles.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </div>
              <fieldset className="repro-field repro-semen-choice">
                <legend>{t("semen.diluted")}<span className="repro-required">*</span></legend>
                <div>
                  {[[true, t("semen.yes")], [false, t("semen.no")]].map(([value, label]) => (
                    <label key={String(value)}><input type="radio" name="semen-diluted" disabled={saving} checked={form.diluted === value} onChange={() => update("diluted", value as boolean)} />{label as string}</label>
                  ))}
                </div>
              </fieldset>
              <div className="repro-field">
                <label htmlFor="semen-doses">{t("semen.doses")}<span className="repro-required">*</span></label>
                <input id="semen-doses" type="number" inputMode="numeric" required min="1" step="1" placeholder="0" disabled={saving} value={form.doses} onChange={e => update("doses", e.target.value)} />
                <small className="repro-field-hint">{t("semen.dosesHint")}</small>
              </div>
              {form.diluted && (
                <div className="repro-field repro-semen-diluent" style={{ gridColumn: "1 / -1" }}>
                  <div className="repro-semen-diluent-head">
                    <span className="repro-semen-label">{t("semen.diluent")}<span className="repro-required">*</span>
                      <span className="repro-semen-info" title={t("semen.diluentHelp")} aria-label={t("semen.diluentHelp")}><Info size={16} /></span>
                    </span>
                    <button type="button" className="repro-btn-primary repro-semen-add" disabled={saving} onClick={() => setComponents(rows => [...rows, emptyComponent()])}><Plus size={16} />{t("semen.add")}</button>
                  </div>
                  {!itemsLoading && !itemsError && !items.length && <small role="status" className="repro-field-hint">{t("semen.noStockComponents")}</small>}
                  {itemsError && <div role="alert" className="alert alert-danger mb-0">{itemsError}</div>}
                  <div className="repro-inventory-list">
                    {components.map((row, index) => {
                      const stock = items.find(item => item.id === row.item);
                      return (
                        <div className="repro-inventory-row repro-inventory-row--unit" key={index}>
                          <select required disabled={saving || itemsLoading} value={row.item} aria-label={`${t("semen.component")} ${index + 1}`}
                            onChange={e => { const item = items.find(x => x.id === e.target.value); changeComponent(index, { item: e.target.value, unit: (item?.unidade_medida && UNITS.includes(item.unidade_medida as typeof UNITS[number])) ? item.unidade_medida : row.unit }); }}>
                            <option value="">{t("reproduction.select")}</option>
                            {items.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}
                          </select>
                          <input type="number" inputMode="decimal" required min="0.001" step="0.001" placeholder="0,00" disabled={saving} value={row.quantity}
                            aria-label={`${t("semen.quantity")} ${index + 1}`} onChange={e => changeComponent(index, { quantity: e.target.value })} />
                          <select disabled={saving} value={row.unit} aria-label={`${t("semen.unit")} ${index + 1}`} onChange={e => changeComponent(index, { unit: e.target.value })}>
                            {UNITS.map(unit => <option key={unit} value={unit}>{UNIT_LABELS[unit]}</option>)}
                          </select>
                          <button type="button" className="repro-inventory-remove" disabled={saving || components.length === 1}
                            aria-label={t("semen.remove", { index: index + 1 })} onClick={() => setComponents(rows => rows.filter((_, i) => i !== index))}><Trash2 size={17} /></button>
                          {stock && <small className="repro-field-hint repro-semen-stock">{t("semen.stockHint", { count: number.format(Number(stock.estoque_atual || 0)), unit: stock.unidade_display || stock.unidade_medida || "" })}</small>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="repro-field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="semen-notes">{t("semen.notes")}</label>
                <textarea id="semen-notes" maxLength={2000} disabled={saving} value={form.notes} onChange={e => update("notes", e.target.value)} />
              </div>
            </div>
            {error && <div role="alert" className="alert alert-danger mt-3 mb-0">{error}</div>}
          </div>
          <div className="repro-modal-footer">
            <button type="button" className="repro-btn-secondary" onClick={onClose} disabled={saving}>{t("reproduction.cancel")}</button>
            <button type="submit" className="repro-btn-primary" disabled={saving || !reproducers.length || (form.diluted && (itemsLoading || !items.length))}>
              {saving && <Loader2 size={16} className="spinner" />}{saving ? t("reproduction.saving") : t("reproduction.confirm")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
