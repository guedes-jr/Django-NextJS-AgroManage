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

  // ── Plantings ─────────────────────────────────────────────
  listPlantings: (params?: Record<string, string | number>) =>
    apiClient.get("/crops/plantings/", { params }),

  createPlanting: (data: Record<string, unknown>) =>
    apiClient.post("/crops/plantings/", data),

  // ── Fertilizations ──────────────────────────────────────
  listFertilizations: (params?: Record<string, string | number>) =>
    apiClient.get("/crops/fertilizations/", { params }),

  createFertilization: (data: Record<string, unknown>) =>
    apiClient.post("/crops/fertilizations/", data),

  // ── Fertigations ────────────────────────────────────────
  listFertigations: (params?: Record<string, string | number>) =>
    apiClient.get("/crops/fertigations/", { params }),

  createFertigation: (data: Record<string, unknown>) =>
    apiClient.post("/crops/fertigations/", data),

  // ── Pesticide Applications ──────────────────────────────
  listPesticideApplications: (params?: Record<string, string | number>) =>
    apiClient.get("/crops/pesticides/", { params }),

  createPesticideApplication: (data: Record<string, unknown>) =>
    apiClient.post("/crops/pesticides/", data),

  // ── Irrigations ────────────────────────────────────────
  listIrrigations: (params?: Record<string, string | number>) =>
    apiClient.get("/crops/irrigations/", { params }),

  createIrrigation: (data: Record<string, unknown>) =>
    apiClient.post("/crops/irrigations/", data),

  listIrrigationPumps: (params?: Record<string, string | number>) =>
    apiClient.get("/crops/irrigation-pumps/", { params }),

  createIrrigationPump: (data: Record<string, unknown>) =>
    apiClient.post("/crops/irrigation-pumps/", data),

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
