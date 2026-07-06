"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
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
} from "lucide-react";
import apiClient from "@/services/api";
import { cropService } from "@/services/cropService";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";

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
  estoque_atual?: string;
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

const priorityOptions = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
];

const statusOptions = [
  { value: "pending", label: "Pendente" },
  { value: "in_progress", label: "Em execução" },
  { value: "completed", label: "Concluída" },
];

const doseUnitOptions = [
  { value: "l_ha", label: "L/ha" },
  { value: "ml_ha", label: "mL/ha" },
  { value: "kg_ha", label: "kg/ha" },
  { value: "g_ha", label: "g/ha" },
];

const agriculturalCategoryOptions = [
  { value: "semente", label: "Sementes/mudas" },
  { value: "fertilizante", label: "Adubos" },
  { value: "foliar", label: "Foliares" },
  { value: "corretivo", label: "Corretivo de Solo" },
  { value: "defensivo", label: "Defensivo Agrícola" },
  { value: "material", label: "Material" },
  { value: "outro", label: "Outro" },
];

const agriculturalCategoryValues = agriculturalCategoryOptions.map((category) => category.value);

const statusVariant = (status: Recommendation["status"]) => {
  if (status === "completed") return { background: "#dcfce7", color: "#166534", border: "1px solid #86efac" };
  if (status === "in_progress") return { background: "#dbeafe", color: "#1d4ed8", border: "1px solid #93c5fd" };
  return { background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" };
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
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

const formatDecimal = (value: number) => {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(2);
};

export default function AgronomoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [plantation, setPlantation] = useState<Plantation | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [soilAnalyses, setSoilAnalyses] = useState<SoilAnalysis[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
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
    const items = inventoryItems.filter((item) => agriculturalCategoryValues.includes(item.categoria || ""));
    return items.length > 0 ? items : inventoryItems;
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
    return formatDecimal(dose * recommendationAreaHa);
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
        console.error("Erro ao carregar área do agrônomo", error);
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
      .filter((item) => !product.category || item.categoria === product.category)
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
      const sameCategory = !currentProduct.category || item.categoria === currentProduct.category;
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
      console.error("Erro ao anexar análise de solo", error);
      alert("Não foi possível anexar a análise de solo.");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveRecommendation = async () => {
    if (!id || !form.title.trim()) return;
    const unresolvedProduct = products.find((product) => product.item_search.trim() && !product.item);
    if (unresolvedProduct) {
      alert("Selecione o produto pela sugestão exibida antes de salvar.");
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
      const response = await apiClient.post("/crops/agronomist-recommendations/", payload);
      setRecommendations((prev) => [response.data, ...prev]);
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
      console.error("Erro ao salvar recomendação", error);
      alert("Não foi possível salvar a recomendação.");
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
      console.error("Erro ao concluir recomendação", error);
      alert("Não foi possível marcar a recomendação como feita.");
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
    return <div className="p-4 text-muted">Plantação não encontrada.</div>;
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap mb-4">
        <div className="d-flex align-items-center gap-3">
          <button className="btn btn-outline-secondary btn-sm d-flex align-items-center justify-content-center" onClick={() => router.back()} style={{ width: 38, height: 38, borderRadius: 10 }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="fw-black mb-1 d-flex align-items-center gap-2" style={{ fontSize: "1.75rem" }}>
              <FlaskConical size={28} className="text-success" /> Área do Agrônomo
            </h1>
            <p className="text-muted mb-0 small">
              {plantation.name || plantation.crop_name} › {plantation.field_name || "Talhão"}
            </p>
          </div>
        </div>
        <Button variant="outline-secondary" onClick={() => router.push(`/home/plantacoes/${id}`)}>
          Voltar para a plantação
        </Button>
      </div>

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="dashboard-card p-4 h-100">
            <h6 className="fw-bold mb-1 d-flex align-items-center gap-2"><FlaskConical size={18} /> Análise de solo</h6>
            <p className="text-muted small mb-4">Anexe e consulte a análise de solo vinculada a este talhão.</p>

            <label
              className="border rounded d-flex flex-column align-items-center justify-content-center text-center p-4 mb-4"
              style={{ minHeight: 180, cursor: "pointer", background: "var(--bs-tertiary-bg, #f8f9fa)" }}
            >
              <UploadCloud size={42} className="text-success mb-2" />
              <strong>{uploading ? "Enviando análise..." : "Anexar análise de solo"}</strong>
              <span className="text-muted small mt-2">PDF, JPG ou PNG até 10MB</span>
              <input
                className="d-none"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                disabled={uploading}
                onChange={(event) => handleUpload(event.target.files?.[0] || null)}
              />
            </label>

            <h6 className="fw-bold small mb-3">Análises anexadas</h6>
            {soilAnalyses.length === 0 ? (
              <p className="text-muted small mb-0">Nenhuma análise de solo anexada.</p>
            ) : (
              <div className="d-flex flex-column gap-2">
                {soilAnalyses.map((analysis) => (
                  <div key={analysis.id} className="border rounded p-3 d-flex align-items-center gap-3">
                    <FileText size={30} className="text-danger flex-shrink-0" />
                    <div className="flex-grow-1 min-w-0">
                      <div className="fw-semibold text-truncate">{analysis.original_name || "Análise de solo"}</div>
                      <div className="text-muted small">
                        Anexado em: {new Date(analysis.created_at).toLocaleDateString("pt-BR")}
                        {analysis.uploaded_by_name ? ` por ${analysis.uploaded_by_name}` : ""}
                      </div>
                    </div>
                    <Button variant="outline-secondary" size="sm" onClick={() => window.open(analysis.file_url, "_blank")} title="Visualizar">
                      <Eye size={16} />
                    </Button>
                    <a className="btn btn-outline-secondary btn-sm" href={analysis.file_url} download title="Baixar">
                      <Download size={16} />
                    </a>
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
                <h6 className="fw-bold mb-1 d-flex align-items-center gap-2"><ClipboardList size={18} /> Recomendações ativas</h6>
                <p className="text-muted small mb-0">Orientações pendentes ou em execução nesta cultura.</p>
              </div>
              <Button variant="agro" size="sm" onClick={() => document.getElementById("nova-recomendacao")?.scrollIntoView({ behavior: "smooth" })}>
                <Plus size={16} /> Nova recomendação
              </Button>
            </div>

            {activeRecommendations.length === 0 ? (
              <p className="text-muted small mb-0">Nenhuma recomendação ativa.</p>
            ) : (
              <div className="d-flex flex-column gap-3">
                {activeRecommendations.slice(0, 5).map((recommendation, index) => (
                  <div key={recommendation.id} className="border rounded p-3">
                    <div className="d-flex align-items-start justify-content-between gap-2">
                      <div className="d-flex align-items-center gap-3 flex-wrap">
                        <Badge style={{ background: "#047857", color: "#fff" }}>#{String(activeRecommendations.length - index).padStart(2, "0")}</Badge>
                        <span className="small">{formatDate(recommendation.recommendation_date)}</span>
                        <span className="small">Aplicação sugerida: {formatDate(recommendation.suggested_application_date)}</span>
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <Badge style={statusVariant(recommendation.status)}>{recommendation.status_display || recommendation.status}</Badge>
                        <Button
                          variant="outline-success"
                          size="sm"
                          disabled={completingRecommendationId === recommendation.id}
                          onClick={() => handleCompleteRecommendation(recommendation.id)}
                        >
                          <CheckCircle2 size={15} />
                          {completingRecommendationId === recommendation.id ? "Concluindo..." : "Feito"}
                        </Button>
                      </div>
                    </div>
                    <div className="fw-bold mt-2">{recommendation.title}</div>
                    <div className="d-flex gap-4 text-muted small mt-2 flex-wrap">
                      <span>Produtos: {recommendation.products?.length || 0} item{(recommendation.products?.length || 0) === 1 ? "" : "s"}</span>
                      <span>Área: {recommendation.area_ha || plantation.planted_area_ha || "-"} ha</span>
                      <span>Prioridade: {recommendation.priority_display || recommendation.priority}</span>
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
                <h6 className="fw-bold mb-1 d-flex align-items-center gap-2"><History size={18} /> Histórico recente</h6>
                <p className="text-muted small mb-0">Últimas recomendações registradas para esta plantação.</p>
              </div>
              <Button variant="outline-secondary" size="sm" onClick={() => router.push(`/home/plantacoes/${id}/historico`)}>
                Ver relatório completo
              </Button>
            </div>

            {recentRecommendations.length === 0 ? (
              <p className="text-muted small mb-0">Nenhum registro recente de recomendação.</p>
            ) : (
              <div className="d-flex flex-column gap-2">
                {recentRecommendations.map((recommendation) => (
                  <div key={recommendation.id} className="border rounded p-3 d-flex align-items-center justify-content-between gap-3 flex-wrap">
                    <div>
                      <div className="fw-semibold">{recommendation.title}</div>
                      <div className="text-muted small">
                        {formatDate(recommendation.recommendation_date)} • {recommendation.status_display || recommendation.status}
                      </div>
                    </div>
                    <Badge style={statusVariant(recommendation.status)}>{recommendation.status_display || recommendation.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="col-12">
          <div className="dashboard-card p-4">
            <h6 className="fw-bold mb-1 d-flex align-items-center gap-2"><ClipboardList size={18} /> Histórico de recomendações concluídas</h6>
            <p className="text-muted small mb-4">Orientações já executadas nesta cultura.</p>

            {completedRecommendations.length === 0 ? (
              <p className="text-muted small mb-0">Nenhuma recomendação concluída ainda.</p>
            ) : (
              <div className="table-responsive">
                <table className="table align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Recomendação</th>
                      <th>Aplicação sugerida</th>
                      <th>Produtos</th>
                      <th>Prioridade</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedRecommendations.map((recommendation) => (
                      <tr key={recommendation.id}>
                        <td>
                          <div className="fw-bold">{recommendation.title}</div>
                          {recommendation.objective ? <div className="text-muted small">{recommendation.objective}</div> : null}
                        </td>
                        <td>{formatDate(recommendation.suggested_application_date)}</td>
                        <td>{recommendation.products?.length || 0} item{(recommendation.products?.length || 0) === 1 ? "" : "s"}</td>
                        <td>{recommendation.priority_display || recommendation.priority}</td>
                        <td><Badge style={statusVariant(recommendation.status)}>{recommendation.status_display || "Concluída"}</Badge></td>
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
            <h6 className="fw-bold mb-1 d-flex align-items-center gap-2"><ClipboardList size={18} /> Nova recomendação</h6>
            <p className="text-muted small mb-4">Preencha os dados da recomendação agrícola.</p>

            <div className="row g-3 mb-4">
              <div className="col-lg-6">
                <label className="form-label small fw-medium">Título da recomendação *</label>
                <input className="form-control" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Aplicar herbicida pós-emergente" />
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">Data da recomendação *</label>
                <input className="form-control" type="date" value={form.recommendation_date} onChange={(e) => setForm({ ...form, recommendation_date: e.target.value })} />
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">Data sugerida para aplicação</label>
                <input className="form-control" type="date" value={form.suggested_application_date} onChange={(e) => setForm({ ...form, suggested_application_date: e.target.value })} />
              </div>
              <div className="col-lg-6">
                <label className="form-label small fw-medium">Observações / objetivo</label>
                <textarea className="form-control" rows={2} maxLength={300} value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} placeholder="Descreva o objetivo da recomendação..." />
                <div className="text-end text-muted small">{form.objective.length}/300</div>
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">Prioridade</label>
                <select className="form-select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-medium">Status</label>
                <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>

            <h6 className="fw-bold text-success mb-3">Produtos recomendados</h6>
            <div className="table-responsive mb-3">
              <table className="table align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Categoria</th>
                    <th>Produto</th>
                    <th>Dose/ha</th>
                    <th>Unidade</th>
                    <th>Quantidade total</th>
                    <th>Observações</th>
                    <th className="text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, index) => (
                    <tr key={index}>
                      <td style={{ minWidth: 180 }}>
                        <select
                          className="form-select"
                          value={product.category}
                          onChange={(e) => updateProduct(index, { category: e.target.value, item: "", item_search: "" })}
                        >
                          <option value="">Todas</option>
                          {agriculturalCategoryOptions.map((category) => (
                            <option key={category.value} value={category.value}>{category.label}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ minWidth: 280 }}>
                        <div className="position-relative">
                          <input
                            className="form-control"
                            value={product.item_search}
                            onChange={(e) => handleProductSearchChange(index, e.target.value)}
                            placeholder="Digite para buscar o produto"
                            list={`agronomo-produtos-${index}`}
                          />
                          <datalist id={`agronomo-produtos-${index}`}>
                            {getProductSuggestions(product).map((item) => (
                              <option key={item.id} value={item.nome}>
                                {item.categoria_display || item.categoria || "Sem categoria"}
                              </option>
                            ))}
                          </datalist>
                          <div className="d-flex flex-wrap gap-2 mt-2">
                            {getProductSuggestions(product).map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className={`btn btn-sm ${product.item === item.id ? "btn-success" : "btn-outline-secondary"}`}
                                onClick={() => selectProductItem(index, item)}
                                style={{ borderRadius: 999, fontWeight: 700 }}
                              >
                                {item.nome}
                                <span className="ms-1 text-nowrap">({item.categoria_display || item.categoria || "Sem categoria"})</span>
                              </button>
                            ))}
                            {getProductSuggestions(product).length === 0 && (
                              <span className="text-muted small">Nenhum produto encontrado para esta busca.</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ minWidth: 120 }}>
                        <input className="form-control" type="number" step="0.01" value={product.dose_per_ha} onChange={(e) => updateProduct(index, { dose_per_ha: e.target.value })} placeholder="0,00" />
                      </td>
                      <td style={{ minWidth: 110 }}>
                        <select className="form-select" value={product.dose_unit} onChange={(e) => updateProduct(index, { dose_unit: e.target.value })}>
                          {doseUnitOptions.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                        </select>
                      </td>
                      <td style={{ minWidth: 140 }}>
                        <input className="form-control" type="number" step="0.01" value={calculateTotalQuantity(product)} readOnly placeholder="0,00" />
                      </td>
                      <td style={{ minWidth: 220 }}>
                        <input className="form-control" value={product.notes} onChange={(e) => updateProduct(index, { notes: e.target.value })} placeholder="Observações" />
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
                <Button variant="outline-secondary" onClick={() => router.push(`/home/plantacoes/${id}`)}>Cancelar</Button>
                <Button variant="agro" onClick={handleSaveRecommendation} disabled={saving}>
                  <Save size={16} /> {saving ? "Salvando..." : "Salvar recomendação"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
