"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Box, ChevronDown, CircleCheck, Coins, Edit3, List, Plus, Save, ShoppingCart, Sprout, Trash2, Weight } from "lucide-react";
import { cropService } from "@/services/cropService";
import { useOrganizationLocale } from "@/lib/locale";
import type { TranslationKey } from "@/lib/localeMessages";
import styles from "@/components/crops/production.module.css";
import { CropPageHeader } from "@/components/crops/CropPageHeader";
import {
  cropImage,
  decimalValue,
  extractArray,
  formatDate,
  formatMoney,
  formatNumber,
  monthBounds,
  todayIso,
} from "@/components/crops/production";

type SaleUnit = "kg" | "sack" | "box" | "ton" | "truck" | "bale" | "bundle";
const UNITS: SaleUnit[] = ["kg", "sack", "box", "ton", "truck", "bale", "bundle"];

type BalanceLevel = "ok" | "low" | "none";
type Balance = { unit: string; harvested: string; sold: string; available: string; level: BalanceLevel };
type Availability = { planting_cycle: string; balances: Balance[]; unit_weights?: Record<string, string> };
type CycleAvailability = { balances: Balance[]; weights: Record<string, number> };

type PlantationOption = { id: string; name?: string; crop_name?: string; field_name?: string };
type Buyer = { id: string; name: string };
type Sale = {
  id: string;
  planting_cycle: string;
  planting_cycle_name?: string;
  product?: string;
  buyer?: string | null;
  buyer_name?: string;
  sale_date: string;
  quantity: string;
  unit: SaleUnit;
  unit_price: string;
  total_amount: string;
  notes?: string;
};

type SaleForm = { planting_cycle: string; quantity: string; unit: SaleUnit; sale_date: string; unit_price: string; buyer: string; notes: string };

const emptyForm = (): SaleForm => ({ planting_cycle: "", quantity: "", unit: "kg", sale_date: todayIso(), unit_price: "", buyer: "", notes: "" });
const unitKey = (unit: SaleUnit) => `sales.unit.${unit}` as TranslationKey;

