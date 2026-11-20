"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Box,
  Check,
  Coins,
  Edit3,
  FileText,
  History,
  Layers,
  Package,
  RefreshCw,
  Save,
  ShoppingBag,
  Trash2,
  Wheat,
} from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { cropService } from "@/services/cropService";
import { useOrganizationLocale } from "@/lib/locale";
import type { TranslationKey } from "@/lib/localeMessages";
import styles from "@/components/crops/production.module.css";
import { CropPageHeader } from "@/components/crops/CropPageHeader";
import {
  decimalValue,
  extractArray,
  formatDate,
  formatInteger,
  formatMoney,
  formatNumber,
  todayIso,
} from "@/components/crops/production";

type QuantityUnit = "kg" | "box" | "truck";
type PackageType = "sack" | "box" | "big_bag" | "crate" | "other";

type Plantation = { id: string; name?: string; crop_name?: string; field_name?: string; farm_name?: string };

type Harvest = {
  id: string;
  harvest_type: "partial" | "total";
  harvest_type_display?: string;
  harvest_date: string;
  yield_kg: string;
  quantity?: string | null;
  quantity_unit?: QuantityUnit;
  unit_weight_kg?: string | null;
  destination: string;
  buyer_name?: string;
  buyer_name_display?: string;
  revenue_amount: string;
  packaged?: boolean;
  package_type?: PackageType | "";
  package_weight_kg?: string | null;
  package_count?: number | null;
  package_unit_cost?: string;
  packing_labor_per_package?: string;
  packing_other_costs?: string;
  packing_cost?: string;
  notes?: string;
};

type Sale = { id: string; total_amount: string };

type HarvestForm = {
  harvest_type: "partial" | "total";
  harvest_date: string;
  quantity: string;
  quantity_unit: QuantityUnit;
  unit_weight_kg: string;
  packaged: boolean;
  package_type: PackageType;
  package_weight_kg: string;
  package_count: string;
  package_unit_cost: string;
  packing_labor_per_package: string;
  packing_other_costs: string;
  notes: string;
};

const UNITS: QuantityUnit[] = ["kg", "box", "truck"];
const PACKAGE_TYPES: PackageType[] = ["sack", "box", "big_bag", "crate", "other"];

const emptyForm = (): HarvestForm => ({
  harvest_type: "partial",
  harvest_date: todayIso(),
  quantity: "",
  quantity_unit: "kg",
  unit_weight_kg: "",
  packaged: false,
  package_type: "sack",
  package_weight_kg: "",
  package_count: "",
  package_unit_cost: "",
  packing_labor_per_package: "",
  packing_other_costs: "",
  notes: "",
});

const unitKey = (unit: QuantityUnit) => `harvestForm.unit.${unit}` as TranslationKey;
const packageKey = (type: string) => `harvestForm.pack.type.${type}` as TranslationKey;

