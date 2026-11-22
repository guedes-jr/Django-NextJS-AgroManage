"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, MapPin, Pencil, Plus, RulerIcon, Search, Trash2, X } from "lucide-react";

import { apiClient } from "@/services/api";
import { farmStructureService, type FarmStructureItemPayload, type FarmStructurePayload } from "@/services/farmStructureService";
import type { Farm, FarmStructure, FarmStructureCategory, FarmStructureItem } from "@/types";
import { LocationPicker } from "@/components/farm/LocationPicker";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useOrganizationLocale } from "@/lib/locale";

import styles from "./StructureDedicatedPage.module.css";
import axios from "axios";
import type { LucideIcon } from "lucide-react";

interface PaginatedFarms { results: Farm[] }
interface StoredUser { role?: string }

export interface StructureDedicatedPageProps {
  category: FarmStructureCategory;
  categoryLabel: string;
  categoryPlural: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  defaultMaterials: string[];
  defaultName: string;
}

const emptyItem: FarmStructureItemPayload = { structure: "", name: "", quantity: "1", unit: "un", value: "" };
const structureTotal = (asset: FarmStructure) => Number(asset.current_value) * asset.quantity + Number(asset.items_value || 0);

const apiMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error) || !error.response?.data) return fallback;
  const first = Object.entries(error.response.data as Record<string, unknown>)[0];
  if (!first) return fallback;
  const detail = Array.isArray(first[1]) ? first[1][0] : first[1];
  return `${first[0] === "detail" ? "" : `${first[0]}: `}${String(detail)}`;
};

const CATEGORY_NAV: Array<{ value: FarmStructureCategory; label: string; icon: string }> = [
  { value: "corral",         label: "Curral",          icon: "🐄" },
  { value: "pigsty",         label: "Chiqueiro",       icon: "🐷" },
  { value: "poultry_house",  label: "Galinheiro",      icon: "🐔" },
  { value: "irrigation",     label: "Irrigação",       icon: "💧" },
  { value: "warehouse",      label: "Depósitos",       icon: "🏚️" },
  { value: "water_reservoir",label: "Reservatório",    icon: "🪣" },
  { value: "facility",       label: "Instalações",     icon: "🏗️" },
  { value: "fence",          label: "Cercas",          icon: "🔒" },
  { value: "other",          label: "Outros",          icon: "⋯" },
];
const CATEGORY_LABEL_KEYS: Record<FarmStructureCategory, string> = {
  corral: "structure.home.corral",
  pigsty: "structure.category.pigsty",
  poultry_house: "structure.category.poultry",
  irrigation: "structure.category.irrigation",
  warehouse: "structure.category.warehouse",
  water_reservoir: "structure.category.reservoir",
  facility: "structure.category.facility",
  fence: "structure.category.fence",
  other: "structure.category.other",
};

const getCategoryPath = (cat: FarmStructureCategory) => {
  const map: Record<FarmStructureCategory, string> = {
    corral: "curral", pigsty: "chiqueiro", poultry_house: "galinheiro",
    warehouse: "armazem", irrigation: "irrigacao", water_reservoir: "reservatorio",
    facility: "instalacao", fence: "cerca", other: "outro",
  };
  return map[cat] || "outro";
};

