"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  FileText,
  FlaskConical,
  History,
  Plus,
  Save,
  Trash2,
  UploadCloud,
  Edit3,
} from "lucide-react";
import apiClient from "@/services/api";
import styles from "./products-table.module.css";
import { cropService } from "@/services/cropService";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { useOrganizationLocale, type TranslationKey } from "@/lib/locale";

type Plantation = {
  id: string;
  name?: string;
  crop_name: string;
  field_name?: string;
  farm_name?: string;
  planted_area_ha?: string | number | null;
};

type InventoryItem = {
  id: string;
  nome: string;
  categoria?: string;
  categoria_display?: string;
  especie_animal?: string;
  unidade_medida?: string;
  estoque_atual?: string | number;
};

type SoilAnalysis = {
  id: string;
  original_name: string;
  file_url: string;
  uploaded_by_name?: string | null;
  created_at: string;
};

type RecommendationProduct = {
  item: string;
  item_search: string;
  category: string;
  item_name?: string;
  dose_per_ha: string;
  dose_unit: string;
  total_quantity: string;
  total_unit: string;
  notes: string;
};

type Recommendation = {
  id: string;
  title: string;
  objective?: string;
  recommendation_date: string;
  suggested_application_date?: string | null;
  priority: "low" | "medium" | "high";
  priority_display?: string;
  status: "pending" | "in_progress" | "completed";
  status_display?: string;
  area_ha?: string | number | null;
  products?: Array<RecommendationProduct & { id?: string }>;
};

const emptyProduct: RecommendationProduct = {
  item: "",
  item_search: "",
  category: "",
  dose_per_ha: "",
  dose_unit: "l_ha",
  total_quantity: "",
  total_unit: "l",
  notes: "",
};

const priorityOptions = ["low", "medium", "high"] as const;

const statusOptions = ["pending", "in_progress", "completed"] as const;

const doseUnitOptions = [
  { value: "l_ha", label: "L/ha" },
  { value: "ml_ha", label: "mL/ha" },
  { value: "kg_ha", label: "kg/ha" },
  { value: "g_ha", label: "g/ha" },
];

const agriculturalCategoryOptions = ["semente", "fertilizante", "fertirrigacao", "corretivo", "defensivo", "material", "outro"] as const;

const agriculturalCategoryValues = [...agriculturalCategoryOptions, "foliar"];