export default function VendaProducaoPage() {
  const { language, t } = useOrganizationLocale();
  const [plantations, setPlantations] = useState<PlantationOption[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [period, setPeriod] = useState(monthBounds);
  const [form, setForm] = useState<SaleForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Record<string, CycleAvailability>>({});

  const loadAvailability = useCallback(() => {
    cropService
      .saleAvailability()
      .then(({ data }) => setAvailability(Object.fromEntries(extractArray<Availability>(data).map((row) => [row.planting_cycle, {
        balances: row.balances,
        weights: Object.fromEntries(Object.entries(row.unit_weights || {}).map(([unit, kg]) => [unit, decimalValue(kg)])),
      }]))))
      .catch(() => setAvailability({}));
  }, []);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  useEffect(() => {
    Promise.all([
      cropService.list({ page_size: 200 }),
      cropService.listHarvestBuyers({ is_active: true }),
    ])
      .then(([plantationsRes, buyersRes]) => {
        setPlantations(extractArray<PlantationOption>(plantationsRes.data));
        setBuyers(extractArray<Buyer>(buyersRes.data));
      })
      .catch(() => setLoadError(t("sales.loadError")));
  }, [t]);

  const loadSales = useCallback(async () => {
    const response = await cropService.listSales({ date_from: period.from, date_to: period.to, page_size: 500 });
    setSales(extractArray<Sale>(response.data));
  }, [period]);

  useEffect(() => {
    let active = true;
    cropService
      .listSales({ date_from: period.from, date_to: period.to, page_size: 500 })
      .then((response) => {
        if (!active) return;
        setSales(extractArray<Sale>(response.data));
        setLoadError("");
      })
      .catch(() => active && setLoadError(t("sales.loadError")))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [period, t]);

  const quantity = decimalValue(form.quantity);
  const price = decimalValue(form.unit_price);
  const total = quantity * price;

  const totals = useMemo(() => {
    const byUnit = new Map<SaleUnit, number>();
    for (const sale of sales) byUnit.set(sale.unit, (byUnit.get(sale.unit) || 0) + decimalValue(sale.quantity));
    return {
      count: sales.length,
      quantity: [...byUnit.entries()].map(([unit, value]) => `${formatNumber(value, language, value % 1 ? 2 : 0)} ${t(unitKey(unit))}`).join(" + ") || `0 ${t("sales.unit.kg")}`,
      value: sales.reduce((sum, sale) => sum + decimalValue(sale.total_amount), 0),
    };
  }, [language, sales, t]);

  const editingSale = editingId ? sales.find((sale) => sale.id === editingId) : undefined;
  const unitLabel = (unit: string) => t(`sales.unit.${unit}` as TranslationKey);

  /**
   * Remaining balance of the chosen plantation in the unit of the sale. The backend nets
   * everything with a known weight in kg (sacks/boxes use the harvest package weight);
   * tons and weighed units are converted from that kg balance.
   */
  const balanceFor = (cycle: string, unit: SaleUnit) => {
    const { balances = [], weights = {} } = availability[cycle] || {};
    const own = balances.find((item) => item.unit === unit && unit !== "ton");
    const kgPerUnit = unit === "ton" ? 1000 : unit === "kg" ? 1 : weights[unit];
    const balance = own ?? (kgPerUnit ? balances.find((item) => item.unit === "kg") : undefined);
    if (!balance) return null;
    const factor = own ? 1 : kgPerUnit || 1;
    let available = decimalValue(balance.available);
    // While editing, the quantity of the sale itself is still available to it.
    if (editingSale && editingSale.planting_cycle === cycle) {
      const saleUnit = editingSale.unit as SaleUnit;
      const quantity = decimalValue(editingSale.quantity);
      if (balance.unit === saleUnit && saleUnit !== "ton") available += quantity;
      else if (balance.unit === "kg") {
        const saleKg = saleUnit === "ton" ? 1000 : saleUnit === "kg" ? 1 : weights[saleUnit];
        if (saleKg) available += quantity * saleKg;
      }
    }
    const harvested = decimalValue(balance.harvested);
    const level: BalanceLevel = available <= 0 || harvested <= 0 ? "none" : available <= harvested * 0.2 ? "low" : "ok";
    return { available: available / factor, level, unit };
  };
  const selectedBalance = form.planting_cycle ? balanceFor(form.planting_cycle, form.unit) : null;
  const overBalance = !!selectedBalance && quantity > selectedBalance.available;

  const badgeText = (value: number, unit: string) => `${formatNumber(value, language, value % 1 ? 2 : 0)} ${unitLabel(unit)}`;

  const productName = (plantation?: PlantationOption) =>
    plantation ? [plantation.crop_name || plantation.name, plantation.name && plantation.crop_name !== plantation.name ? plantation.name : null].filter(Boolean).join(" — ") : "";

  const update = (patch: Partial<SaleForm>) => setForm((current) => ({ ...current, ...patch }));

  const reset = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const handleSubmit = async () => {
    if (saving) return;
    if (!form.planting_cycle || quantity <= 0 || price <= 0 || !form.sale_date) {
      setError(t("sales.required"));
      return;
    }
    const payload = {
      planting_cycle: form.planting_cycle,
      quantity,
      unit: form.unit,
      sale_date: form.sale_date,
      unit_price: price,
      buyer: form.buyer || null,
      notes: form.notes.trim(),
    };
    try {
      setSaving(true);
      setError("");
      if (editingId) await cropService.updateSale(editingId, payload);
      else await cropService.createSale(payload);
      setMessage(editingId ? t("sales.updated") : t("sales.saved"));
      reset();
      await loadSales();
      loadAvailability();
    } catch {
      setError(t("sales.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (sale: Sale) => {
    setEditingId(sale.id);
    setMessage("");
    setError("");
    setForm({
      planting_cycle: sale.planting_cycle,
      quantity: String(sale.quantity),
      unit: sale.unit,
      sale_date: sale.sale_date,
      unit_price: String(sale.unit_price),
      buyer: sale.buyer || "",
      notes: sale.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (sale: Sale) => {
    if (!window.confirm(t("sales.deleteConfirm"))) return;
    try {
      setDeletingId(sale.id);
      setError("");
      await cropService.deleteSale(sale.id);
      if (editingId === sale.id) reset();
      await loadSales();
      loadAvailability();
    } catch {
      setError(t("sales.deleteError"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={styles.page}>
      <CropPageHeader icon={ShoppingCart} title={t("sales.title")} description={t("sales.description")} />

      {loadError && (
        <div role="alert" className="alert alert-danger d-flex justify-content-between align-items-center gap-2 flex-wrap mb-0">
          <span>{loadError}</span>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => window.location.reload()}>{t("sales.retry")}</button>
        </div>
      )}
      {message && (
        <div role="status" className="alert alert-success d-flex align-items-center gap-2 py-2 mb-0">
          <CircleCheck size={18} aria-hidden="true" /> {message}
        </div>
      )}
      {error && <div role="alert" className="alert alert-danger py-2 mb-0">{error}</div>}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}><ShoppingCart size={24} aria-hidden="true" /> {editingId ? t("sales.edit") : t("sales.register")}</h2>
        {!plantations.length && !loadError ? (
          <p className={styles.hint}>{t("sales.noPlantations")}</p>
        ) : (
          <div className={styles.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))" }}>
            <div className={styles.field}>
              <span className={styles.label} id="sale-product-label">{t("sales.product")}<span className={styles.required}>*</span></span>
              <ProductPicker
                labelId="sale-product-label"
                value={form.planting_cycle}
                placeholder={t("sales.select")}
                options={plantations.map((plantation) => ({
                  id: plantation.id,
                  name: productName(plantation),
                  detail: plantation.field_name || "",
                  badges: (availability[plantation.id]?.balances || []).map((balance) => {
                    const own = balanceFor(plantation.id, balance.unit as SaleUnit);
                    return { key: balance.unit, level: own?.level ?? balance.level, text: badgeText(own?.available ?? decimalValue(balance.available), balance.unit) };
                  }),
                }))}
                emptyBadge={t("sales.noHarvest")}
                onChange={(id) => update({ planting_cycle: id })}
              />
              <span className={styles.hint}>{t("sales.availableHint")}</span>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="sale-quantity">{t("sales.quantity")}<span className={styles.required}>*</span></label>
              <div className={styles.inputGroup}>
                <input id="sale-quantity" className="form-control" inputMode="decimal" value={form.quantity} placeholder="0" onChange={(event) => update({ quantity: event.target.value })} />
                <select className={`form-select ${styles.unitSelect}`} style={{ minWidth: 104 }} aria-label={t("plantations.operation.unit")} value={form.unit} onChange={(event) => update({ unit: event.target.value as SaleUnit })}>
                  {UNITS.map((unit) => <option key={unit} value={unit}>{t(unitKey(unit))}</option>)}
                </select>
              </div>
              {form.planting_cycle && (
                <span className="d-flex flex-wrap align-items-center gap-2">
                  <span className={styles.stockBadge} data-level={selectedBalance?.level ?? "none"}>
                    {selectedBalance ? t("sales.available").replace("{value}", badgeText(selectedBalance.available, form.unit)) : t("sales.availableNone")}
                  </span>
                  {selectedBalance?.level === "low" && <span className={styles.hint}>{t("sales.availableLow")}</span>}
                </span>
              )}
              {overBalance && selectedBalance && (
                <span role="status" className={styles.hint} style={{ color: "var(--warning-foreground, oklch(0.5 0.12 75))", fontWeight: 600 }}>
                  <AlertTriangle size={14} aria-hidden="true" /> {t("sales.overAvailable").replace("{value}", badgeText(selectedBalance.available, form.unit))}
                </span>
              )}
            </div>
            <label className={styles.field}>
              <span className={styles.label}>{t("sales.date")}<span className={styles.required}>*</span></span>
              <input className="form-control" type="date" value={form.sale_date} onChange={(event) => update({ sale_date: event.target.value })} />
            </label>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="sale-price">{t("sales.price")}<span className={styles.required}>*</span></label>
              <div className={styles.inputGroup}>
                <input id="sale-price" className="form-control" inputMode="decimal" value={form.unit_price} placeholder="0,00" onChange={(event) => update({ unit_price: event.target.value })} />
                <span className={styles.suffix}>R$ / {t(unitKey(form.unit))}</span>
              </div>
            </div>
            <label className={styles.field}>
              <span className={styles.label}>{t("sales.buyerOptional")}</span>
              <select className="form-select" value={form.buyer} onChange={(event) => update({ buyer: event.target.value })}>
                <option value="">{t("sales.noBuyer")}</option>
                {buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.name}</option>)}
              </select>
            </label>
            <div className={styles.totalBox}>
              <small>{t("sales.total")}</small>
              <strong>{formatMoney(total, language)}</strong>
            </div>
          </div>
        )}
        <div className={`${styles.actions} mt-3`}>
          {editingId && <button type="button" className="btn btn-outline-secondary" onClick={reset}>{t("sales.cancelEdit")}</button>}
          <button type="button" className="btn btn-success" disabled={saving || !plantations.length} onClick={handleSubmit}>
            {editingId ? <Save size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
            {saving ? t("sales.saving") : editingId ? t("sales.update") : t("sales.save")}
          </button>
        </div>
      </section>

      <section className={`${styles.card} ${styles.tableCard}`}>
        <div className={styles.tableHeader}>
          <h2 className={styles.cardTitle}><List size={24} aria-hidden="true" /> {t("sales.list")}</h2>
          <div className={styles.periodFilters}>
            <label>{t("sales.from")}: <input className="form-control form-control-sm" type="date" value={period.from} max={period.to} onChange={(event) => event.target.value && setPeriod((current) => ({ ...current, from: event.target.value }))} /></label>
            <label>{t("sales.to")}: <input className="form-control form-control-sm" type="date" value={period.to} min={period.from} onChange={(event) => event.target.value && setPeriod((current) => ({ ...current, to: event.target.value }))} /></label>
          </div>
        </div>
        <div className="table-responsive">
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("plantations.operation.date")}</th>
                <th>{t("sales.product")}</th>
                <th className={styles.num}>{t("plantations.operation.quantity")}</th>
                <th className={styles.num}>{t("sales.unitPrice")}</th>
                <th className={styles.num}>{t("sales.totalColumn")}</th>
                <th className={styles.num}>{t("sales.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className={styles.empty}>{t("sales.loading")}</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan={6} className={styles.empty}>{t("sales.empty")}</td></tr>
              ) : (
                sales.map((sale) => {
                  const image = cropImage(sale.product || sale.planting_cycle_name);
                  return (
                    <tr key={sale.id}>
                      <td>{formatDate(sale.sale_date, language)}</td>
                      <td>
                        <div className={styles.product}>
                          {image
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={image} alt="" className={styles.productThumb} />
                            : <span className={styles.productFallback} aria-hidden="true"><Sprout size={16} /></span>}
                          <span style={{ minWidth: 0 }}>
                            <strong>{sale.product || sale.planting_cycle_name}</strong>
                            {(sale.buyer_name || sale.planting_cycle_name) && (
                              <span className={styles.sub}>{[sale.planting_cycle_name, sale.buyer_name].filter(Boolean).join(" · ")}</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className={styles.num}>{formatNumber(decimalValue(sale.quantity), language, decimalValue(sale.quantity) % 1 ? 2 : 0)} {t(unitKey(sale.unit))}</td>
                      <td className={styles.num}>{formatNumber(decimalValue(sale.unit_price), language)}</td>
                      <td className={styles.money}>{formatNumber(decimalValue(sale.total_amount), language)}</td>
                      <td>
                        <div className={styles.rowActions}>
                          <button type="button" className={styles.iconButton} onClick={() => handleEdit(sale)} title={t("sales.edit")} aria-label={t("sales.edit")}><Edit3 size={17} /></button>
                          <button type="button" className={styles.iconButton} data-tone="danger" disabled={deletingId === sale.id} onClick={() => handleDelete(sale)} title={t("plantations.operation.removeRecord")} aria-label={t("plantations.operation.removeRecord")}><Trash2 size={17} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.kpis}>
        <div className={styles.kpi}>
          <div className={styles.kpiIcon} aria-hidden="true"><Box size={22} /></div>
          <div><small>{t("sales.count")}</small><strong>{totals.count}</strong></div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiIcon} aria-hidden="true"><Weight size={22} /></div>
          <div style={{ minWidth: 0 }}><small>{t("sales.quantitySold")}</small><strong>{totals.quantity}</strong></div>
        </div>
        <div className={styles.kpi} data-tone="primary">
          <div className={styles.kpiIcon} aria-hidden="true"><Coins size={22} /></div>
          <div style={{ minWidth: 0 }}><small>{t("sales.valueSold")}</small><strong>{formatMoney(totals.value, language)}</strong></div>
        </div>
      </section>
    </div>
  );
}

type PickerOption = { id: string; name: string; detail: string; badges: { key: string; level: BalanceLevel; text: string }[] };

/** Product select that shows the harvested − sold balance of each plantation as badges. */
function ProductPicker({ labelId, value, placeholder, options, emptyBadge, onChange }: {
  labelId: string; value: string; placeholder: string; options: PickerOption[]; emptyBadge: string; onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === value);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const badges = (option: PickerOption) => (
    <span className={styles.badgeRow}>
      {option.badges.length
        ? option.badges.map((badge) => <span key={badge.key} className={styles.stockBadge} data-level={badge.level}>{badge.text}</span>)
        : <span className={styles.stockBadge} data-level="none">{emptyBadge}</span>}
    </span>
  );

  return (
    <div className={styles.picker} ref={rootRef} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <button type="button" className={styles.pickerButton} aria-haspopup="listbox" aria-expanded={open} aria-labelledby={labelId} onClick={() => setOpen((current) => !current)}>
        <span style={{ minWidth: 0 }}>{selected ? selected.name : <span className="text-muted-foreground">{placeholder}</span>}</span>
        <span className="d-flex align-items-center gap-2">{selected && badges(selected)}<ChevronDown size={16} aria-hidden="true" /></span>
      </button>
      {open && (
        <ul className={styles.pickerList} role="listbox" aria-labelledby={labelId}>
          {options.map((option) => (
            <li key={option.id}>
              <button type="button" role="option" aria-selected={option.id === value} className={styles.pickerOption} onClick={() => { onChange(option.id); setOpen(false); }}>
                <span>
                  <strong>{option.name}</strong>
                  {option.detail && <small className="text-muted-foreground">{option.detail}</small>}
                </span>
                {badges(option)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