export function StructureDedicatedPage({
  category, icon: Icon, defaultMaterials, defaultName
}: StructureDedicatedPageProps) {
  const { language, t } = useOrganizationLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmId, setFarmId] = useState("");
  const [structures, setStructures] = useState<FarmStructure[]>([]);
  const [allCategoryCounts, setAllCategoryCounts] = useState<Partial<Record<FarmStructureCategory, number>>>({});

  const emptyForm: FarmStructurePayload = useMemo(() => ({
    farm: farmId, category, name: defaultName, description: "", quantity: 1,
    built_area_m2: null, length_m: null, width_m: null,
    acquisition_value: "0.00", current_value: "0.00", acquisition_date: null,
    is_active: true, notes: "", latitude: null, longitude: null,
    last_maintenance_date: null, next_maintenance_date: null, maintenance_notes: "",
  }), [farmId, category, defaultName]);

  const [form, setForm] = useState<FarmStructurePayload>(emptyForm);
  const [editing, setEditing] = useState<FarmStructure | null>(null);
  const [selected, setSelected] = useState<FarmStructure | null>(null);
  const [structureItem, setStructureItem] = useState<FarmStructureItemPayload>(emptyItem);
  const [showAddItem, setShowAddItem] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [costsOpen, setCostsOpen] = useState(false);
  const [addingItem, setAddingItem] = useState(false);

  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [role] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return (JSON.parse(localStorage.getItem("user") || "{}") as StoredUser).role || ""; } catch { return ""; }
  });
  const canDelete = role === "owner" || role === "admin";
  const categoryLabel = t(CATEGORY_LABEL_KEYS[category] as Parameters<typeof t>[0]);
  const title = categoryLabel;
  const subtitle = t("structure.dedicated.subtitle");
  const formatMoney = (value: string | number) =>
    Number(value || 0).toLocaleString(language, { style: "currency", currency: "BRL" });

  const editStructure = (asset: FarmStructure) => {
    setEditing(asset); setSelected(asset);
    setStructureItem({ ...emptyItem, structure: asset.id });
    setForm({
      farm: asset.farm, category: asset.category, name: asset.name, description: asset.description,
      built_area_m2: asset.built_area_m2, length_m: asset.length_m, width_m: asset.width_m,
      quantity: asset.quantity, acquisition_value: asset.acquisition_value,
      current_value: asset.current_value, acquisition_date: asset.acquisition_date,
      last_maintenance_date: asset.last_maintenance_date, next_maintenance_date: asset.next_maintenance_date,
      maintenance_notes: asset.maintenance_notes,
      is_active: asset.is_active, notes: asset.notes, latitude: asset.latitude, longitude: asset.longitude,
    });
    setFormOpen(true);
  };

  useEffect(() => {
    let active = true;
    apiClient.get<PaginatedFarms>("/farms/", { params: { page_size: 100 } }).then(({ data }) => {
      if (!active) return;
      const list = data.results || [];
      setFarms(list);
      setFarmId(list[0]?.id || "");
      setForm((v) => ({ ...v, farm: list[0]?.id || "" }));
      if (!list.length) setLoading(false);
    }).catch(() => { if (active) { setError(t("structure.dedicated.loadFarmsFailed")); setLoading(false); } });
    return () => { active = false; };
  }, [t]);

  useEffect(() => {
    if (!farmId) return;
    let active = true;
    farmStructureService.list(farmId)
      .then((listResponse) => {
        if (active) {
          const all: FarmStructure[] = listResponse.data.results;
          const counts: Partial<Record<FarmStructureCategory, number>> = {};
          all.forEach((s) => { counts[s.category] = (counts[s.category] || 0) + 1; });
          setAllCategoryCounts(counts);
          const items = all.filter((s) => s.category === category);
          setStructures(items);
          const editId = searchParams?.get("edit");
          if (editId) {
            const itemToEdit = items.find((s) => s.id === editId);
            if (itemToEdit) editStructure(itemToEdit);
          }
        }
      })
      .catch(() => { if (active) setError(t("structure.dedicated.loadCategoryFailed", { category: categoryLabel })); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId, category, categoryLabel, t]);

  const refresh = async () => {
    const listResponse = await farmStructureService.list(farmId);
    const all: FarmStructure[] = listResponse.data.results;
    const counts: Partial<Record<FarmStructureCategory, number>> = {};
    all.forEach((s) => { counts[s.category] = (counts[s.category] || 0) + 1; });
    setAllCategoryCounts(counts);
    const items = all.filter((s) => s.category === category);
    setStructures(items);
    if (selected) setSelected(items.find((a) => a.id === selected.id) || null);
  };

  const reportRows = useMemo(() => structures.flatMap((asset) => [
    { key: `structure-${asset.id}`, kind: "structure" as const, asset, item: null, searchable: `${asset.name} ${asset.description}` },
    ...asset.items.map((material) => ({
      key: `material-${material.id}`, kind: "material" as const, asset, item: material,
      searchable: `material ${material.name} ${asset.name}`,
    })),
  ]), [structures]);

  const filteredReportRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase(language);
    return reportRows.filter((row) => !term || row.searchable.toLocaleLowerCase(language).includes(term));
  }, [reportRows, search, language]);

  const lastRegisteredLocation = useMemo(() => {
    const asset = structures.find((s) => s.latitude && s.longitude);
    if (asset) return { latitude: asset.latitude!, longitude: asset.longitude!, label: asset.name };
    const farm = farms.find((f) => f.id === farmId);
    if (farm?.latitude && farm.longitude) return { latitude: farm.latitude, longitude: farm.longitude, label: farm.name };
    return null;
  }, [structures, farmId, farms]);

  const resetForm = () => {
    setEditing(null); setSelected(null); setForm(emptyForm);
    setStructureItem(emptyItem); setShowAddItem(false);
  };

  const openNew = () => { resetForm(); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setError(""); resetForm(); };

  const openCosts = (asset: FarmStructure) => {
    setSelected(asset);
    setStructureItem({ ...emptyItem, structure: asset.id });
    setShowAddItem(true);
    setError("");
    setCostsOpen(true);
  };
  const closeCosts = () => { setCostsOpen(false); setError(""); setSelected(null); setShowAddItem(false); };
  const editStructureData = () => {
    const asset = selected;
    setCostsOpen(false);
    if (asset) editStructure(asset);
  };

  const saveStructure = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      const payload = { ...form, category };
      const response = editing
        ? await farmStructureService.update(editing.id, payload)
        : await farmStructureService.create(payload);
      await refresh();
      showToast(editing ? t("structure.dedicated.updateSuccess") : t("structure.dedicated.saveSuccess"), "success");
      setFormOpen(false);
      resetForm();
      // New structure: go straight to its cost entries.
      if (!editing) openCosts(response.data);
    } catch (err) {
      const msg = apiMessage(err, t("structure.dedicated.save"));
      setError(msg); showToast(msg, "error");
    } finally { setSaving(false); }
  };

  const addMaterial = async () => {
    if (!selected || addingItem) return;
    if (!structureItem.name.trim()) { setError(t("structure.dedicated.itemNameRequired")); return; }
    setAddingItem(true); setError("");
    try {
      await farmStructureService.addItem({
        ...structureItem,
        name: structureItem.name.trim(),
        quantity: structureItem.quantity || "1",
        value: structureItem.value || "0",
        structure: selected.id,
      });
      setStructureItem({ ...emptyItem, structure: selected.id });
      await refresh();
      showToast(t("structure.dedicated.itemAdded"), "success");
    } catch (err) {
      const msg = apiMessage(err, t("structure.dedicated.addItemFailed"));
      setError(msg); showToast(msg, "error");
    } finally { setAddingItem(false); }
  };

  const removeMaterial = async (item: FarmStructureItem) => {
    if (!confirm(t("structure.dedicated.removeItemConfirm", { name: item.name }))) return;
    try {
      await farmStructureService.removeItem(item.id);
      await refresh();
    } catch { setError(t("structure.dedicated.removeItemFailed")); }
  };

  const removeStructure = async (asset: FarmStructure) => {
    if (!confirm(t("structure.dedicated.deleteConfirm", { name: asset.name }))) return;
    try {
      await farmStructureService.remove(asset.id);
      if (selected?.id === asset.id) { closeForm(); closeCosts(); }
      await refresh();
      showToast(t("structure.dedicated.deleted"), "success");
    } catch { setError(t("structure.dedicated.deleteFailed")); }
  };

  return (
    <div className={styles.page}>
      {/* ── Hero ── */}
      <header className={styles.hero}>
        <div className={styles.heroLeft}>
          <button className="btn btn-link text-white p-0" onClick={() => router.push("/home/estrutura")}>
            <ArrowLeft size={26} />
          </button>
          <Icon size={34} />
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </div>
      </header>

      <main className={styles.content}>
        {/* Farm selector + launch action */}
        <div className={styles.toolbar}>
          <select
            className={`form-select ${styles.farmSelect}`}
            aria-label={t("structure.dedicated.farm")}
            value={farmId}
            onChange={(e) => { setLoading(true); setFarmId(e.target.value); setForm({ ...emptyForm, farm: e.target.value }); }}
          >
            {farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
          </select>
          <button type="button" className={styles.launchBtn} onClick={openNew} disabled={!farmId}>
            <Plus size={18} /> {t("structure.dedicated.launchNew")}
          </button>
        </div>

        {error && !formOpen && !costsOpen && <div className={styles.error}>{error}</div>}

        {/* ── 1. Category nav ── */}
        <p className={styles.stepLabel}>{t("structure.dedicated.stepCategory")}</p>
        <div className={styles.categoryRow}>
          {CATEGORY_NAV.map(({ value, icon }) => (
            <button
              key={value}
              className={`${styles.catCard} ${value === category ? styles.active : ""}`}
              onClick={() => router.push(`/home/estrutura/${getCategoryPath(value)}`)}
            >
              <div className={styles.catIcon}>{icon}</div>
              <h3>{t(CATEGORY_LABEL_KEYS[value] as Parameters<typeof t>[0])}</h3>
              <span>{t((allCategoryCounts[value] ?? 0) === 1 ? "structure.dedicated.countOne" : "structure.home.categoryCount", { count: (allCategoryCounts[value] ?? 0).toLocaleString(language) })}</span>
            </button>
          ))}
        </div>

        {/* ── Launch dialog ── */}
        <Modal
          isOpen={formOpen}
          onClose={closeForm}
          title={`${editing ? t("structure.dedicated.editTitle") : t("structure.dedicated.launchNew")} — ${categoryLabel}`}
          maxWidth="max-w-5xl"
          footer={
            <div className={styles.modalActions}>
              {!editing && <button type="button" className={styles.btnSecondary} onClick={resetForm}>{t("structure.dedicated.clear")}</button>}
              <button type="button" className={styles.btnSecondary} onClick={closeForm}>{t("structure.dedicated.close")}</button>
              <button type="submit" form="structure-launch-form" className={styles.btnPrimary} disabled={saving || !farmId}>
                {saving ? t("structure.dedicated.saving") : editing ? t("structure.dedicated.update") : t("structure.dedicated.save")}
              </button>
            </div>
          }
        >
        <form id="structure-launch-form" onSubmit={saveStructure}>
          <div className={styles.modalBody}>
            {error && <div className={styles.error} role="alert">{error}</div>}

            {/* top field row */}
            <div className="row g-3 mb-4">
              <div className="col-md-4 col-12">
                <label className="form-label fw-semibold small mb-1">{t("structure.dedicated.name")}</label>
                <input
                  required
                  className="form-control"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={t("structure.dedicated.name")}
                />
              </div>
              <div className="col-md-2 col-6">
                <label className="form-label fw-semibold small mb-1">{t("structure.dedicated.quantity")}</label>
                <input
                  required type="number" min={1}
                  className="form-control"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                />
              </div>
              <div className="col-md-3 col-6">
                <label className="form-label fw-semibold small mb-1">{t("structure.dedicated.acquisitionDate")}</label>
                <input
                  type="date"
                  className="form-control"
                  value={form.acquisition_date || ""}
                  onChange={(e) => setForm({ ...form, acquisition_date: e.target.value || null })}
                />
              </div>
              <div className="col-md-3 col-6">
                <label className="form-label fw-semibold small mb-1">{t("structure.dedicated.status")}</label>
                <select
                  className="form-select"
                  value={form.is_active ? "active" : "inactive"}
                  onChange={(e) => setForm({ ...form, is_active: e.target.value === "active" })}
                >
                  <option value="active">{t("structure.dedicated.active")}</option>
                  <option value="inactive">{t("structure.dedicated.inactive")}</option>
                </select>
              </div>
              <div className="col-md-4 col-6">
                <label className="form-label fw-semibold small mb-1">{t("structure.dedicated.paid")}</label>
                <input
                  required type="number" min="0" step="0.01"
                  className="form-control"
                  value={form.acquisition_value}
                  onChange={(e) => setForm({ ...form, acquisition_value: e.target.value })}
                />
              </div>
              <div className="col-md-4 col-6">
                <label className="form-label fw-semibold small mb-1">{t("structure.dedicated.current")}</label>
                <input
                  required type="number" min="0" step="0.01"
                  className="form-control"
                  value={form.current_value}
                  onChange={(e) => setForm({ ...form, current_value: e.target.value })}
                />
              </div>
              <div className="col-md-12">
                <label className="form-label fw-semibold small mb-1">{t("structure.dedicated.description")}</label>
                <input
                  className="form-control"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder={t("structure.dedicated.descriptionPlaceholder")}
                />
              </div>
            </div>

            {/* Location */}
            <div className="mb-4">
              {/* Location panel */}
              <div className={styles.locationPanel}>
                <div className={styles.locationPanelHeader}>
                  <div className={styles.locationPanelTitle}>
                    <span className={styles.locationNum}>1</span>
                    {t("structure.dedicated.location")}
                  </div>
                </div>
                <div className={styles.locationBody}>
                  <p className={styles.locationSubtitle}>{t("structure.dedicated.mapHint")}</p>
                  <LocationPicker
                    latitude={form.latitude}
                    longitude={form.longitude}
                    lastLocation={lastRegisteredLocation}
                    onChange={(latitude, longitude) => setForm((c) => ({ ...c, latitude, longitude }))}
                  />
                  <div className="mt-2">
                    <label className="form-label small text-muted mb-1 d-flex align-items-center gap-1">
                      <MapPin size={12} /> {t("structure.dedicated.coordinates")}
                    </label>
                    <input
                      className="form-control form-control-sm"
                      placeholder="Ex.: -14.742525, -43.524781"
                      value={form.latitude && form.longitude ? `${form.latitude}, ${form.longitude}` : ""}
                      readOnly
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Dimensions */}
            <div className={styles.dimSection}>
              <div className={styles.dimTitle}>
                <span className={styles.dimNum}>2</span>
                <RulerIcon size={14} />
                {t("structure.dedicated.dimensions")}
              </div>
              <div className={styles.dimGrid}>
                <div className={styles.dimField}>
                  <label>{t("structure.dedicated.builtArea")}</label>
                  <input
                    type="number" min="0" step="0.01"
                    placeholder="Ex.: 500,00"
                    value={form.built_area_m2 || ""}
                    onChange={(e) => setForm({ ...form, built_area_m2: e.target.value || null })}
                  />
                </div>
                <div className={styles.dimField}>
                  <label>{t("structure.dedicated.length")}</label>
                  <input
                    type="number" min="0" step="0.01"
                    placeholder="Ex.: 250,00"
                    value={form.length_m || ""}
                    onChange={(e) => setForm({ ...form, length_m: e.target.value || null })}
                  />
                </div>
                <div className={styles.dimField}>
                  <label>{t("structure.dedicated.width")}</label>
                  <input
                    type="number" min="0" step="0.01"
                    placeholder="Ex.: 200,00"
                    value={form.width_m || ""}
                    onChange={(e) => setForm({ ...form, width_m: e.target.value || null })}
                  />
                </div>
              </div>
            </div>

          </div>
        </form>
        </Modal>

        {/* ── Cost entries dialog (pencil) ── */}
        <Modal
          isOpen={costsOpen && !!selected}
          onClose={closeCosts}
          title={`${t("structure.dedicated.costsTitle")} — ${selected?.name ?? ""}`}
          description={categoryLabel}
          maxWidth="max-w-4xl"
          footer={
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={editStructureData}>
                <Pencil size={14} /> {t("structure.dedicated.editData")}
              </button>
              <button type="button" className={styles.btnPrimary} onClick={closeCosts}>{t("structure.dedicated.done")}</button>
            </div>
          }
        >
          {selected && (
            <div className={styles.modalBody}>
              {error && <div className={styles.error} role="alert">{error}</div>}
              <div className={styles.itemsPanel}>
                <div className={styles.itemsPanelHeader}>
                  <h3 className={styles.itemsPanelTitle}>
                    <span className={styles.itemsNum}>1</span>
                    {t("structure.dedicated.itemsServices")}
                  </h3>
                  {!showAddItem && (
                    <button type="button" className={styles.addItemBtn} onClick={() => setShowAddItem(true)}>
                      <Plus size={16} /> {t("structure.dedicated.addItemService")}
                    </button>
                  )}
                </div>
                <div className={styles.itemsScroll}>
                  <table className={styles.itemsTable}>
                    <thead>
                      <tr>
                        <th>{t("structure.dedicated.itemService")}</th>
                        <th>{t("structure.dedicated.quantity")}</th>
                        <th>{t("structure.dedicated.unit")}</th>
                        <th>{t("structure.dedicated.valueBrl")}</th>
                        <th aria-label={t("structure.home.tableActions")} />
                      </tr>
                    </thead>
                    <tbody>
                      {showAddItem && (
                        <tr className={styles.addItemRow}>
                          <td>
                            <input
                              autoFocus
                              aria-label={t("structure.dedicated.itemService")}
                              value={structureItem.name}
                              onChange={(e) => setStructureItem({ ...structureItem, name: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addMaterial(); } }}
                              list="dedicated-materials"
                              placeholder={t("structure.dedicated.itemServiceName")}
                            />
                            <datalist id="dedicated-materials">
                              {defaultMaterials.map((opt) => <option key={opt} value={opt} />)}
                            </datalist>
                          </td>
                          <td>
                            <input
                              aria-label={t("structure.dedicated.quantity")}
                              type="number" min="0.01" step="0.01" inputMode="decimal"
                              value={structureItem.quantity}
                              onChange={(e) => setStructureItem({ ...structureItem, quantity: e.target.value })}
                            />
                          </td>
                          <td>
                            <select aria-label={t("structure.dedicated.unit")} value={structureItem.unit} onChange={(e) => setStructureItem({ ...structureItem, unit: e.target.value })}>
                              <option value="un">un</option>
                              <option value="m">m</option>
                              <option value="m²">m²</option>
                              <option value="m³">m³</option>
                              <option value="kg">kg</option>
                              <option value="L">L</option>
                              <option value="serviço">serviço</option>
                            </select>
                          </td>
                          <td>
                            <input
                              aria-label={t("structure.dedicated.valueBrl")}
                              type="number" min="0" step="0.01" inputMode="decimal"
                              placeholder="0,00"
                              value={structureItem.value}
                              onChange={(e) => setStructureItem({ ...structureItem, value: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addMaterial(); } }}
                            />
                          </td>
                          <td>
                            <div className={styles.addItemActions}>
                              <button type="button" className={styles.confirmItemBtn} onClick={() => void addMaterial()} disabled={addingItem} aria-label={t("structure.dedicated.confirmItem")} title={t("structure.dedicated.confirmItem")}>
                                <Check size={18} />
                              </button>
                              <button type="button" className={styles.cancelItemBtn} onClick={() => { setShowAddItem(false); setStructureItem({ ...emptyItem, structure: selected.id }); }} aria-label={t("structure.dedicated.cancelItem")} title={t("structure.dedicated.cancelItem")}>
                                <X size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {selected.items.length === 0 && !showAddItem && (
                        <tr><td colSpan={5} className={styles.itemsEmpty}>{t("structure.dedicated.noItems")}</td></tr>
                      )}
                      {selected.items.map((item) => (
                        <tr key={item.id}>
                          <td className={styles.itemName}>{item.name}</td>
                          <td className={styles.num}>{Number(item.quantity).toLocaleString(language)}</td>
                          <td>{item.unit}</td>
                          <td className={styles.num}>{Number(item.value).toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td>
                            {canDelete && (
                              <button type="button" className={styles.removeItemBtn} onClick={() => void removeMaterial(item)} aria-label={`${t("structure.dedicated.removeItem")}: ${item.name}`} title={t("structure.dedicated.removeItem")}>
                                <Trash2 size={18} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {selected.items.length > 0 && (
                      <tfoot>
                        <tr>
                          <td colSpan={3}>{t("structure.dedicated.costsTotal")}</td>
                          <td className={styles.num}>{formatMoney(selected.items_value)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
              <div className={styles.costsSummary}>
                <span>{t("structure.dedicated.totalValue")}</span>
                <strong>{formatMoney(structureTotal(selected))}</strong>
                <small>{t("structure.dedicated.totalValueHelp")}</small>
              </div>
            </div>
          )}
        </Modal>

        {/* ── Complete report ── */}
        <div className={styles.reportPanel}>
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
            <p className={styles.reportTitle} style={{ margin: 0 }}>{t("structure.dedicated.report")} — {categoryLabel}</p>
            <div className={styles.search}>
              <Search size={15} />
              <input placeholder={t("structure.dedicated.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="table-responsive">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th>{t("structure.dedicated.type")}</th>
                  <th>{t("structure.dedicated.item")}</th>
                  <th>{t("structure.dedicated.linkedTo")}</th>
                  <th>{t("structure.dedicated.area")}</th>
                  <th>{t("structure.dedicated.quantity")}</th>
                  <th>{t("structure.dedicated.totalValue")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading
                  ? <tr><td colSpan={7} className="text-center py-5"><span className="spinner-border spinner-border-sm text-success" /></td></tr>
                  : filteredReportRows.length
                    ? filteredReportRows.map((row) =>
                        row.kind === "structure"
                          ? <StructureReportRow key={row.key} asset={row.asset} categoryLabel={categoryLabel} canDelete={canDelete} onEdit={openCosts} onRemove={removeStructure} language={language} t={t} />
                          : <MaterialReportRow key={row.key} asset={row.asset} item={row.item!} canDelete={canDelete} onRemove={removeMaterial} language={language} t={t} />
                      )
                    : <tr><td colSpan={7} className="text-center text-muted py-5">{t("structure.dedicated.noRecords")}</td></tr>
                }
              </tbody>
              {!loading && structures.length > 0 && (
                <tfoot>
                  <tr className={styles.reportTotal}>
                    <td colSpan={5}>{t("structure.dedicated.reportTotal")}</td>
                    <td>{formatMoney(structures.reduce((sum, asset) => sum + structureTotal(asset), 0))}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Report rows ─────────────────────────────────────────────────────────────

function StructureReportRow({ asset, categoryLabel, canDelete, onEdit, onRemove, language, t }: {
  asset: FarmStructure; categoryLabel: string; canDelete: boolean;
  onEdit: (a: FarmStructure) => void; onRemove: (a: FarmStructure) => Promise<void>;
  language: string; t: ReturnType<typeof useOrganizationLocale>["t"];
}) {
  return (
    <tr>
      <td><span className="badge bg-success-subtle text-success border border-success-subtle">{categoryLabel}</span></td>
      <td><strong>{asset.name}</strong>{asset.description && <div className="text-muted small">{asset.description}</div>}</td>
      <td>{t("structure.dedicated.mainStructure")}</td>
      <td>{asset.built_area_m2 ? `${asset.built_area_m2} m²` : "—"}</td>
      <td>{asset.quantity}</td>
      <td className="text-success fw-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>{structureTotal(asset).toLocaleString(language, { style: "currency", currency: "BRL" })}</td>
      <td className="text-end">
        <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => onEdit(asset)} title={t("structure.dedicated.costsTitle")} aria-label={`${t("structure.dedicated.costsTitle")}: ${asset.name}`}><Pencil size={14} /></button>
        {canDelete && <button className="btn btn-sm btn-outline-danger" onClick={() => void onRemove(asset)} title={t("structure.home.delete")}><Trash2 size={14} /></button>}
      </td>
    </tr>
  );
}

function MaterialReportRow({ asset, item, canDelete, onRemove, language, t }: {
  asset: FarmStructure; item: FarmStructureItem; canDelete: boolean; onRemove: (item: FarmStructureItem) => Promise<void>;
  language: string; t: ReturnType<typeof useOrganizationLocale>["t"];
}) {
  return (
    <tr className={styles.implementRow}>
      <td><span className="badge bg-secondary-subtle text-secondary border">{t("structure.dedicated.usedItem")}</span></td>
      <td><strong>{item.name}</strong></td>
      <td>{asset.name}</td>
      <td>—</td>
      <td>{Number(item.quantity).toLocaleString(language)} {item.unit}</td>
      <td style={{ fontVariantNumeric: "tabular-nums" }}>{Number(item.value).toLocaleString(language, { style: "currency", currency: "BRL" })}</td>
      <td className="text-end">
        {canDelete && (
          <button className="btn btn-sm btn-outline-danger" onClick={() => void onRemove(item)} title={t("structure.dedicated.removeItem")} aria-label={`${t("structure.dedicated.removeItem")}: ${item.name}`}>
            <Trash2 size={14} />
          </button>
        )}
      </td>
    </tr>
  );
}