const statusVariant = (status: Recommendation["status"]) => {
  if (status === "completed") return { background: "#dcfce7", color: "#166534", border: "1px solid #86efac" };
  if (status === "in_progress") return { background: "#dbeafe", color: "#1d4ed8", border: "1px solid #93c5fd" };
  return { background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" };
};

const formatDate = (value: string | null | undefined, language: string) => {
  if (!value) return "-";
  return new Date(`${value}T12:00:00`).toLocaleDateString(language);
};

const today = () => new Date().toISOString().split("T")[0];

const totalUnitByDoseUnit: Record<string, string> = {
  l_ha: "l",
  ml_ha: "ml",
  kg_ha: "kg",
  g_ha: "g",
};

const parseDecimal = (value?: string | number | null) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const formatDecimal = (value: number, language: string) => {
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function AgronomoPage() {
  const { language, t } = useOrganizationLocale();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [plantation, setPlantation] = useState<Plantation | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [soilAnalyses, setSoilAnalyses] = useState<SoilAnalysis[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingRecommendationId, setEditingRecommendationId] = useState<string | null>(null);
  const [deletingRecommendationId, setDeletingRecommendationId] = useState<string | null>(null);
  const [deletingSoilAnalysisId, setDeletingSoilAnalysisId] = useState<string | null>(null);
  const [completingRecommendationId, setCompletingRecommendationId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    objective: "",
    recommendation_date: today(),
    suggested_application_date: "",
    priority: "medium",
    status: "pending",
  });
  const [products, setProducts] = useState<RecommendationProduct[]>([{ ...emptyProduct }]);

  const agriculturalItems = useMemo(() => {
    return inventoryItems.filter((item) =>
      agriculturalCategoryValues.includes(item.categoria || "") &&
      (parseDecimal(item.estoque_atual) || 0) > 0
    );
  }, [inventoryItems]);
  const recommendationAreaHa = useMemo(
    () => parseDecimal(plantation?.planted_area_ha),
    [plantation?.planted_area_ha],
  );
  const activeRecommendations = useMemo(
    () => recommendations.filter((recommendation) => recommendation.status !== "completed"),
    [recommendations],
  );
  const completedRecommendations = useMemo(
    () => recommendations.filter((recommendation) => recommendation.status === "completed"),
    [recommendations],
  );
  const recentRecommendations = useMemo(() => {
    return [...recommendations]
      .sort((a, b) => {
        const dateA = new Date(a.recommendation_date || "1970-01-01").getTime();
        const dateB = new Date(b.recommendation_date || "1970-01-01").getTime();
        return dateB - dateA;
      })
      .slice(0, 4);
  }, [recommendations]);

  const calculateTotalQuantity = (product: RecommendationProduct) => {
    const dose = parseDecimal(product.dose_per_ha);
    if (dose === null || recommendationAreaHa === null) return "";
    return formatDecimal(dose * recommendationAreaHa, language);
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const [plantationRes, itemsRes, soilRes, recommendationsRes] = await Promise.all([
          cropService.get(id),
          apiClient.get("/inventory/items/all_items/").catch(() => ({ data: [] })),
          apiClient.get("/crops/soil-analyses/", { params: { plantation: id } }).catch(() => ({ data: { results: [] } })),
          apiClient.get("/crops/agronomist-recommendations/", { params: { plantation: id } }).catch(() => ({ data: { results: [] } })),
        ]);
        setPlantation(plantationRes.data);
        setInventoryItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
        setSoilAnalyses(Array.isArray(soilRes.data?.results) ? soilRes.data.results : []);
        setRecommendations(Array.isArray(recommendationsRes.data?.results) ? recommendationsRes.data.results : []);
      } catch (error) {
        console.error("Failed to load agronomist area", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const updateProduct = (index: number, patch: Partial<RecommendationProduct>) => {
    setProducts((prev) => prev.map((product, productIndex) => {
      if (productIndex !== index) return product;
      return { ...product, ...patch };
    }));
  };

  const getProductSuggestions = (product: RecommendationProduct) => {
    const search = product.item_search.trim().toLowerCase();
    return agriculturalItems
      .filter((item) =>
        !product.category ||
        item.categoria === product.category ||
        (product.category === "defensivo" && item.categoria === "foliar")
      )
      .filter((item) => {
        if (!search) return true;
        const text = `${item.nome} ${item.categoria_display || item.categoria || ""}`.toLowerCase();
        return text.includes(search);
      })
      .slice(0, 8);
  };

  const selectProductItem = (index: number, item: InventoryItem) => {
    const doseUnit = item.unidade_medida === "kg" ? "kg_ha" : item.unidade_medida === "g" ? "g_ha" : item.unidade_medida === "ml" ? "ml_ha" : "l_ha";
    updateProduct(index, {
      item: item.id,
      item_search: item.nome,
      category: item.categoria || "",
      dose_unit: doseUnit,
      total_unit: totalUnitByDoseUnit[doseUnit] || item.unidade_medida || "",
    });
  };

  const handleProductSearchChange = (index: number, value: string) => {
    const normalized = value.trim().toLowerCase();
    const currentProduct = products[index];
    const matchingItem = agriculturalItems.find((item) => {
      const sameCategory =
        !currentProduct.category ||
        item.categoria === currentProduct.category ||
        (currentProduct.category === "defensivo" && item.categoria === "foliar");
      return sameCategory && item.nome.trim().toLowerCase() === normalized;
    });

    if (matchingItem) {
      selectProductItem(index, matchingItem);
      return;
    }

    updateProduct(index, { item_search: value, item: "" });
  };

  const handleUpload = async (file: File | null) => {
    if (!file || !id) return;
    try {
      setUploading(true);
      const data = new FormData();
      data.append("plantation", id);
      data.append("file", file);
      const response = await apiClient.post("/crops/soil-analyses/", data);
      setSoilAnalyses((prev) => [response.data, ...prev]);
    } catch (error) {
      console.error("Failed to upload soil analysis", error);
      alert(t("plantations.agronomist.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const handleEditRecommendation = (rec: Recommendation) => {
    setEditingRecommendationId(rec.id);
    setForm({
      title: rec.title,
      objective: rec.objective || "",
      recommendation_date: rec.recommendation_date,
      suggested_application_date: rec.suggested_application_date || "",
      priority: rec.priority,
      status: rec.status,
    });
    if (rec.products && rec.products.length > 0) {
      setProducts(
        rec.products.map((p) => {
          const invItem = inventoryItems.find((i) => String(i.id) === String(p.item));
          return {
            item: p.item,
            item_search: invItem?.nome || p.item_name || "",
            category: invItem?.categoria || p.category || "",
            dose_per_ha: p.dose_per_ha || "",
            dose_unit: p.dose_unit || "l_ha",
            total_quantity: p.total_quantity || "",
            total_unit: p.total_unit || "l",
            notes: p.notes || "",
          };
        })
      );
    } else {
      setProducts([{ ...emptyProduct }]);
    }
    document.getElementById("nova-recomendacao")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleDeleteRecommendation = async (id: string) => {
    if (!window.confirm(t("plantations.agronomist.deleteConfirm"))) return;
    try {
      setDeletingRecommendationId(id);
      await cropService.deleteAgronomistRecommendation(id);
      setRecommendations((prev) => prev.filter((r) => r.id !== id));
      if (editingRecommendationId === id) {
        setEditingRecommendationId(null);
        setForm({
          title: "",
          objective: "",
          recommendation_date: today(),
          suggested_application_date: "",
          priority: "medium",
          status: "pending",
        });
        setProducts([{ ...emptyProduct }]);
      }
    } catch (error) {
      console.error("Failed to delete recommendation", error);
      alert(t("plantations.agronomist.deleteFailed"));
    } finally {
      setDeletingRecommendationId(null);
    }
  };

  const handleDeleteSoilAnalysis = async (id: string) => {
    if (!window.confirm(t("plantations.agronomist.deleteAnalysisConfirm"))) return;
    try {
      setDeletingSoilAnalysisId(id);
      await cropService.deleteSoilAnalysis(id);
      setSoilAnalyses((prev) => prev.filter((a) => a.id !== id));
    } catch (error) {
      console.error("Failed to delete soil analysis", error);
      alert(t("plantations.agronomist.deleteAnalysisFailed"));
    } finally {
      setDeletingSoilAnalysisId(null);
    }
  };

  const handleSaveRecommendation = async () => {
    if (!id || !form.title.trim()) return;
    const unresolvedProduct = products.find((product) => product.item_search.trim() && !product.item);
    if (unresolvedProduct) {
      alert(t("plantations.agronomist.selectSuggestion"));
      return;
    }
    const validProducts = products.filter((product) => product.item);
    try {
      setSaving(true);
      const payload = {
        plantation: id,
        title: form.title,
        objective: form.objective,
        recommendation_date: form.recommendation_date,
        suggested_application_date: form.suggested_application_date || null,
        priority: form.priority,
        status: form.status,
        products: validProducts.map((product) => ({
          item: product.item,
          dose_per_ha: product.dose_per_ha || null,
          dose_unit: product.dose_unit,
          total_quantity: calculateTotalQuantity(product) || null,
          total_unit: totalUnitByDoseUnit[product.dose_unit] || product.total_unit,
          notes: product.notes,
        })),
      };
      if (editingRecommendationId) {
        const response = await cropService.updateAgronomistRecommendation(editingRecommendationId, payload);
        const updated = response.data as Recommendation;
        setRecommendations((prev) => prev.map((r) => r.id === updated.id ? updated : r));
        setEditingRecommendationId(null);
      } else {
        const response = await apiClient.post("/crops/agronomist-recommendations/", payload);
        setRecommendations((prev) => [response.data, ...prev]);
      }
      
      setForm({
        title: "",
        objective: "",
        recommendation_date: today(),
        suggested_application_date: "",
        priority: "medium",
        status: "pending",
      });
      setProducts([{ ...emptyProduct }]);
    } catch (error) {
      console.error("Failed to save recommendation", error);
      alert(t("plantations.agronomist.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteRecommendation = async (recommendationId: string) => {
    try {
      setCompletingRecommendationId(recommendationId);
      const response = await apiClient.patch(`/crops/agronomist-recommendations/${recommendationId}/`, { status: "completed" });
      const updated = response.data as Recommendation;
      setRecommendations((prev) => prev.map((recommendation) => recommendation.id === recommendationId ? updated : recommendation));
    } catch (error) {
      console.error("Failed to complete recommendation", error);
      alert(t("plantations.agronomist.completeFailed"));
    } finally {
      setCompletingRecommendationId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <Skeleton height="48px" width="340px" className="mb-4" />
        <div className="row g-4">
          <div className="col-lg-5"><Skeleton height="360px" /></div>
          <div className="col-lg-7"><Skeleton height="360px" /></div>
          <div className="col-12"><Skeleton height="420px" /></div>
        </div>
      </div>
    );
  }

  if (!plantation) {
    return <div className="p-4 text-muted">{t("plantations.notFound")}</div>;
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap mb-4">
        <div className="d-flex align-items-center gap-3">

          <div>
            <h1 className="fw-black mb-1 d-flex align-items-center gap-2" style={{ fontSize: "1.75rem" }}>
              <FlaskConical size={28} className="text-success" /> {t("plantations.agronomist.title")}
            </h1>
            <p className="text-muted mb-0 small">
              {plantation.name || plantation.crop_name} › {plantation.field_name || t("plantations.field")}
            </p>
          </div>
        </div>
        <Button variant="outline-secondary" onClick={() => router.push(`/home/plantacoes/${id}`)}>
          {t("plantations.back")}
        </Button>
      </div>

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="dashboard-card p-4 h-100">
            <h6 className="fw-bold mb-1 d-flex align-items-center gap-2"><FlaskConical size={18} /> {t("plantations.agronomist.soilAnalysis")}</h6>
            <p className="text-muted small mb-4">{t("plantations.agronomist.soilDescription")}</p>

            <label
              className="border rounded d-flex flex-column align-items-center justify-content-center text-center p-4 mb-4"
              style={{ minHeight: 180, cursor: "pointer", background: "var(--bs-tertiary-bg, #f8f9fa)" }}
            >
              <UploadCloud size={42} className="text-success mb-2" />
              <strong>{uploading ? t("plantations.agronomist.uploading") : t("plantations.agronomist.attach")}</strong>
              <span className="text-muted small mt-2">{t("plantations.agronomist.fileTypes")}</span>
              <input
                className="d-none"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                disabled={uploading}
                onChange={(event) => handleUpload(event.target.files?.[0] || null)}
              />
            </label>

            <h6 className="fw-bold small mb-3">{t("plantations.agronomist.attached")}</h6>
            {soilAnalyses.length === 0 ? (
              <p className="text-muted small mb-0">{t("plantations.agronomist.noAnalysis")}</p>
            ) : (
              <div className="d-flex flex-column gap-2">
                {soilAnalyses.map((analysis) => (
                  <div key={analysis.id} className="border rounded p-3 d-flex align-items-center gap-3">
                    <FileText size={30} className="text-danger flex-shrink-0" />
                    <div className="flex-grow-1 min-w-0">
                      <div className="fw-semibold text-truncate">{analysis.original_name || t("plantations.agronomist.soilAnalysis")}</div>
                      <div className="text-muted small">
                        {t("plantations.agronomist.attachDate")} {new Date(analysis.created_at).toLocaleDateString(language)}
                        {analysis.uploaded_by_name ? ` ${t("plantations.agronomist.uploadedBy")} ${analysis.uploaded_by_name}` : ""}
                      </div>
                    </div>
                    <Button variant="outline-secondary" size="sm" onClick={() => window.open(analysis.file_url, "_blank")} title={t("plantations.agronomist.view")}>
                      <Eye size={16} />
                    </Button>
                    <a className="btn btn-outline-secondary btn-sm" href={analysis.file_url} download title={t("plantations.agronomist.download")}>
                      <Download size={16} />
                    </a>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      disabled={deletingSoilAnalysisId === analysis.id}
                      onClick={() => handleDeleteSoilAnalysis(analysis.id)}
                      title={t("plantations.agronomist.delete")}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="col-lg-7">
          <div className="dashboard-card p-4 h-100">
            <div className="d-flex align-items-center justify-content-between gap-2 mb-4">
              <div>
                <h6 className="fw-bold mb-1 d-flex align-items-center gap-2"><ClipboardList size={18} /> {t("plantations.agronomist.active")}</h6>
                <p className="text-muted small mb-0">{t("plantations.agronomist.activeDescription")}</p>
              </div>
              <Button variant="agro" size="sm" onClick={() => document.getElementById("nova-recomendacao")?.scrollIntoView({ behavior: "smooth" })}>
                <Plus size={16} /> {t("plantations.agronomist.new")}
              </Button>
            </div>

            {activeRecommendations.length === 0 ? (
              <p className="text-muted small mb-0">{t("plantations.agronomist.noneActive")}</p>
            ) : (
              <div className="d-flex flex-column gap-3">
                {activeRecommendations.slice(0, 5).map((recommendation, index) => (
                  <div key={recommendation.id} className="border rounded p-3">
                    <div className="d-flex align-items-start justify-content-between gap-2">
                      <div className="d-flex align-items-center gap-3 flex-wrap">
                        <Badge style={{ background: "#047857", color: "#fff" }}>#{String(activeRecommendations.length - index).padStart(2, "0")}</Badge>
                        <span className="small">{formatDate(recommendation.recommendation_date, language)}</span>
                        <span className="small">{t("plantations.agronomist.suggestedApplication")} {formatDate(recommendation.suggested_application_date, language)}</span>
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <Badge style={statusVariant(recommendation.status)}>{t(`plantations.agronomist.status${recommendation.status === "in_progress" ? "InProgress" : recommendation.status === "completed" ? "Completed" : "Pending"}` as TranslationKey)}</Badge>
                        <Button
                          variant="outline-success"
                          size="sm"
                          disabled={completingRecommendationId === recommendation.id}
                          onClick={() => handleCompleteRecommendation(recommendation.id)}
                        >
                          <CheckCircle2 size={15} />
                          {completingRecommendationId === recommendation.id ? t("plantations.agronomist.completing") : t("plantations.agronomist.done")}
                        </Button>
                        <Button variant="outline-secondary" size="sm" onClick={() => handleEditRecommendation(recommendation)} title={t("plantations.agronomist.edit")}>
                          <Edit3 size={15} />
                        </Button>
                        <Button 
                          variant="outline-danger" 
                          size="sm" 
                          disabled={deletingRecommendationId === recommendation.id}
                          onClick={() => handleDeleteRecommendation(recommendation.id)} 
                          title={t("plantations.agronomist.delete")}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </div>
                    <div className="fw-bold mt-2">{recommendation.title}</div>
                    <div className="d-flex gap-4 text-muted small mt-2 flex-wrap">
                      <span>{t("plantations.agronomist.productsCount").replace("{count}", String(recommendation.products?.length || 0))}</span>
                      <span>{t("plantations.agronomist.area").replace("{area}", String(recommendation.area_ha || plantation.planted_area_ha || "-"))}</span>
                      <span>{t("plantations.agronomist.priority")} {t(`plantations.agronomist.priority${recommendation.priority === "medium" ? "Medium" : recommendation.priority === "high" ? "High" : "Low"}` as TranslationKey)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="col-12">
          <div className="dashboard-card p-4 mb-4">
            <div className="d-flex align-items-start justify-content-between gap-2 mb-3 flex-wrap">
              <div>
                <h6 className="fw-bold mb-1 d-flex align-items-center gap-2"><History size={18} /> {t("plantations.agronomist.historyRecent")}</h6>
                <p className="text-muted small mb-0">{t("plantations.agronomist.historyDescription")}</p>
              </div>
              <Button variant="outline-secondary" size="sm" onClick={() => router.push(`/home/plantacoes/${id}/historico`)}>

                {t("plantations.labor.fullReport")}
              </Button>
            </div>

            {recentRecommendations.length === 0 ? (
              <p className="text-muted small mb-0">{t("plantations.agronomist.noneRecent")}</p>
            ) : (
              <div className="d-flex flex-column gap-2">
                {recentRecommendations.map((recommendation) => (
                  <div key={recommendation.id} className="border rounded p-3 d-flex align-items-center justify-content-between gap-3 flex-wrap">
                    <div>
                      <div className="fw-semibold">{recommendation.title}</div>
                      <div className="text-muted small">
                        {formatDate(recommendation.recommendation_date, language)} • {recommendation.status_display || recommendation.status}
                      </div>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <Badge style={statusVariant(recommendation.status)}>{recommendation.status_display || recommendation.status}</Badge>
                      <Button variant="outline-secondary" size="sm" onClick={() => handleEditRecommendation(recommendation)} title={t("profile.edit")}>
                        <Edit3 size={15} />
                      </Button>
                      <Button 
                        variant="outline-danger" 
                        size="sm" 
                        disabled={deletingRecommendationId === recommendation.id}
                        onClick={() => handleDeleteRecommendation(recommendation.id)} 
                        title={t("plantations.agronomist.delete")}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="col-12">
          <div className="dashboard-card p-4">
            <h6 className="fw-bold mb-1 d-flex align-items-center gap-2"><ClipboardList size={18} /> {t("plantations.agronomist.historyCompleted")}</h6>
            <p className="text-muted small mb-4">{t("plantations.agronomist.completedDescription")}</p>

            {completedRecommendations.length === 0 ? (
              <p className="text-muted small mb-0">{t("plantations.agronomist.noneCompleted")}</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0 agro-table">
                  <thead>
                    <tr>
                      <th>{t("plantations.agronomist.recommendation")}</th>
                      <th>{t("plantations.agronomist.applicationDate")}</th>
                      <th>{t("plantations.agronomist.products")}</th>
                      <th>{t("plantations.agronomist.priority").replace(":", "")}</th>
                      <th>{t("plantations.agronomist.status")}</th>
                      <th className="text-end">{t("plantations.agronomist.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedRecommendations.map((recommendation) => (
                      <tr key={recommendation.id}>
                        <td>
                          <div className="fw-bold">{recommendation.title}</div>
                          {recommendation.objective ? <div className="text-muted small">{recommendation.objective}</div> : null}
                        </td>
                        <td>{formatDate(recommendation.suggested_application_date, language)}</td>
                        <td>{recommendation.products?.length || 0}  {t("inventory.products.oneItem")}{(recommendation.products?.length || 0) === 1 ? "" : "s"}</td>
                        <td>{recommendation.priority_display || recommendation.priority}</td>
                        <td><Badge style={statusVariant(recommendation.status)}>{recommendation.status_display || t("plantations.agronomist.statusCompleted")}</Badge></td>
                        <td className="text-end">
                          <div className="d-flex justify-content-end gap-2">
                            <Button variant="outline-secondary" size="sm" onClick={() => handleEditRecommendation(recommendation)} title={t("profile.edit")}>
                              <Edit3 size={15} />
                            </Button>
                            <Button 
                              variant="outline-danger" 
                              size="sm" 
                              disabled={deletingRecommendationId === recommendation.id}
                              onClick={() => handleDeleteRecommendation(recommendation.id)} 
                              title={t("plantations.agronomist.delete")}
                            >
                              <Trash2 size={15} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="col-12" id="nova-recomendacao">
          <div className="dashboard-card p-4">
            <h6 className="fw-bold mb-1 d-flex align-items-center gap-2">
              <ClipboardList size={18} /> {editingRecommendationId ? "Editar recomendação" : t("plantations.agronomist.new")}
            </h6>
            <p className="text-muted small mb-4">{t("plantations.agronomist.formDescription")}</p>

            <div className="row g-3 mb-4">
              <div className="col-lg-6">
                <label className="form-label small fw-medium">{t("plantations.agronomist.titleLabel")}</label>
                <input className="form-control" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("plantations.agronomist.titlePlaceholder")} />
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">{t("plantations.agronomist.recommendationDate")}</label>
                <input className="form-control" type="date" value={form.recommendation_date} onChange={(e) => setForm({ ...form, recommendation_date: e.target.value })} />
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">{t("plantations.agronomist.applicationDate")}</label>
                <input className="form-control" type="date" value={form.suggested_application_date} onChange={(e) => setForm({ ...form, suggested_application_date: e.target.value })} />
              </div>
              <div className="col-lg-6">
                <label className="form-label small fw-medium">{t("plantations.agronomist.objective")}</label>
                <textarea className="form-control" rows={2} maxLength={300} value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} placeholder={t("plantations.agronomist.objectivePlaceholder")} />
                <div className="text-end text-muted small">{form.objective.length}/300</div>
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">{t("plantations.agronomist.priority").replace(":", "")}</label>
                <select className="form-select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {priorityOptions.map((option) => <option key={option} value={option}>{t(`plantations.agronomist.priority${option === "medium" ? "Medium" : option === "high" ? "High" : "Low"}` as TranslationKey)}</option>)}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">{t("plantations.agronomist.status")}</label>
                <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {statusOptions.map((option) => <option key={option} value={option}>{t(`plantations.agronomist.status${option === "in_progress" ? "InProgress" : option === "completed" ? "Completed" : "Pending"}` as TranslationKey)}</option>)}
                </select>
              </div>
            </div>

            <h6 className="fw-bold text-success mb-1">{t("plantations.agronomist.stockProducts")}</h6>
            <p className="text-muted small mb-3">{t("plantations.agronomist.stockDescription")}</p>
            <div className="table-responsive mb-3">
              <table className={`table table-hover align-middle mb-0 agro-table ${styles.productsTable}`}>
                <colgroup>
                  <col style={{ width: "17%" }} />
                  <col style={{ width: "29%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "6%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t("plantations.agronomist.category")}</th>
                    <th>{t("plantations.agronomist.product")}</th>
                    <th>{t("plantations.agronomist.dose")}</th>
                    <th>{t("plantations.agronomist.unit")}</th>
                    <th>{t("plantations.agronomist.totalQuantity")}</th>
                    <th>{t("plantations.agronomist.notes")}</th>
                    <th className="text-center">{t("plantations.agronomist.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, index) => (
                    <tr key={index}>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          value={product.category}
                          onChange={(e) => updateProduct(index, { category: e.target.value, item: "", item_search: "" })}
                        >
                          <option value="">{t("plantations.agronomist.all")}</option>
                          {agriculturalCategoryOptions.map((category) => (
                            <option key={category} value={category}>{t(`plantations.agronomist.category.${category}` as TranslationKey)}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="position-relative">
                          <input
                            className="form-control form-control-sm"
                            value={product.item_search}
                            onChange={(e) => handleProductSearchChange(index, e.target.value)}
                            placeholder={t("plantations.agronomist.searchProduct")}
                            list={`agronomo-produtos-${index}`}
                          />
                          <datalist id={`agronomo-produtos-${index}`}>
                            {getProductSuggestions(product).map((item) => (
                              <option key={item.id} value={item.nome}>
                                {item.categoria_display || item.categoria || t("plantations.agronomist.noCategory")}
                              </option>
                            ))}
                          </datalist>
                          <div className="d-flex flex-column gap-1 mt-2">
                            {getProductSuggestions(product).map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className={`btn btn-sm ${styles.productOption} ${product.item === item.id ? "btn-success" : "btn-outline-secondary"}`}
                                onClick={() => selectProductItem(index, item)}
                                title={item.nome}
                                aria-label={item.nome}
                              >
                                {item.nome.length > 30 ? `${item.nome.slice(0, 30)}...` : item.nome}
                                <span className={styles.productDetails}>({t("plantations.agronomist.stockAvailable").replace("{quantity}", String(item.estoque_atual)).replace("{unit}", item.unidade_medida || t("inventory.movements.unitShort"))} · {item.categoria_display || item.categoria || t("plantations.agronomist.noCategory")})</span>
                              </button>
                            ))}
                            {getProductSuggestions(product).length === 0 && (
                              <span className="text-muted small">{t("plantations.agronomist.noProducts")}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <input className="form-control form-control-sm" type="number" step="0.01" value={product.dose_per_ha} onChange={(e) => updateProduct(index, { dose_per_ha: e.target.value })} placeholder="0,00" />
                      </td>
                      <td>
                        <select className="form-select form-select-sm" value={product.dose_unit} onChange={(e) => updateProduct(index, { dose_unit: e.target.value })}>
                          {doseUnitOptions.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <input className="form-control form-control-sm" type="number" step="0.01" value={calculateTotalQuantity(product)} readOnly placeholder="0,00" />
                      </td>
                      <td>
                        <input className="form-control form-control-sm" value={product.notes} onChange={(e) => updateProduct(index, { notes: e.target.value })}                         placeholder={t("plantations.agronomist.notes")} />
                      </td>
                      <td className="text-center">
                        <Button variant="outline-danger" size="sm" onClick={() => setProducts((prev) => prev.length === 1 ? [{ ...emptyProduct }] : prev.filter((_, productIndex) => productIndex !== index))}>
                          <Trash2 size={16} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap">
              <Button variant="outline-success" onClick={() => setProducts((prev) => [...prev, { ...emptyProduct }])}>
                <Plus size={16} /> Adicionar produto
              </Button>
              <div className="d-flex gap-2">
                <Button variant="outline-secondary" onClick={() => {
                  if (editingRecommendationId) {
                    setEditingRecommendationId(null);
                    setForm({
                      title: "",
                      objective: "",
                      recommendation_date: today(),
                      suggested_application_date: "",
                      priority: "medium",
                      status: "pending",
                    });
                    setProducts([{ ...emptyProduct }]);
                  } else {
                    router.push(`/home/plantacoes/${id}`);
                  }
                }}>

                  {t("cattle.form.cancel")}
                </Button>
                <Button variant="agro" onClick={handleSaveRecommendation} disabled={saving}>
                  <Save size={16} /> {saving ? t("plantations.agronomist.saving") : editingRecommendationId ? t("plantations.agronomist.update") : t("plantations.agronomist.save")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
