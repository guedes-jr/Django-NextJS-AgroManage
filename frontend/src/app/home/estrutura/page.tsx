"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Beef, Bird, Building2, Calculator, ClipboardList, Droplets, Ellipsis,
  ChevronRight, Info, Pencil, PiggyBank, Search, Trash2, Warehouse,
  Waves, PanelsTopLeft, Tractor, ListChecks, CircleAlert
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { apiClient } from "@/services/api";
import { farmStructureService } from "@/services/farmStructureService";
import type { Farm, FarmStructure, FarmStructureCategory, FarmStructureItem, FarmStructureSummary } from "@/types";
import { useToast } from "@/components/ui/Toast";
import { type TranslationKey, useOrganizationLocale } from "@/lib/locale";

import styles from "./structure.module.css";
import axios from "axios";

interface PaginatedFarms { results: Farm[] }
interface StoredUser { role?: string }

const categories: Array<{
  value: FarmStructureCategory;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  icon: LucideIcon;
}> = [
  { value: "pigsty", labelKey: "structure.category.pigsty", descriptionKey: "structure.category.pigstyDescription", icon: PiggyBank },
  { value: "poultry_house", labelKey: "structure.category.poultry", descriptionKey: "structure.category.poultryDescription", icon: Bird },
  { value: "warehouse", labelKey: "structure.category.warehouse", descriptionKey: "structure.category.warehouseDescription", icon: Warehouse },
  { value: "irrigation", labelKey: "structure.category.irrigation", descriptionKey: "structure.category.irrigationDescription", icon: Droplets },
  { value: "water_reservoir", labelKey: "structure.category.reservoir", descriptionKey: "structure.category.reservoirDescription", icon: Waves },
  { value: "facility", labelKey: "structure.category.facility", descriptionKey: "structure.category.facilityDescription", icon: Building2 },
  { value: "fence", labelKey: "structure.category.fence", descriptionKey: "structure.category.fenceDescription", icon: PanelsTopLeft },
  { value: "other", labelKey: "structure.category.other", descriptionKey: "structure.category.otherDescription", icon: Ellipsis },
];

const apiMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error) || !error.response?.data) return fallback;
  const first = Object.entries(error.response.data as Record<string, unknown>)[0];
  if (!first) return fallback;
  const detail = Array.isArray(first[1]) ? first[1][0] : first[1];
  return `${first[0] === "detail" ? "" : `${first[0]}: `}${String(detail)}`;
};

const getCategoryPath = (cat: FarmStructureCategory) => {
  const map: Record<FarmStructureCategory, string> = {
    corral: "curral", pigsty: "chiqueiro", poultry_house: "galinheiro",
    warehouse: "armazem", irrigation: "irrigacao", water_reservoir: "reservatorio",
    facility: "instalacao", fence: "cerca", other: "outro"
  };
  return map[cat] || "outro";
};

export default function FarmStructurePage() {
  return <Suspense fallback={<StructurePageLoading />}><FarmStructureContent /></Suspense>;
}

function StructurePageLoading() {
  const { t } = useOrganizationLocale();
  return <div className="p-5 text-center text-muted">{t("structure.home.loading")}</div>;
}

