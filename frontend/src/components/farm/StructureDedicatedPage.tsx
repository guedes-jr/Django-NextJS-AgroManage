"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, CalendarDays, ClipboardList, DollarSign, MapPin,
  Maximize2, Pencil, Plus, RulerIcon, Search, Trash2,
} from "lucide-react";

import { apiClient } from "@/services/api";
import { farmStructureService, type FarmStructureItemPayload, type FarmStructurePayload } from "@/services/farmStructureService";
import type { Farm, FarmStructure, FarmStructureCategory, FarmStructureItem, FarmStructureSummary } from "@/types";
import { LocationPicker } from "@/components/farm/LocationPicker";
import { useToast } from "@/components/ui/Toast";

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

const emptyItem: FarmStructureItemPayload = { structure: "", name: "", quantity: "1", unit: "un", value: "0.00" };

const money = (value: string | number) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtArea = (v: string | number | null | undefined) =>
  v ? Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) + " m²" : "—";

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

const getCategoryPath = (cat: FarmStructureCategory) => {
  const map: Record<FarmStructureCategory, string> = {
    corral: "curral", pigsty: "chiqueiro", poultry_house: "galinheiro",
    warehouse: "armazem", irrigation: "irrigacao", water_reservoir: "reservatorio",
    facility: "instalacao", fence: "cerca", other: "outro",
  };
  return map[cat] || "outro";
};

