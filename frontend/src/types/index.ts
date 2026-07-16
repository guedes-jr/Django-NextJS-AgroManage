/**
 * Global TypeScript types for AgroManage frontend.
 */

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  total_pages: number;
  results: T[];
}

// ─── API Error ───────────────────────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string;
    message: string;
    detail: Record<string, string[]> | string | null;
  };
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  access: string;
  refresh: string;
}

export type UserRole = "owner" | "admin" | "manager" | "operator" | "viewer";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  organization: string | null;
  avatar: string | null;
  phone: string;
  is_active: boolean;
  force_password_change?: boolean;
  created_at: string;
}

// ─── Organization ────────────────────────────────────────────────────────────

export type OrgPlan = "free" | "starter" | "pro" | "enterprise";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  document: string;
  plan: OrgPlan;
  is_active: boolean;
  logo: string | null;
  email: string;
  phone: string;
  created_at: string;
}

// ─── Farm ────────────────────────────────────────────────────────────────────

export interface Farm {
  id: string;
  organization: string;
  name: string;
  code: string;
  total_area_ha: string | null;
  state: string;
  city: string;
  latitude: string | null;
  longitude: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Sector {
  id: string;
  farm: string;
  name: string;
  sector_type: "pasture" | "paddock" | "greenhouse" | "field" | "building" | "other";
  area_ha: string | null;
  is_active: boolean;
}

export type FarmStructureCategory =
  | "corral"
  | "pigsty"
  | "poultry_house"
  | "warehouse"
  | "irrigation"
  | "water_reservoir"
  | "facility"
  | "fence"
  | "other";

export interface FarmStructure {
  id: string;
  farm: string;
  farm_name: string;
  category: FarmStructureCategory;
  category_label: string;
  name: string;
  description: string;
  built_area_m2: string | null;
  length_m: string | null;
  width_m: string | null;
  quantity: number;
  acquisition_value: string;
  current_value: string;
  acquisition_date: string | null;
  is_active: boolean;
  notes: string;
  latitude: string | null;
  longitude: string | null;
  items: FarmStructureItem[];
  items_value: string;
  created_by: string | null;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface FarmStructureItem {
  id: string;
  structure: string;
  name: string;
  quantity: string;
  unit: string;
  value: string;
}

export interface FarmStructureSummaryCategory {
  category: FarmStructureCategory;
  label: string;
  records: number;
  items: number;
  acquisition_value: string;
  current_value: string;
}

export interface FarmStructureSummary {
  total_records: number;
  total_items: number;
  acquisition_value: string;
  current_value: string;
  depreciation_value: string;
  categories: FarmStructureSummaryCategory[];
}

export type FarmAssetType = "tractor" | "harvester" | "planter" | "sprayer" | "truck" | "pickup" | "car" | "motorcycle" | "other";

export interface FarmAssetImplement {
  id: string;
  asset: string;
  name: string;
  brand_model: string;
  quantity: number;
  manufacture_year: number | null;
  acquisition_value: string;
}

export interface FarmAsset {
  id: string;
  farm: string;
  farm_name: string;
  asset_type: FarmAssetType;
  asset_type_label: string;
  brand: string;
  model: string;
  manufacture_year: number | null;
  fuel: string;
  traction: string;
  current_hours: string | null;
  power: string;
  tank_capacity_l: string | null;
  serial_number: string;
  transmission: string;
  acquisition_date: string | null;
  acquisition_value: string;
  current_value: string;
  description: string;
  latitude: string | null;
  longitude: string | null;
  is_active: boolean;
  created_by: string | null;
  created_by_name: string;
  implements: FarmAssetImplement[];
  implements_value: string;
  created_at: string;
  updated_at: string;
}

export interface FarmAssetSummary {
  total_assets: number;
  acquisition_value: string;
  current_value: string;
  implements_value: string;
  total_invested: string;
}

// ─── Livestock ───────────────────────────────────────────────────────────────

export interface Species {
  id: string;
  name: string;
  code: string;
}

export interface Breed {
  id: string;
  species: string;
  name: string;
}

export type BatchStatus = "active" | "sold" | "finished" | "dead";

export interface AnimalBatch {
  id: string;
  farm: string;
  sector: string | null;
  species: string;
  breed: string | null;
  batch_code: string;
  quantity: number;
  entry_date: string;
  exit_date: string | null;
  status: BatchStatus;
  avg_weight_kg: string | null;
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export type ItemCategory =
  | "feed" | "vaccine" | "medicine" | "fertilizer"
  | "pesticide" | "fuel" | "equipment" | "other";

export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: ItemCategory;
  unit: string;
  current_stock: string;
  min_stock: string;
  unit_cost: string | null;
  is_below_minimum: boolean;
}

// ─── Finance ─────────────────────────────────────────────────────────────────

export type TransactionStatus = "pending" | "paid" | "overdue" | "cancelled";

export interface Transaction {
  id: string;
  description: string;
  amount: string;
  due_date: string;
  payment_date: string | null;
  status: TransactionStatus;
  category: string;
  farm: string | null;
  is_revenue: boolean;
}

// ─── Shared ──────────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
}

export type SortDirection = "asc" | "desc";

export interface TableSort {
  field: string;
  direction: SortDirection;
}

// ─── Crops / Plantations ─────────────────────────────────────────────────────

export type PlantationStatus =
  | "planned"
  | "planting"
  | "growing"
  | "management"
  | "harvesting"
  | "finished"
  | "cancelled";

export type CropType =
  | "grain"
  | "fruit"
  | "vegetable"
  | "forage"
  | "fiber"
  | "other";

export interface Plantation {
  [key: string]: unknown;
  id: string;
  name: string;
  organization?: string;
  farm: string;
  farm_name: string;
  field: string;
  field_name: string;
  sector?: string;
  sector_name?: string;
  crop_type: CropType;
  crop_type_display: string;
  crop_name: string;
  variety: string;
  hybrid: string;
  planted_area_ha: string | null;
  seed_quantity_used: string | null;
  population: number | null;
  spacing: string;
  planting_date: string;
  expected_harvest_date: string | null;
  actual_harvest_date: string | null;
  status: PlantationStatus;
  status_display: string;
  estimated_production_kg: string | null;
  estimated_bags: string | null;
  estimated_revenue: string | null;
  responsible_user: string | null;
  responsible_name: string | null;
  days_in_cultivation?: number;
  days_remaining?: number | null;
  investment_total?: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface PlantationDashboard {
  id: string;
  name: string;
  crop_name: string;
  crop_type_display: string;
  field_name: string;
  farm_name: string;
  variety: string;
  area_ha: string;
  seed_quantity_used?: string | null;
  planting_date: string;
  expected_harvest_date: string | null;
  actual_harvest_date: string | null;
  status: PlantationStatus;
  status_display: string;
  days_in_cultivation: number;
  days_remaining: number | null;
  investment_total: string;
  cost_per_ha: string;
  estimated_revenue: string;
  estimated_revenue_per_ha: string;
  estimated_profit: string;
  estimated_profit_per_ha: string;
  estimated_roi: string;
  real_profit: string;
  estimated_production_kg: string;
  estimated_bags: string;
  population: number | null;
  spacing: string;
  responsible_name: string;
}

export interface Planting {
  id: string;
  plantation: string;
  item: string;
  item_name: string;
  supplier: string | null;
  supplier_name: string | null;
  lot: string | null;
  quantity: string;
  unit: string;
  quantity_per_ha: string | null;
  unit_price: string | null;
  total_price: string | null;
  population: number | null;
  spacing: string;
  depth: string;
  planting_date: string;
  operator: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Fertilization {
  id: string;
  plantation: string;
  item: string;
  item_name: string;
  supplier: string | null;
  supplier_name: string | null;
  lot: string | null;
  quantity: string;
  unit: string;
  dose_per_ha: string | null;
  unit_price: string | null;
  total_price: string | null;
  application_method: string;
  application_method_display: string;
  area_applied_ha: string | null;
  application_date: string;
  operator: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Fertigation {
  id: string;
  plantation: string;
  item: string;
  item_name: string;
  lot: string | null;
  quantity: string;
  unit: string;
  syrup_liters: string | null;
  concentration: string;
  application_time_hours: string | null;
  area_applied_ha: string | null;
  unit_price: string | null;
  total_price: string | null;
  application_date: string;
  operator: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface PesticideApplication {
  id: string;
  plantation: string;
  item: string;
  item_name: string;
  pesticide_type: string;
  pesticide_type_display: string;
  active_ingredient: string;
  dose: string;
  quantity: string;
  unit: string;
  supplier: string | null;
  supplier_name: string | null;
  lot: string | null;
  unit_price: string | null;
  total_price: string | null;
  area_applied_ha: string | null;
  application_date: string;
  operator: string;
  target: string;
  equipment: string;
  withholding_days: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Irrigation {
  id: string;
  plantation: string;
  date: string | null;
  start_date: string | null;
  end_date: string | null;
  irrigation_system: string;
  irrigation_system_display: string;
  start_time: string | null;
  end_time: string | null;
  pump_equipment: string | null;
  pump_name: string | null;
  pump_power_cv: string | null;
  pump: string;
  pump_power_kw: string | null;
  hours_per_day: string | null;
  operating_days: number;
  hours: string | null;
  flow_rate_l_per_h: string | null;
  liters_used: string | null;
  energy_kwh: string | null;
  kwh_value: string | null;
  energy_cost: string | null;
  operator: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Field {
  id: string;
  farm: string;
  farm_name: string;
  sector: string | null;
  sector_name: string | null;
  name: string;
  area_ha: string;
  soil_type: string;
  is_active: boolean;
  notes: string;
  created_at: string;
}
