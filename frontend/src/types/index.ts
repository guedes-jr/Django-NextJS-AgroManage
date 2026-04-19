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
