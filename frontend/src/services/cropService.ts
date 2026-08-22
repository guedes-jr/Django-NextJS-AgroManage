import apiClient from "./api";

export const cropService = {
  // ── Plantations ──────────────────────────────────────────────────────────
  list: (params?: Record<string, string | number>) =>
    apiClient.get("/crops/plantations/", { params }),

  get: (id: string) =>
    apiClient.get(`/crops/plantations/${id}/`),

  create: (data: Record<string, unknown>) =>
    apiClient.post("/crops/plantations/", data),

  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/crops/plantations/${id}/`, data),

  delete: (id: string) =>
    apiClient.delete(`/crops/plantations/${id}/`),

  dashboard: (id: string) =>
    apiClient.get(`/crops/plantations/${id}/dashboard/`),

  getDashboard: () =>
    apiClient.get("/crops/dashboard/"),

  indicators: (id: string) =>
    apiClient.get(`/crops/plantations/${id}/indicators/`),

  listSectorStructureItems: (plantation: string) =>
    apiClient.get("/crops/sector-structure-items/", { params: { plantation, page_size: 200 } }),

  createSectorStructureItem: (data: Record<string, unknown>) =>
    apiClient.post("/crops/sector-structure-items/", data),

  deleteSectorStructureItem: (id: string) =>
    apiClient.delete(`/crops/sector-structure-items/${id}/`),

  // ── Plantation History Sources ───────────────────────────────────────────
  listLandPreparations: (params?: Record<string, string | number>) =>
    apiClient.get("/crops/land-preparations/", { params }),

  listSoilAnalyses: (params?: Record<string, string | number>) =>
    apiClient.get("/crops/soil-analyses/", { params }),

  deleteSoilAnalysis: (id: string) =>
    apiClient.delete(`/crops/soil-analyses/${id}/`),

  listAgronomistRecommendations: (params?: Record<string, string | number>) =>
    apiClient.get("/crops/agronomist-recommendations/", { params }),

  updateAgronomistRecommendation: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/crops/agronomist-recommendations/${id}/`, data),

  deleteAgronomistRecommendation: (id: string) =>
    apiClient.delete(`/crops/agronomist-recommendations/${id}/`),

  // ── Plantings ─────────────────────────────────────────────
  listPlantings: (params?: Record<string, string | number>) =>
    apiClient.get("/crops/plantings/", { params }),

  createPlanting: (data: Record<string, unknown>) =>
    apiClient.post("/crops/plantings/", data),

  updatePlanting: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/crops/plantings/${id}/`, data),

  deletePlanting: (id: string) =>
    apiClient.delete(`/crops/plantings/${id}/`),

  // ── Fertilizations ──────────────────────────────────────
  listFertilizations: (params?: Record<string, string | number>) =>
    apiClient.get("/crops/fertilizations/", { params }),

  createFertilization: (data: Record<string, unknown>) =>
    apiClient.post("/crops/fertilizations/", data),

  updateFertilization: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/crops/fertilizations/${id}/`, data),

  deleteFertilization: (id: string) =>
    apiClient.delete(`/crops/fertilizations/${id}/`),

  // ── Fertigations ────────────────────────────────────────
  listFertigations: (params?: Record<string, string | number>) =>
    apiClient.get("/crops/fertigations/", { params }),

  createFertigation: (data: Record<string, unknown>) =>
    apiClient.post("/crops/fertigations/", data),

  bulkCreateFertigations: (data: Record<string, unknown>) =>
    apiClient.post("/crops/fertigations/bulk-create/", data),

  updateFertigation: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/crops/fertigations/${id}/`, data),

  deleteFertigation: (id: string) =>
    apiClient.delete(`/crops/fertigations/${id}/`),

  // ── Pesticide Applications ──────────────────────────────
  listPesticideApplications: (params?: Record<string, string | number>) =>
    apiClient.get("/crops/pesticides/", { params }),

  createPesticideApplication: (data: Record<string, unknown>) =>
    apiClient.post("/crops/pesticides/", data),

  bulkCreatePesticideApplications: (data: Record<string, unknown>) =>
    apiClient.post("/crops/pesticides/bulk-create/", data),

  updatePesticideApplication: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/crops/pesticides/${id}/`, data),

  deletePesticideApplication: (id: string) =>
    apiClient.delete(`/crops/pesticides/${id}/`),

  // ── Irrigations ────────────────────────────────────────
  listIrrigations: (params?: Record<string, string | number>) =>
    apiClient.get("/crops/irrigations/", { params }),

  createIrrigation: (data: Record<string, unknown>) =>
    apiClient.post("/crops/irrigations/", data),

  updateIrrigation: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/crops/irrigations/${id}/`, data),

  deleteIrrigation: (id: string) =>
    apiClient.delete(`/crops/irrigations/${id}/`),

  listIrrigationPumps: (params?: Record<string, string | number>) =>
    apiClient.get("/crops/irrigation-pumps/", { params }),

  createIrrigationPump: (data: Record<string, unknown>) =>
    apiClient.post("/crops/irrigation-pumps/", data),

  // ── Labor ──────────────────────────────────────────────
  listLaborWorkers: (params?: Record<string, string | number | boolean>) =>
    apiClient.get("/crops/labor-workers/", { params }),

  createLaborWorker: (data: Record<string, unknown>) =>
    apiClient.post("/crops/labor-workers/", data),

  listLaborRecords: (params?: Record<string, string | number>) =>
    apiClient.get("/crops/labor-records/", { params }),

  createLaborRecord: (data: Record<string, unknown>) =>
    apiClient.post("/crops/labor-records/", data),

  updateLaborRecord: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/crops/labor-records/${id}/`, data),

  deleteLaborRecord: (id: string) =>
    apiClient.delete(`/crops/labor-records/${id}/`),

  // ── Harvests ───────────────────────────────────────────
  listHarvests: (params?: Record<string, string | number>) =>
    apiClient.get("/crops/harvests/", { params }),

  createHarvest: (data: Record<string, unknown>) =>
    apiClient.post("/crops/harvests/", data),

  updateHarvest: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/crops/harvests/${id}/`, data),

  deleteHarvest: (id: string) =>
    apiClient.delete(`/crops/harvests/${id}/`),

  listHarvestBuyers: (params?: Record<string, string | number | boolean>) =>
    apiClient.get("/crops/harvest-buyers/", { params }),

  createHarvestBuyer: (data: Record<string, unknown>) =>
    apiClient.post("/crops/harvest-buyers/", data),

  // ── Fields ───────────────────────────────────────────────────────────────
  listFields: (params?: Record<string, string | number>) =>
    apiClient.get("/crops/fields/", { params }),

  createField: (data: Record<string, unknown>) =>
    apiClient.post("/crops/fields/", data),

  // ── Farms ────────────────────────────────────────────────────────────────
  listFarms: (params?: Record<string, string | number>) =>
    apiClient.get("/farms/", { params }),

  // ── Choices ──────────────────────────────────────────────────────────────
  statusChoices: [
    { value: "planned", label: "Planejada" },
    { value: "planting", label: "Em plantio" },
    { value: "growing", label: "Em desenvolvimento" },
    { value: "management", label: "Em manejo" },
    { value: "harvesting", label: "Em colheita" },
    { value: "finished", label: "Finalizada" },
    { value: "cancelled", label: "Cancelada" },
  ],

  cropTypeChoices: [
    { value: "grain", label: "Grão" },
    { value: "fruit", label: "Fruta" },
    { value: "vegetable", label: "Legume" },
    { value: "forage", label: "Forragem" },
    { value: "fiber", label: "Fibra" },
    { value: "other", label: "Outro" },
  ],
};
