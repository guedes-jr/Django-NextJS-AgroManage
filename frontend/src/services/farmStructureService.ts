import { apiClient } from "./api";
import type { FarmStructure, FarmStructureItem, FarmStructureSummary } from "@/types";

export interface FarmStructurePayload {
  farm: string;
  category: FarmStructure["category"];
  name: string;
  description?: string;
  built_area_m2?: string | null;
  length_m?: string | null;
  width_m?: string | null;
  quantity: number;
  acquisition_value: string;
  current_value: string;
  acquisition_date?: string | null;
  is_active?: boolean;
  notes?: string;
  latitude?: string | null;
  longitude?: string | null;
}

export interface FarmStructureItemPayload {
  structure: string; name: string; quantity: string; unit: string; value: string;
}

export interface PaginatedStructures {
  count: number;
  results: FarmStructure[];
}

export const farmStructureService = {
  list: (farm?: string) =>
    apiClient.get<PaginatedStructures>("/farms/structures/", {
      params: { farm, page_size: 200 },
    }),
  summary: (farm?: string) =>
    apiClient.get<FarmStructureSummary>("/farms/structures/summary/", { params: { farm } }),
  create: (payload: FarmStructurePayload) =>
    apiClient.post<FarmStructure>("/farms/structures/", payload),
  update: (id: string, payload: Partial<FarmStructurePayload>) =>
    apiClient.patch<FarmStructure>(`/farms/structures/${id}/`, payload),
  remove: (id: string) => apiClient.delete(`/farms/structures/${id}/`),
  addItem: (payload: FarmStructureItemPayload) =>
    apiClient.post<FarmStructureItem>("/farms/structure-items/", payload),
  removeItem: (id: string) => apiClient.delete(`/farms/structure-items/${id}/`),
};
