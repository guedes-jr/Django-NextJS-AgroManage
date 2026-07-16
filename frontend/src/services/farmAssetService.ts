import { apiClient } from "./api";
import type { FarmAsset, FarmAssetImplement, FarmAssetSummary, FarmAssetType } from "@/types";

export interface FarmAssetPayload {
  farm: string; asset_type: FarmAssetType; brand: string; model: string;
  manufacture_year?: number | null; fuel?: string; traction?: string;
  current_hours?: string | null; power?: string; tank_capacity_l?: string | null;
  serial_number?: string; transmission?: string; acquisition_date?: string | null;
  acquisition_value: string; current_value: string; description?: string;
  latitude?: string | null; longitude?: string | null; is_active?: boolean;
}

export interface FarmAssetImplementPayload {
  asset: string; name: string; brand_model?: string; quantity: number;
  manufacture_year?: number | null; acquisition_value: string;
}

interface PaginatedAssets { count: number; results: FarmAsset[] }

export const farmAssetService = {
  list: (farm?: string) => apiClient.get<PaginatedAssets>("/farms/assets/", { params: { farm, page_size: 200 } }),
  summary: (farm?: string) => apiClient.get<FarmAssetSummary>("/farms/assets/summary/", { params: { farm } }),
  create: (payload: FarmAssetPayload) => apiClient.post<FarmAsset>("/farms/assets/", payload),
  update: (id: string, payload: Partial<FarmAssetPayload>) => apiClient.patch<FarmAsset>(`/farms/assets/${id}/`, payload),
  remove: (id: string) => apiClient.delete(`/farms/assets/${id}/`),
  addImplement: (payload: FarmAssetImplementPayload) => apiClient.post<FarmAssetImplement>("/farms/asset-implements/", payload),
  removeImplement: (id: string) => apiClient.delete(`/farms/asset-implements/${id}/`),
};