function FarmStructureContent() {
  const { language, t } = useOrganizationLocale();
  const searchParams = useSearchParams();
  const requestedFarm = searchParams.get("farm") || "";
  const requestedSearch = searchParams.get("search") || "";
  const router = useRouter();
  const { showToast } = useToast();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmId, setFarmId] = useState("");
  const [items, setItems] = useState<FarmStructure[]>([]);
  const [summary, setSummary] = useState<FarmStructureSummary | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [role] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return (JSON.parse(localStorage.getItem("user") || "{}") as StoredUser).role || ""; }
    catch { return ""; }
  });

  const canDelete = role === "owner" || role === "admin";
  const categoryLabelKeys: Record<FarmStructureCategory, string> = {
    corral: "structure.home.corral",
    pigsty: "structure.category.pigsty",
    poultry_house: "structure.category.poultry",
    warehouse: "structure.category.warehouse",
    irrigation: "structure.category.irrigation",
    water_reservoir: "structure.category.reservoir",
    facility: "structure.category.facility",
    fence: "structure.category.fence",
    other: "structure.category.other",
  };
  const formatMoney = (value: string | number) => Number(value || 0).toLocaleString(language, {
    style: "currency", currency: "BRL",
  });

  const loadStructures = useCallback(async (selectedFarm: string) => {
    if (!selectedFarm) return;
    setLoading(true);
    setError("");
    try {
      const [listResponse, summaryResponse] = await Promise.all([
        farmStructureService.list(selectedFarm), farmStructureService.summary(selectedFarm),
      ]);
      setItems(listResponse.data.results);
      setSummary(summaryResponse.data);
    } catch (requestError) {
      setError(apiMessage(requestError, t("structure.home.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let active = true;
    apiClient.get<PaginatedFarms>("/farms/", { params: { page_size: 100 } })
      .then(({ data }) => {
        if (!active) return;
        setSearch(requestedSearch);
        const available = data.results || [];
        setFarms(available);
        const initialFarmId = available.find(farm => farm.id === requestedFarm)?.id || available[0]?.id || "";
        setFarmId(initialFarmId);
        if (initialFarmId) void loadStructures(initialFarmId);
        else setLoading(false);
      })
      .catch(() => { if (active) { setError(t("structure.home.loadFarmsFailed")); setLoading(false); } });
    return () => { active = false; };
  }, [loadStructures, requestedFarm, requestedSearch, t]);

  const reportRows = useMemo(() => items
    .flatMap((structure) => [
      {
        key: `structure-${structure.id}`,
        kind: "structure" as const,
        structure,
        material: null,
        searchable: `${structure.name} ${structure.description} ${structure.category_label}`,
      },
      ...structure.items.map((material) => ({
        key: `material-${material.id}`,
        kind: "material" as const,
        structure,
        material,
        searchable: `${material.name} ${material.unit} ${structure.name} ${structure.category_label}`,
      })),
    ]), [items]);

  const filteredReportRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase(language);
    return reportRows.filter((row) => !term || row.searchable.toLocaleLowerCase(language).includes(term));
  }, [reportRows, search, language]);

  const openCreate = (category: FarmStructureCategory) => {
    router.push(`/home/estrutura/${getCategoryPath(category)}`);
  };

  const openEdit = (item: FarmStructure) => {
    router.push(`/home/estrutura/${getCategoryPath(item.category)}?edit=${item.id}`);
  };

  const remove = async (item: FarmStructure) => {
    if (!confirm(`${t("structure.home.delete")}: “${item.name}”?`)) return;
    try {
      await farmStructureService.remove(item.id);
      await loadStructures(farmId);
      showToast(t("structure.home.deleted"), "success");
    } catch {
      setError(t("structure.home.deleteFailed"));
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className="d-flex align-items-center gap-3">
          <div className={styles.heroIcon}><Warehouse size={30} /></div>
          <div><h1>{t("structure.home.title")}</h1><p>{t("structure.home.description")}</p></div>
        </div>
      </header>

      <div className={styles.content}>
        <div className={`${styles.infoBar} d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3`}>
          <div className={styles.info}><Info size={21} /><span><strong>{t("structure.home.organize")}</strong><br />{t("structure.home.linked")}</span></div>
          <select className="form-select" style={{ maxWidth: 320 }} value={farmId} onChange={(event) => { const nextFarm = event.target.value; setFarmId(nextFarm); void loadStructures(nextFarm); }}>
            {farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
          </select>
        </div>

        {error && <div className={styles.errorState} role="alert"><CircleAlert size={20} /><span>{error}</span><button onClick={() => void loadStructures(farmId)}>{t("structure.home.retry")}</button></div>}
        {!farms.length && !loading && <div className="alert alert-warning">{t("structure.home.farmsBeforeAdd")}</div>}

        <section className="mb-4"><h2 className={styles.sectionTitle}>{t("structure.home.summaryHeading")}</h2><div className={styles.summaryGrid}>
          <SummaryCard icon={ClipboardList} label={t("structure.home.totalItems")} value={(summary?.total_items || 0).toLocaleString(language)} detail={t("structure.home.recordsCount", { count: (summary?.total_records || 0).toLocaleString(language) })} />
          <SummaryCard icon={Calculator} label={t("structure.home.totalPaid")} value={formatMoney(summary?.acquisition_value || 0)} detail={t("structure.home.acquisitionValue")} />
          <SummaryCard icon={Warehouse} label={t("structure.home.netCurrentValue")} value={formatMoney(summary?.current_value || 0)} detail={t("structure.home.currentStructure")} />
        </div></section>

        <section className={styles.categorySection}>
          <div className={styles.categoryHeading}>
            <div>
              <h2 className={styles.sectionTitle}>{t("structure.home.categoryHeading")}</h2>
              <p>{t("structure.home.categoryDescription")}</p>
            </div>
          </div>
          <div className={styles.categoryGrid}>
            <button className={styles.categoryCard} onClick={() => router.push("/home/estrutura/propriedade")}>
              <div className={styles.categoryMain}><div className={styles.categoryIcon}><Building2 size={34} /></div><div><h3>{t("structure.home.property")}</h3><p>{t("structure.home.propertyDescription")}</p></div></div>
              <div className={styles.categoryFooter}><span>{t("structure.home.openModule")}</span><strong>{t("structure.home.open")} <ChevronRight size={16} /></strong></div>
            </button>
            <button className={styles.categoryCard} onClick={() => router.push("/home/estrutura/maquinas")}>
              <div className={styles.categoryMain}><div className={styles.categoryIcon}><Tractor size={34} /></div><div><h3>{t("structure.home.machines")}</h3><p>{t("structure.home.machinesDescription")}</p></div></div>
              <div className={styles.categoryFooter}><span>{t("structure.home.openModule")}</span><strong>{t("structure.home.open")} <ChevronRight size={16} /></strong></div>
            </button>
            <button className={styles.categoryCard} onClick={() => router.push("/home/estrutura/curral")}>
              <div className={styles.categoryMain}><div className={styles.categoryIcon}><Beef size={34} /></div><div><h3>{t("structure.home.corral")}</h3><p>{t("structure.home.corralDescription")}</p></div></div>
              <div className={styles.categoryFooter}><span>{t("structure.home.openModule")}</span><strong>{t("structure.home.open")} <ChevronRight size={16} /></strong></div>
            </button>
            {categories.map(({ value, labelKey, descriptionKey, icon: Icon }) => (
              <button key={value} className={styles.categoryCard} onClick={() => openCreate(value)}>
                <div className={styles.categoryMain}><div className={styles.categoryIcon}><Icon size={34} /></div><div><h3>{t(labelKey)}</h3><p>{t(descriptionKey)}</p></div></div>
                <div className={styles.categoryFooter}>
                  <span>{t("structure.home.openModule")}</span>
                  <strong>{t("structure.home.open")} <ChevronRight size={16} /></strong>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section id="structure-report" className="mt-4" style={{ order: 4 }}>
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
            <div>
              <h2 className={`${styles.sectionTitle} mb-1`}>{t("structure.home.reportTitle")}</h2>
              <p className="text-muted small mb-0">{t("structure.home.report")}</p>
            </div>
            <div className={styles.search}><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("structure.home.search")} /></div>
          </div>
          <div className={styles.tableCard}>
            <div className="table-responsive"><table className="table align-middle mb-0">
              <thead><tr><th>{t("structure.home.type")}</th><th>{t("structure.home.structureItem")}</th><th>{t("structure.home.linkedTo")}</th><th>{t("structure.home.areaUnit")}</th><th>{t("structure.home.quantity")}</th><th>{t("structure.home.paid")}</th><th>{t("structure.home.current")}</th><th className="text-end">{t("structure.home.tableActions")}</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={8} className="text-center py-5"><span className="spinner-border spinner-border-sm text-success" /></td></tr>
                  : filteredReportRows.length ? filteredReportRows.map((row) => row.kind === "structure"
                    ? <StructureReportRow key={row.key} structure={row.structure} categoryLabel={t(categoryLabelKeys[row.structure.category] as Parameters<typeof t>[0])} canDelete={canDelete} onEdit={openEdit} onRemove={remove} language={language} t={t} />
                    : <MaterialReportRow key={row.key} structure={row.structure} material={row.material!} canDelete={canDelete} onRemoved={() => loadStructures(farmId)} language={language} t={t} />
                  ) : <tr><td colSpan={8} className="text-center text-muted py-5">{t("structure.home.emptyReport")}</td></tr>}
              </tbody>
              {!!items.length && <tfoot><tr className={styles.reportTotal}><td colSpan={4}>{t("structure.home.farmTotal")}</td><td>{t("structure.home.recordsCount", { count: reportRows.length.toLocaleString(language) })}</td><td>{Number(summary?.acquisition_value || 0).toLocaleString(language, { style: "currency", currency: "BRL" })}</td><td>{Number(summary?.current_value || 0).toLocaleString(language, { style: "currency", currency: "BRL" })}</td><td /></tr></tfoot>}
            </table></div>
          </div>
        </section>

        <section className={styles.quickActions} style={{ order: 3 }}>
          <h2 className={styles.sectionTitle}>{t("structure.home.quickActions")}</h2>
          <div>
            <button onClick={() => document.getElementById("structure-report")?.scrollIntoView({ behavior: "smooth" })}><ListChecks size={20} /><span><strong>{t("structure.home.viewAllItems")}</strong><small>{t("structure.home.consolidatedList")}</small></span></button>
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <div className={styles.summaryCard}>
      <Icon size={28} />
      <div className={styles.summaryInfo}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </div>
  );
}

function StructureReportRow({ structure, categoryLabel, canDelete, onEdit, onRemove, language, t }: {
  structure: FarmStructure;
  categoryLabel: string;
  canDelete: boolean;
  onEdit: (item: FarmStructure) => void;
  onRemove: (item: FarmStructure) => Promise<void>;
  language: string;
  t: ReturnType<typeof useOrganizationLocale>["t"];
}) {
  return (
    <tr>
      <td><span className={`badge border ${styles.badge} ${styles.badgeStructure}`}>{categoryLabel}</span></td>
      <td><strong>{structure.name}</strong>{structure.description && <div className="text-muted small text-truncate" style={{ maxWidth: 250 }}>{structure.description}</div>}</td>
      <td>{t("structure.home.structure")}</td>
      <td>{structure.built_area_m2 ? `${structure.built_area_m2} m²` : "—"}</td>
      <td>{structure.quantity}</td>
      <td>{(Number(structure.acquisition_value) * structure.quantity).toLocaleString(language, { style: "currency", currency: "BRL" })}</td>
      <td className="text-success fw-semibold">{(Number(structure.current_value) * structure.quantity).toLocaleString(language, { style: "currency", currency: "BRL" })}</td>
      <td className="text-end">
        <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => onEdit(structure)} title={t("structure.home.edit")}><Pencil size={15} /></button>
        {canDelete && <button className="btn btn-sm btn-outline-danger" onClick={() => void onRemove(structure)} title={t("structure.home.delete")}><Trash2 size={15} /></button>}
      </td>
    </tr>
  );
}

function MaterialReportRow({ structure, material, canDelete, onRemoved, language, t }: {
  structure: FarmStructure;
  material: FarmStructureItem;
  canDelete: boolean;
  onRemoved: () => void;
  language: string;
  t: ReturnType<typeof useOrganizationLocale>["t"];
}) {
  return (
    <tr className={styles.materialRow}>
      <td><span className={`badge border ${styles.badge} ${styles.badgeMaterial}`}>{t("structure.home.material")}</span></td>
      <td><strong>{material.name}</strong></td>
      <td className="text-truncate" style={{ maxWidth: 150 }}>{structure.name}</td>
      <td>—</td>
      <td>{material.quantity} {material.unit}</td>
      <td>{Number(material.value).toLocaleString(language, { style: "currency", currency: "BRL" })}</td>
      <td>—</td>
      <td className="text-end">
        {canDelete && <button className="btn btn-sm text-danger" onClick={() => void farmStructureService.removeItem(material.id).then(onRemoved)} title={t("structure.home.removeItem")}><Trash2 size={15} /></button>}
      </td>
    </tr>
  );
}