export function StructureDedicatedPage({
  category, categoryLabel, categoryPlural, title, subtitle, icon: Icon, defaultMaterials, defaultName
}: StructureDedicatedPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmId, setFarmId] = useState("");
  const [structures, setStructures] = useState<FarmStructure[]>([]);
  const [summary, setSummary] = useState<FarmStructureSummary | null>(null);
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

  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [role] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return (JSON.parse(localStorage.getItem("user") || "{}") as StoredUser).role || ""; } catch { return ""; }
  });
  const canDelete = role === "owner" || role === "admin";

  useEffect(() => {
    let active = true;
    apiClient.get<PaginatedFarms>("/farms/", { params: { page_size: 100 } }).then(({ data }) => {
      if (!active) return;
      const list = data.results || [];
      setFarms(list);
      setFarmId(list[0]?.id || "");
      setForm((v) => ({ ...v, farm: list[0]?.id || "" }));
      if (!list.length) setLoading(false);
    }).catch(() => { if (active) { setError("Não foi possível carregar as fazendas."); setLoading(false); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!farmId) return;
    let active = true;
    Promise.all([farmStructureService.list(farmId), farmStructureService.summary(farmId)])
      .then(([listResponse, summaryResponse]) => {
        if (active) {
          const all: FarmStructure[] = listResponse.data.results;
          const counts: Partial<Record<FarmStructureCategory, number>> = {};
          all.forEach((s) => { counts[s.category] = (counts[s.category] || 0) + s.items.length; });
          setAllCategoryCounts(counts);
          const items = all.filter((s) => s.category === category);
          setStructures(items);
          setSummary(summaryResponse.data);
          const editId = searchParams?.get("edit");
          if (editId) {
            const itemToEdit = items.find((s) => s.id === editId);
            if (itemToEdit) editStructure(itemToEdit);
          }
        }
      })
      .catch(() => { if (active) setError(`Não foi possível carregar: ${categoryPlural}.`); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId, category]);

  const refresh = async () => {
    const [listResponse, summaryResponse] = await Promise.all([
      farmStructureService.list(farmId),
      farmStructureService.summary(farmId),
    ]);
    const all: FarmStructure[] = listResponse.data.results;
    const counts: Partial<Record<FarmStructureCategory, number>> = {};
    all.forEach((s) => { counts[s.category] = (counts[s.category] || 0) + s.items.length; });
    setAllCategoryCounts(counts);
    const items = all.filter((s) => s.category === category);
    setStructures(items);
    setSummary(summaryResponse.data);
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
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return reportRows.filter((row) => !term || row.searchable.toLocaleLowerCase("pt-BR").includes(term));
  }, [reportRows, search]);

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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveStructure = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      const payload = { ...form, category };
      const response = editing
        ? await farmStructureService.update(editing.id, payload)
        : await farmStructureService.create(payload);
      setEditing(response.data); setSelected(response.data);
      setStructureItem({ ...emptyItem, structure: response.data.id });
      await refresh();
      showToast(editing ? `${categoryLabel} atualizado.` : `${categoryLabel} salvo.`, "success");
    } catch (err) {
      const msg = apiMessage(err, `Não foi possível salvar os dados de ${categoryLabel.toLowerCase()}.`);
      setError(msg); showToast(msg, "error");
    } finally { setSaving(false); }
  };

  const addMaterial = async () => {
    if (!selected) return;
    try {
      await farmStructureService.addItem({ ...structureItem, structure: selected.id });
      setStructureItem({ ...emptyItem, structure: selected.id });
      setShowAddItem(false);
      await refresh();
      showToast("Item adicionado.", "success");
    } catch (err) {
      const msg = apiMessage(err, "Não foi possível adicionar o item.");
      setError(msg); showToast(msg, "error");
    }
  };

  const removeStructure = async (asset: FarmStructure) => {
    if (!confirm(`Excluir: ${asset.name}?`)) return;
    try {
      await farmStructureService.remove(asset.id);
      if (selected?.id === asset.id) resetForm();
      await refresh();
      showToast("Excluído com sucesso.", "success");
    } catch { setError("Não foi possível excluir o item."); }
  };

  // Summary totals
  const totalItems = selected?.items.length || 0;
  const acquisitionDate = selected?.acquisition_date
    ? new Date(selected.acquisition_date).toLocaleDateString("pt-BR")
    : "—";

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
        <button className={styles.heroBtn} onClick={resetForm}>
          <Plus size={16} /> Nova Estrutura
        </button>
      </header>

      <main className={styles.content}>
        {/* Farm selector */}
        <div className={styles.farmRow}>
          <select
            className="form-select"
            style={{ maxWidth: 300 }}
            value={farmId}
            onChange={(e) => { setLoading(true); setFarmId(e.target.value); setForm({ ...emptyForm, farm: e.target.value }); }}
          >
            {farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
          </select>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {/* ── 1. Category nav ── */}
        <p className={styles.stepLabel}>1. Escolha a categoria da estrutura</p>
        <div className={styles.categoryRow}>
          {CATEGORY_NAV.map(({ value, label, icon }) => (
            <button
              key={value}
              className={`${styles.catCard} ${value === category ? styles.active : ""}`}
              onClick={() => router.push(`/home/estrutura/${getCategoryPath(value)}`)}
            >
              <div className={styles.catIcon}>{icon}</div>
              <h3>{label}</h3>
              <span>{allCategoryCounts[value] ?? 0} itens</span>
            </button>
          ))}
        </div>

        {/* ── 2. Launch panel ── */}
        <form onSubmit={saveStructure}>
          <div className={styles.launchPanel}>
            <p className={styles.launchTitle}>
              2. Lançamento da estrutura — {categoryLabel}
            </p>

            {/* top field row */}
            <div className="row g-3 mb-4">
              <div className="col-md-4 col-12">
                <label className="form-label fw-semibold small mb-1">Nome da estrutura *</label>
                <input
                  required
                  className="form-control"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={`Ex.: ${defaultName}`}
                />
              </div>
              <div className="col-md-2 col-6">
                <label className="form-label fw-semibold small mb-1">Quantidade</label>
                <input
                  required type="number" min={1}
                  className="form-control"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                />
              </div>
              <div className="col-md-3 col-6">
                <label className="form-label fw-semibold small mb-1">Data de aquisição</label>
                <input
                  type="date"
                  className="form-control"
                  value={form.acquisition_date || ""}
                  onChange={(e) => setForm({ ...form, acquisition_date: e.target.value || null })}
                />
              </div>
              <div className="col-md-3 col-6">
                <label className="form-label fw-semibold small mb-1">Situação</label>
                <select
                  className="form-select"
                  value={form.is_active ? "active" : "inactive"}
                  onChange={(e) => setForm({ ...form, is_active: e.target.value === "active" })}
                >
                  <option value="active">Ativa</option>
                  <option value="inactive">Inativa</option>
                </select>
              </div>
              <div className="col-md-4 col-6">
                <label className="form-label fw-semibold small mb-1">Valor pago (R$) *</label>
                <input
                  required type="number" min="0" step="0.01"
                  className="form-control"
                  value={form.acquisition_value}
                  onChange={(e) => setForm({ ...form, acquisition_value: e.target.value })}
                />
              </div>
              <div className="col-md-4 col-6">
                <label className="form-label fw-semibold small mb-1">Valor atual (R$) *</label>
                <input
                  required type="number" min="0" step="0.01"
                  className="form-control"
                  value={form.current_value}
                  onChange={(e) => setForm({ ...form, current_value: e.target.value })}
                />
              </div>
              <div className="col-md-12">
                <label className="form-label fw-semibold small mb-1">Descrição</label>
                <input
                  className="form-control"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Observações sobre a estrutura..."
                />
              </div>
            </div>

            {/* Two-column: Items + Map */}
            <div className={styles.twoCol}>
              {/* Items panel */}
              <div className={styles.itemsPanel}>
                <div className={styles.itemsPanelHeader}>
                  <div className={styles.itemsPanelTitle}>
                    <span className={styles.itemsNum}>1</span>
                    Itens Utilizados
                  </div>
                  {selected && (
                    <button type="button" className={styles.addItemBtn} onClick={() => setShowAddItem(!showAddItem)}>
                      <Plus size={14} /> Adicionar item
                    </button>
                  )}
                </div>
                {!selected && (
                  <div className="p-3 text-muted small">
                    Salve a estrutura acima para adicionar itens.
                  </div>
                )}
                {selected && (
                  <table className={styles.itemsTable}>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Quantidade</th>
                        <th>Unidade</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {showAddItem && (
                        <tr className={styles.addItemRow}>
                          <td>
                            <input
                              required
                              value={structureItem.name}
                              onChange={(e) => setStructureItem({ ...structureItem, name: e.target.value })}
                              list="dedicated-materials"
                              placeholder="Nome do item..."
                            />
                            <datalist id="dedicated-materials">
                              {defaultMaterials.map((opt) => <option key={opt} value={opt} />)}
                            </datalist>
                          </td>
                          <td>
                            <input
                              type="number" min="0.01" step="0.01"
                              value={structureItem.quantity}
                              onChange={(e) => setStructureItem({ ...structureItem, quantity: e.target.value })}
                            />
                          </td>
                          <td>
                            <select value={structureItem.unit} onChange={(e) => setStructureItem({ ...structureItem, unit: e.target.value })}>
                              <option value="un">un</option>
                              <option value="m">m</option>
                              <option value="m²">m²</option>
                              <option value="m³">m³</option>
                              <option value="kg">kg</option>
                              <option value="L">L</option>
                              <option value="serviço">serviço</option>
                            </select>
                          </td>
                          <td style={{ display: "flex", gap: 4 }}>
                            <button
                              type="button"
                              className="btn btn-sm btn-success"
                              onClick={() => void addMaterial()}
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => setShowAddItem(false)}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      )}
                      {selected.items.length === 0 && !showAddItem && (
                        <tr>
                          <td colSpan={4} className="text-center text-muted small py-3">
                            Nenhum item adicionado ainda.
                          </td>
                        </tr>
                      )}
                      {selected.items.map((item) => (
                        <tr key={item.id}>
                          <td className="fw-medium">{item.name}</td>
                          <td>{Number(item.quantity).toLocaleString("pt-BR")}</td>
                          <td>{item.unit}</td>
                          <td>
                            {canDelete && (
                              <button
                                type="button"
                                className="btn btn-sm text-danger p-0"
                                onClick={() => void farmStructureService.removeItem(item.id).then(refresh)}
                                title="Remover item"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Location panel */}
              <div className={styles.locationPanel}>
                <div className={styles.locationPanelHeader}>
                  <div className={styles.locationPanelTitle}>
                    <span className={styles.locationNum}>2</span>
                    Localização (opcional)
                  </div>
                </div>
                <div className={styles.locationBody}>
                  <p className={styles.locationSubtitle}>Marque no mapa a localização do sistema</p>
                  <LocationPicker
                    latitude={form.latitude}
                    longitude={form.longitude}
                    lastLocation={lastRegisteredLocation}
                    onChange={(latitude, longitude) => setForm((c) => ({ ...c, latitude, longitude }))}
                  />
                  <div className="mt-2">
                    <label className="form-label small text-muted mb-1 d-flex align-items-center gap-1">
                      <MapPin size={12} /> Coordenadas (opcional)
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
                <span className={styles.dimNum}>3</span>
                <RulerIcon size={14} />
                Dimensões
              </div>
              <div className={styles.dimGrid}>
                <div className={styles.dimField}>
                  <label>Área construída (m²)</label>
                  <input
                    type="number" min="0" step="0.01"
                    placeholder="Ex.: 500,00"
                    value={form.built_area_m2 || ""}
                    onChange={(e) => setForm({ ...form, built_area_m2: e.target.value || null })}
                  />
                </div>
                <div className={styles.dimField}>
                  <label>Comprimento (m)</label>
                  <input
                    type="number" min="0" step="0.01"
                    placeholder="Ex.: 250,00"
                    value={form.length_m || ""}
                    onChange={(e) => setForm({ ...form, length_m: e.target.value || null })}
                  />
                </div>
                <div className={styles.dimField}>
                  <label>Largura (m)</label>
                  <input
                    type="number" min="0" step="0.01"
                    placeholder="Ex.: 200,00"
                    value={form.width_m || ""}
                    onChange={(e) => setForm({ ...form, width_m: e.target.value || null })}
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={resetForm}>Limpar</button>
              <button className={styles.btnPrimary} disabled={saving || !farmId}>
                {saving ? "Salvando..." : editing ? "Atualizar" : "Salvar"}
              </button>
            </div>
          </div>
        </form>

        {/* ── Summary Total ── */}
        <div className={styles.summaryTotal}>
          <p className={styles.summaryTotalTitle}>4. Resumo Total</p>
          <div className={styles.summaryCards}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryCardIcon}><ClipboardList size={20} /></div>
              <div className={styles.summaryCardInfo}>
                <span className={styles.summaryCardLabel}>Total de Itens</span>
                <span className={styles.summaryCardValue}>{totalItems}</span>
                <span className={styles.summaryCardSub}>itens cadastrados</span>
              </div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryCardIcon}><DollarSign size={20} /></div>
              <div className={styles.summaryCardInfo}>
                <span className={styles.summaryCardLabel}>Categoria</span>
                <span className={styles.summaryCardValue}>{categoryLabel}</span>
                <span className={styles.summaryCardSub}>{structures.length} {structures.length === 1 ? "registro" : "registros"} no total</span>
              </div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryCardIcon}><Maximize2 size={20} /></div>
              <div className={styles.summaryCardInfo}>
                <span className={styles.summaryCardLabel}>Área Construída</span>
                <span className={styles.summaryCardValue}>{fmtArea(selected?.built_area_m2)}</span>
              </div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryCardIcon}><CalendarDays size={20} /></div>
              <div className={styles.summaryCardInfo}>
                <span className={styles.summaryCardLabel}>Data de Cadastro</span>
                <span className={styles.summaryCardValue} style={{ fontSize: "1rem" }}>{acquisitionDate}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Complete report ── */}
        <div className={styles.reportPanel}>
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
            <p className={styles.reportTitle} style={{ margin: 0 }}>Relatório completo — {categoryPlural}</p>
            <div className={styles.search}>
              <Search size={15} />
              <input placeholder="Buscar estrutura ou item" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="table-responsive">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Item</th>
                  <th>Vinculado a</th>
                  <th>Área</th>
                  <th>Quantidade</th>
                  <th>Valor pago</th>
                  <th>Valor atual</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading
                  ? <tr><td colSpan={8} className="text-center py-5"><span className="spinner-border spinner-border-sm text-success" /></td></tr>
                  : filteredReportRows.length
                    ? filteredReportRows.map((row) =>
                        row.kind === "structure"
                          ? <StructureReportRow key={row.key} asset={row.asset} categoryLabel={categoryLabel} canDelete={canDelete} onEdit={editStructure} onRemove={removeStructure} />
                          : <MaterialReportRow key={row.key} asset={row.asset} item={row.item!} canDelete={canDelete} onRemoved={refresh} />
                      )
                    : <tr><td colSpan={8} className="text-center text-muted py-5">Nenhum registro encontrado.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Report rows ─────────────────────────────────────────────────────────────

function StructureReportRow({ asset, categoryLabel, canDelete, onEdit, onRemove }: {
  asset: FarmStructure; categoryLabel: string; canDelete: boolean;
  onEdit: (a: FarmStructure) => void; onRemove: (a: FarmStructure) => Promise<void>;
}) {
  return (
    <tr>
      <td><span className="badge bg-success-subtle text-success border border-success-subtle">{categoryLabel}</span></td>
      <td><strong>{asset.name}</strong>{asset.description && <div className="text-muted small">{asset.description}</div>}</td>
      <td>Estrutura principal</td>
      <td>{asset.built_area_m2 ? `${asset.built_area_m2} m²` : "—"}</td>
      <td>{asset.quantity}</td>
      <td>{money(Number(asset.acquisition_value) * asset.quantity)}</td>
      <td className="text-success fw-semibold">{money(Number(asset.current_value) * asset.quantity)}</td>
      <td className="text-end">
        <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => onEdit(asset)} title="Editar"><Pencil size={14} /></button>
        {canDelete && <button className="btn btn-sm btn-outline-danger" onClick={() => void onRemove(asset)} title="Excluir"><Trash2 size={14} /></button>}
      </td>
    </tr>
  );
}

function MaterialReportRow({ asset, item, canDelete, onRemoved }: {
  asset: FarmStructure; item: FarmStructureItem; canDelete: boolean; onRemoved: () => Promise<void>;
}) {
  return (
    <tr className={styles.implementRow}>
      <td><span className="badge bg-secondary-subtle text-secondary border">Item utilizado</span></td>
      <td><strong>{item.name}</strong></td>
      <td>{asset.name}</td>
      <td>—</td>
      <td>{item.quantity} {item.unit}</td>
      <td>{money(item.value)}</td>
      <td>—</td>
      <td className="text-end">
        {canDelete && (
          <button className="btn btn-sm btn-outline-danger" onClick={() => void farmStructureService.removeItem(item.id).then(onRemoved)} title="Excluir item">
            <Trash2 size={14} />
          </button>
        )}
      </td>
    </tr>
  );
}