export default function ColheitaPage() {
  const { language, t } = useOrganizationLocale();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [plantation, setPlantation] = useState<Plantation | null>(null);
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [countEdited, setCountEdited] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<HarvestForm>(emptyForm);

  useEffect(() => {
    if (!id) return;
    let active = true;
    Promise.all([
      cropService.get(id),
      cropService.listHarvests({ planting_cycle: id }),
      cropService.listSales({ planting_cycle: id }).catch(() => ({ data: [] })),
    ])
      .then(([plantationRes, harvestsRes, salesRes]) => {
        if (!active) return;
        setPlantation(plantationRes.data);
        setHarvests(extractArray<Harvest>(harvestsRes.data));
        setSales(extractArray<Sale>(salesRes.data));
        setError("");
      })
      .catch(() => active && setError(t("plantations.harvest.couldNotLoad")))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, t]);

  // Quantities and packing costs of the form being filled.
  const quantity = decimalValue(form.quantity);
  const unitWeight = decimalValue(form.unit_weight_kg);
  const quantityKg = form.quantity_unit === "kg" ? quantity : quantity * unitWeight;
  const packageWeight = decimalValue(form.package_weight_kg);
  const suggestedCount = packageWeight > 0 && quantityKg > 0 ? Math.ceil(quantityKg / packageWeight) : 0;
  const packageCount = form.packaged ? Math.max(0, Math.round(decimalValue(form.package_count))) : 0;
  const packageUnitCost = decimalValue(form.package_unit_cost);
  const laborPerPackage = decimalValue(form.packing_labor_per_package);
  const otherCosts = decimalValue(form.packing_other_costs);
  const packagesCost = packageCount * packageUnitCost;
  const laborCost = packageCount * laborPerPackage;
  const packingCost = form.packaged ? packagesCost + laborCost + otherCosts : 0;

  const update = (patch: Partial<HarvestForm>) => setForm((current) => ({ ...current, ...patch }));

  // Keeps the package count in sync with quantity/weight until the user edits it.
  const updateAndSuggest = (patch: Partial<HarvestForm>) => {
    setForm((current) => {
      const next = { ...current, ...patch };
      if (countEdited) return next;
      const qty = decimalValue(next.quantity);
      const kg = next.quantity_unit === "kg" ? qty : qty * decimalValue(next.unit_weight_kg);
      const weight = decimalValue(next.package_weight_kg);
      next.package_count = weight > 0 && kg > 0 ? String(Math.ceil(kg / weight)) : "";
      return next;
    });
  };

  const cycleTotals = useMemo(() => {
    const harvestedKg = harvests.reduce((sum, item) => sum + decimalValue(item.yield_kg), 0);
    const packages = harvests.reduce((sum, item) => sum + (item.packaged ? item.package_count || 0 : 0), 0);
    const packing = harvests.reduce((sum, item) => sum + decimalValue(item.packing_cost), 0);
    const revenue =
      harvests.reduce((sum, item) => sum + decimalValue(item.revenue_amount), 0) +
      sales.reduce((sum, item) => sum + decimalValue(item.total_amount), 0);
    return { harvestedKg, packages, packing, revenue };
  }, [harvests, sales]);

  const visibleHarvests = showAll ? harvests : harvests.slice(0, 5);
  const visibleTotals = useMemo(
    () => ({
      kg: visibleHarvests.reduce((sum, item) => sum + decimalValue(item.yield_kg), 0),
      packing: visibleHarvests.reduce((sum, item) => sum + decimalValue(item.packing_cost), 0),
      revenue: visibleHarvests.reduce((sum, item) => sum + decimalValue(item.revenue_amount), 0),
    }),
    [visibleHarvests],
  );

  const resetForm = () => {
    setEditingId(null);
    setCountEdited(false);
    setForm(emptyForm());
  };

  const validate = () => {
    if (!form.harvest_date) return t("plantations.harvest.dateRequired");
    if (quantity <= 0) return t("plantations.harvest.quantityRequired");
    if (form.quantity_unit !== "kg" && unitWeight <= 0) return t("harvestForm.unitWeightRequired");
    if (form.packaged) {
      if (!form.package_type) return t("harvestForm.pack.typeRequired");
      if (packageWeight <= 0) return t("harvestForm.pack.weightRequired");
      if (packageCount <= 0) return t("harvestForm.pack.countRequired");
    }
    if (form.notes.length > 200) return t("plantations.harvest.notesTooLong");
    return "";
  };

  const refresh = async () => {
    if (!id) return;
    const response = await cropService.listHarvests({ planting_cycle: id });
    setHarvests(extractArray<Harvest>(response.data));
  };

  const handleSubmit = async () => {
    if (saving || !id) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    const payload: Record<string, unknown> = {
      planting_cycle: id,
      harvest_type: form.harvest_type,
      harvest_date: form.harvest_date,
      quantity,
      quantity_unit: form.quantity_unit,
      unit_weight_kg: form.quantity_unit === "kg" ? null : unitWeight,
      packaged: form.packaged,
      package_type: form.packaged ? form.package_type : "",
      package_weight_kg: form.packaged ? packageWeight : null,
      package_count: form.packaged ? packageCount : null,
      package_unit_cost: form.packaged ? packageUnitCost : 0,
      packing_labor_per_package: form.packaged ? laborPerPackage : 0,
      packing_other_costs: form.packaged ? otherCosts : 0,
      notes: form.notes.trim(),
    };
    try {
      setSaving(true);
      setError("");
      if (editingId) {
        // Sale fields of older harvests stay untouched: sales are recorded in "Venda da produção".
        await cropService.updateHarvest(editingId, payload);
      } else {
        await cropService.createHarvest({ ...payload, destination: "stock" });
      }
      await refresh();
      resetForm();
    } catch {
      setError(t("plantations.harvest.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (harvest: Harvest) => {
    setEditingId(harvest.id);
    setCountEdited(true);
    setError("");
    setForm({
      harvest_type: harvest.harvest_type,
      harvest_date: harvest.harvest_date,
      quantity: String(harvest.quantity ?? harvest.yield_kg ?? ""),
      quantity_unit: harvest.quantity_unit || "kg",
      unit_weight_kg: harvest.unit_weight_kg ? String(harvest.unit_weight_kg) : "",
      packaged: Boolean(harvest.packaged),
      package_type: (harvest.package_type || "sack") as PackageType,
      package_weight_kg: harvest.package_weight_kg ? String(harvest.package_weight_kg) : "",
      package_count: harvest.package_count ? String(harvest.package_count) : "",
      package_unit_cost: decimalValue(harvest.package_unit_cost) ? String(harvest.package_unit_cost) : "",
      packing_labor_per_package: decimalValue(harvest.packing_labor_per_package) ? String(harvest.packing_labor_per_package) : "",
      packing_other_costs: decimalValue(harvest.packing_other_costs) ? String(harvest.packing_other_costs) : "",
      notes: harvest.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (harvest: Harvest) => {
    if (!window.confirm(t("plantations.harvest.removeConfirm"))) return;
    try {
      setDeletingId(harvest.id);
      setError("");
      await cropService.deleteHarvest(harvest.id);
      if (editingId === harvest.id) resetForm();
      await refresh();
    } catch {
      setError(t("plantations.harvest.deleteFailed"));
    } finally {
      setDeletingId(null);
    }
  };

  const typeLabel = (harvest: Harvest) =>
    harvest.harvest_type === "total" ? t("plantations.harvest.total") : t("plantations.harvest.partial");

  const quantityLabel = (harvest: Harvest) => {
    const unit = harvest.quantity_unit || "kg";
    if (unit === "kg") return `${formatNumber(decimalValue(harvest.yield_kg), language)} kg`;
    return `${formatNumber(decimalValue(harvest.quantity), language)} ${t(unitKey(unit)).toLowerCase()}`;
  };

  const packingLabel = (harvest: Harvest) =>
    harvest.packaged && harvest.package_count
      ? `${formatInteger(harvest.package_count, language)} × ${t(packageKey(harvest.package_type || "other")).toLowerCase()}`
      : t("harvestForm.table.noPacking");

  const handleGeneratePdf = () => {
    const doc = new jsPDF();
    const title = plantation?.name || plantation?.crop_name || t("plantations.harvest.title");
    doc.setFontSize(16);
    doc.text(`${t("plantations.harvest.reportTitle")} - ${title}`, 14, 18);
    doc.setFontSize(10);
    doc.text(`${plantation?.field_name || "-"} | ${plantation?.farm_name || "-"}`, 14, 26);
    doc.text(`${t("harvestForm.cards.harvested")}: ${formatNumber(cycleTotals.harvestedKg, language)} kg`, 14, 34);
    doc.text(`${t("harvestForm.cards.packingCost")}: ${formatMoney(cycleTotals.packing, language)}`, 14, 42);
    autoTable(doc, {
      startY: 50,
      head: [[
        t("plantations.operation.date"),
        t("plantations.operation.type"),
        t("plantations.operation.quantity"),
        "Kg",
        t("harvestForm.table.packing"),
        t("harvestForm.table.packingCost"),
      ]],
      body: harvests.map((harvest) => [
        formatDate(harvest.harvest_date, language),
        typeLabel(harvest),
        quantityLabel(harvest),
        formatNumber(decimalValue(harvest.yield_kg), language),
        packingLabel(harvest),
        formatMoney(decimalValue(harvest.packing_cost), language),
      ]),
    });
    doc.save(`colheita-${title.toLowerCase().replace(/\s+/g, "-")}.pdf`);
  };

  if (loading) {
    return (
      <div className="p-4">
        <Skeleton height="56px" width="360px" className="mb-4" />
        <Skeleton height="420px" className="mb-3" />
        <Skeleton height="220px" />
      </div>
    );
  }

  if (!plantation) return <div className="p-4 text-muted">{t("plantations.notFound")}</div>;

  return (
    <div className={styles.page}>
      <CropPageHeader
        icon={ShoppingBag}
        title={t("plantations.harvest.title")}
        description={t("plantations.harvest.description")}
        plantation={{ id, name: plantation.name || plantation.crop_name, field: plantation.field_name }}
      />

      {error && <div className="alert alert-danger py-2 px-3 mb-0" role="alert">{error}</div>}

      <section className={styles.kpis} aria-label={t("plantations.harvest.summary")}>
        <Kpi icon={<Wheat size={22} />} label={t("harvestForm.cards.harvested")} value={`${formatNumber(cycleTotals.harvestedKg, language)} kg`} helper={t("harvestForm.cards.harvests").replace("{count}", String(harvests.length))} />
        <Kpi icon={<Box size={22} />} label={t("harvestForm.cards.packed")} value={`${formatInteger(cycleTotals.packages, language)} ${t("harvestForm.pack.unitShort")}`} helper={t("plantations.harvest.inCulture")} />
        <Kpi icon={<Package size={22} />} label={t("harvestForm.cards.packingCost")} value={formatMoney(cycleTotals.packing, language)} helper={t("plantations.harvest.inCulture")} />
        <Kpi tone="primary" icon={<Coins size={22} />} label={t("harvestForm.cards.revenue")} value={formatMoney(cycleTotals.revenue, language)} helper={t("harvestForm.cards.revenueHint")} />
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{editingId ? t("plantations.harvest.edit") : t("plantations.harvest.register")}</h2>
        <div className={styles.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" }}>
          <div className={styles.field}>
            <span className={styles.label}>{t("plantations.harvest.type")}</span>
            <div className={styles.choices}>
              {(["partial", "total"] as const).map((type) => (
                <button key={type} type="button" className={styles.choice} aria-pressed={form.harvest_type === type} onClick={() => update({ harvest_type: type })}>
                  <span className={styles.radio}>{form.harvest_type === type && <Check size={14} strokeWidth={3} />}</span>
                  <span>
                    <strong>{type === "partial" ? t("plantations.harvest.partial") : t("plantations.harvest.total")}</strong>
                    <small>{type === "partial" ? t("plantations.harvest.partialDescription") : t("plantations.harvest.totalDescription")}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <label className={styles.field}>
            <span className={styles.label}>{t("plantations.harvest.date")}</span>
            <input className="form-control" type="date" value={form.harvest_date} onChange={(event) => update({ harvest_date: event.target.value })} />
          </label>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="harvest-quantity">{t("plantations.harvest.quantity")}<span className={styles.required}>*</span></label>
            <div className={styles.inputGroup}>
              <input id="harvest-quantity" className={`form-control ${styles.big}`} inputMode="decimal" value={form.quantity} placeholder="0,00" onChange={(event) => updateAndSuggest({ quantity: event.target.value })} />
              <select className={`form-select ${styles.unitSelect}`} aria-label={t("plantations.operation.unit")} value={form.quantity_unit} onChange={(event) => updateAndSuggest({ quantity_unit: event.target.value as QuantityUnit })}>
                {UNITS.map((unit) => <option key={unit} value={unit}>{t(unitKey(unit))}</option>)}
              </select>
            </div>
            {form.quantity_unit !== "kg" && quantityKg > 0 && (
              <span className={styles.hint}>{t("harvestForm.equivalent").replace("{value}", formatNumber(quantityKg, language))}</span>
            )}
          </div>
          {form.quantity_unit !== "kg" && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="harvest-unit-weight">
                {t("harvestForm.unitWeight").replace("{unit}", t(unitKey(form.quantity_unit)).toLowerCase())}<span className={styles.required}>*</span>
              </label>
              <div className={styles.inputGroup}>
                <input id="harvest-unit-weight" className="form-control" inputMode="decimal" value={form.unit_weight_kg} placeholder="0,00" onChange={(event) => updateAndSuggest({ unit_weight_kg: event.target.value })} />
                <span className={styles.suffix}>kg</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.packHeader}>
          <h2 className={styles.cardTitle}><Package size={24} aria-hidden="true" /> {t("harvestForm.pack.title")}</h2>
          <div className={styles.toggle} role="group" aria-label={t("harvestForm.pack.question")}>
            <span>{t("harvestForm.pack.question")}</span>
            <button type="button" className={styles.toggleButton} aria-pressed={form.packaged} onClick={() => updateAndSuggest({ packaged: true })}>
              {form.packaged && <Check size={16} />} {t("harvestForm.pack.yes")}
            </button>
            <button type="button" className={styles.toggleButton} aria-pressed={!form.packaged} onClick={() => update({ packaged: false })}>
              {t("harvestForm.pack.no")}
            </button>
          </div>
        </div>

        {form.packaged && (
          <>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.label}>{t("harvestForm.pack.type")}<span className={styles.required}>*</span></span>
                <select className="form-select" value={form.package_type} onChange={(event) => update({ package_type: event.target.value as PackageType })}>
                  {PACKAGE_TYPES.map((type) => <option key={type} value={type}>{t(packageKey(type))}</option>)}
                </select>
              </label>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="pack-weight">{t("harvestForm.pack.weight")}<span className={styles.required}>*</span></label>
                <div className={styles.inputGroup}>
                  <input id="pack-weight" className="form-control" inputMode="decimal" value={form.package_weight_kg} placeholder="0,00" onChange={(event) => updateAndSuggest({ package_weight_kg: event.target.value })} />
                  <span className={styles.suffix}>kg</span>
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="pack-count">{t("harvestForm.pack.count")}<span className={styles.required}>*</span></label>
                <div className="d-flex align-items-center gap-2">
                  <div className={styles.inputGroup} style={{ flex: 1 }}>
                    <input id="pack-count" className="form-control" inputMode="numeric" value={form.package_count} onChange={(event) => { setCountEdited(true); update({ package_count: event.target.value }); }} />
                    <span className={styles.suffix}>{t("harvestForm.pack.unitShort")}</span>
                  </div>
                  <button type="button" className={styles.linkButton} disabled={!suggestedCount} onClick={() => { setCountEdited(false); update({ package_count: suggestedCount ? String(suggestedCount) : "" }); }}>
                    <RefreshCw size={16} aria-hidden="true" /> {t("harvestForm.pack.recalculate")}
                  </button>
                </div>
                {suggestedCount > 0 && (
                  <span className={styles.hint}>
                    {t("harvestForm.pack.calculated")
                      .replace("{quantity}", formatNumber(quantityKg, language))
                      .replace("{weight}", formatNumber(packageWeight, language))
                      .replace("{count}", formatInteger(suggestedCount, language))}
                  </span>
                )}
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="pack-cost">{t("harvestForm.pack.unitCost")}<span className={styles.required}>*</span></label>
                <div className={styles.inputGroup}>
                  <input id="pack-cost" className="form-control" inputMode="decimal" value={form.package_unit_cost} placeholder="0,00" onChange={(event) => update({ package_unit_cost: event.target.value })} />
                  <span className={styles.suffix}>{t("harvestForm.pack.perPackage")}</span>
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="pack-labor">{t("harvestForm.pack.labor")}<span className={styles.required}>*</span></label>
                <div className={styles.inputGroup}>
                  <input id="pack-labor" className="form-control" inputMode="decimal" value={form.packing_labor_per_package} placeholder="0,00" onChange={(event) => update({ packing_labor_per_package: event.target.value })} />
                  <span className={styles.suffix}>{t("harvestForm.pack.perPackage")}</span>
                </div>
                <span className={styles.hint}>{t("harvestForm.pack.laborHint")}</span>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="pack-other">{t("harvestForm.pack.other")}</label>
                <div className={styles.inputGroup}>
                  <input id="pack-other" className="form-control" inputMode="decimal" value={form.packing_other_costs} placeholder="0,00" onChange={(event) => update({ packing_other_costs: event.target.value })} />
                  <span className={styles.suffix}>R$</span>
                </div>
                <span className={styles.hint}>{t("harvestForm.pack.otherHint")}</span>
              </div>
            </div>

            <div className={styles.costs}>
              <div><span>{t("harvestForm.pack.used")}</span><span>{t("harvestForm.pack.usedValue").replace("{count}", formatInteger(packageCount, language))}</span></div>
              <div>
                <span>{t("harvestForm.pack.packages").replace("{count}", formatInteger(packageCount, language)).replace("{price}", formatMoney(packageUnitCost, language))}</span>
                <span>{formatMoney(packagesCost, language)}</span>
              </div>
              <div><span>{t("harvestForm.pack.laborLine")}</span><span>{formatMoney(laborCost, language)}</span></div>
              <div><span>{t("harvestForm.pack.otherLine")}</span><span>{formatMoney(otherCosts, language)}</span></div>
              <div className={styles.costTotal}><span>{t("harvestForm.pack.total")}</span><span>{formatMoney(packingCost, language)}</span></div>
              <div><span>{t("harvestForm.pack.perKg")}</span><span>{formatMoney(quantityKg > 0 ? packingCost / quantityKg : 0, language)}</span></div>
              <div><span>{t("harvestForm.pack.perPackageLine")}</span><span>{formatMoney(packageCount > 0 ? packingCost / packageCount : 0, language)}</span></div>
            </div>
          </>
        )}

        <label className={`${styles.field} mt-3`}>
          <span className={styles.label}>{t("plantations.harvest.optionalNotes")}</span>
          <textarea className="form-control" rows={2} maxLength={200} value={form.notes} placeholder={t("plantations.harvest.notesPlaceholder")} onChange={(event) => update({ notes: event.target.value })} style={{ resize: "none" }} />
          <span className={styles.hint} style={{ textAlign: "right" }}>{form.notes.length}/200</span>
        </label>
      </section>

      <section className={`${styles.card} ${styles.summary}`} aria-label={t("harvestForm.summary.title")}>
        <div className={styles.summaryTitle}><Layers size={26} aria-hidden="true" /> {t("harvestForm.summary.title")}</div>
        <div className={styles.summaryItem} data-tone="primary"><small>{t("harvestForm.summary.quantity")}</small><strong>{formatNumber(quantityKg, language)} kg</strong></div>
        <div className={styles.summaryItem}><small>{t("harvestForm.summary.packages")}</small><strong>{formatInteger(packageCount, language)} {t("harvestForm.pack.unitShort")}</strong></div>
        <div className={styles.summaryItem} data-tone="primary"><small>{t("harvestForm.summary.packingCost")}</small><strong>{formatMoney(packingCost, language)}</strong></div>
        <div className={styles.summaryItem}><small>{t("harvestForm.summary.perKg")}</small><strong>{formatMoney(quantityKg > 0 ? packingCost / quantityKg : 0, language)}</strong></div>
      </section>

      <div className={styles.actions}>
        <button type="button" className="btn btn-outline-secondary" onClick={() => (editingId ? resetForm() : router.push(`/home/plantacoes/${id}`))}>
          {editingId ? t("plantations.harvest.editCancel") : t("plantations.cancel")}
        </button>
        <button type="button" className="btn btn-success" disabled={saving} onClick={handleSubmit}>
          <Save size={18} aria-hidden="true" />
          {saving ? t("plantations.saving") : editingId ? t("plantations.harvest.update") : t("plantations.harvest.save")}
        </button>
      </div>

      <section className={`${styles.card} ${styles.tableCard}`}>
        <div className={styles.tableHeader}>
          <div>
            <h2 className={styles.cardTitle}><History size={22} aria-hidden="true" /> {t("plantations.harvest.history")}</h2>
            <p>{t("harvestForm.table.records").replace("{count}", String(harvests.length))}</p>
          </div>
          <button type="button" className="btn btn-outline-success d-inline-flex align-items-center gap-2" onClick={handleGeneratePdf} disabled={!harvests.length}>
            <FileText size={17} aria-hidden="true" /> {t("plantations.harvest.generatePdf")}
          </button>
        </div>
        <div className="table-responsive">
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("plantations.operation.date")}</th>
                <th>{t("plantations.operation.type")}</th>
                <th className={styles.num}>{t("plantations.operation.quantity")}</th>
                <th>{t("harvestForm.table.packing")}</th>
                <th className={styles.num}>{t("harvestForm.table.packingCost")}</th>
                <th className={styles.num}>{t("plantations.harvest.revenue")}</th>
                <th className={styles.num}>{t("plantations.operation.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleHarvests.length === 0 ? (
                <tr><td colSpan={7} className={styles.empty}>{t("plantations.harvest.noRecent")}</td></tr>
              ) : (
                visibleHarvests.map((harvest) => (
                  <tr key={harvest.id}>
                    <td>{formatDate(harvest.harvest_date, language)}</td>
                    <td><span className={styles.pill} data-tone={harvest.harvest_type === "total" ? undefined : "neutral"}>{typeLabel(harvest)}</span></td>
                    <td className={styles.num}>
                      <strong>{quantityLabel(harvest)}</strong>
                      {harvest.quantity_unit && harvest.quantity_unit !== "kg" && <span className={styles.sub}>{formatNumber(decimalValue(harvest.yield_kg), language)} kg</span>}
                    </td>
                    <td>
                      {packingLabel(harvest)}
                      {harvest.packaged && harvest.package_weight_kg && <span className={styles.sub}>{formatNumber(decimalValue(harvest.package_weight_kg), language)} kg</span>}
                    </td>
                    <td className={styles.num}>{formatMoney(decimalValue(harvest.packing_cost), language)}</td>
                    <td className={styles.money}>
                      {decimalValue(harvest.revenue_amount) ? formatMoney(decimalValue(harvest.revenue_amount), language) : "—"}
                      {(harvest.buyer_name_display || harvest.buyer_name) && <span className={styles.sub}>{harvest.buyer_name_display || harvest.buyer_name}</span>}
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        <button type="button" className={styles.iconButton} onClick={() => handleEdit(harvest)} title={t("plantations.harvest.edit")} aria-label={t("plantations.harvest.edit")}><Edit3 size={17} /></button>
                        <button type="button" className={styles.iconButton} data-tone="danger" disabled={deletingId === harvest.id} onClick={() => handleDelete(harvest)} title={t("plantations.operation.removeRecord")} aria-label={t("plantations.operation.removeRecord")}><Trash2 size={17} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {visibleHarvests.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={2}>{t("plantations.harvest.totalDisplayed")}</td>
                  <td className={styles.num}>{formatNumber(visibleTotals.kg, language)} kg</td>
                  <td />
                  <td className={styles.num}>{formatMoney(visibleTotals.packing, language)}</td>
                  <td className={styles.money}>{formatMoney(visibleTotals.revenue, language)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {harvests.length > 5 && (
          <div className="p-3">
            <button type="button" className="btn btn-outline-success" onClick={() => setShowAll((current) => !current)}>
              {showAll ? t("plantations.harvest.viewLess") : t("plantations.harvest.viewHistory")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ icon, label, value, helper, tone }: { icon: React.ReactNode; label: string; value: string; helper: string; tone?: "primary" }) {
  return (
    <div className={styles.kpi} data-tone={tone}>
      <div className={styles.kpiIcon} aria-hidden="true">{icon}</div>
      <div style={{ minWidth: 0 }}>
        <small>{label}</small>
        <strong>{value}</strong>
        <span>{helper}</span>
      </div>
    </div>
  );
}
