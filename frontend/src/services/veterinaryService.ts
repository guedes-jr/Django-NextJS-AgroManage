import { apiClient } from "./api";

export type VetCategory = "vaca_solteira" | "vaca_parida" | "novilha";
export type VetStatus = "protocol" | "inseminated" | "pregnant" | "open" | "attended" | "none";
export type VetTone = "success" | "info" | "warning" | "danger" | "neutral";
export type VetDeadline = "late" | "today" | "week" | "later" | "nodate";
export type VetConduct = "" | "iatf_protocol" | "observe_heat" | "induction" | "discard";
export type VetResult = "" | "pregnant" | "open";
export type VetCycling = "" | "cycling" | "not_cycling";
export type VetMethod = "" | "artificial" | "natural";
export type VetDiscardReason = "" | "repeat_open" | "age" | "low_production" | "health" | "other";
export type VetProcedureKind = "insemination" | "protocol" | "iatf_insemination" | "ultrasound" | "palpation" | "other";
export type VetAlertKind = "calving" | "removal" | "inseminate" | "observe_heat" | "induction_review" | "ultrasound";

/** Next procedure code: an open alert ("alert_<kind>") or a rule derived from the last procedure. */
export type VetNextCode =
  | `alert_${VetAlertKind}`
  | "first" | "inseminate_iatf" | "ultrasound" | "calving" | "discard" | "observe_heat" | "induction_review" | "define_conduct" | "new";

export interface VetNext { code: VetNextCode; day: number | null; date: string | null }

export interface VetProcedure {
  id: string;
  date: string;
  kind: VetProcedureKind;
  result: VetResult;
  semen: string;
  value: string;
  paid: boolean;
  notes: string;
  responsible: string;
  category: VetCategory | "";
  conduct: VetConduct;
  cycling: VetCycling;
  management_days: number | null;
  protocol_start: string | null;
  return_days: number;
  discard_reason: VetDiscardReason;
  coverage_date: string | null;
  gestation_days: number;
  bull: string;
  calving_date: string | null;
  coverage_method: VetMethod;
  step: "" | "removal" | "insemination";
  step_day: number | null;
  rescheduled_to: string | null;
  origin_kind: "" | "protocol" | "insemination";
  not_done: boolean;
  gestation_now: number;
}

export interface VetSource {
  kind: "protocol" | "insemination";
  insemination_date: string;
  bull: string;
  cycling: VetCycling;
  management_days: number | null;
  protocol_start: string | null;
}

export interface VetAnimal {
  id: string;
  client: string;
  client_name: string;
  farm_name: string;
  identifier: string;
  name: string;
  category: VetCategory;
  status: VetStatus;
  status_tone: VetTone;
  next: VetNext;
  deadline: VetDeadline;
  procedures_count: number;
  last: VetProcedure | null;
  source: VetSource | null;
}

export interface VetLookup extends Partial<VetAnimal> {
  found: boolean;
  pending_step?: { kind: VetAlertKind; day: number | null; date: string } | null;
  not_inseminated_date?: string | null;
  default_coverage_method?: VetMethod;
}

export interface VetClient {
  id: string;
  name: string;
  farm_name: string;
  phone: string;
  animals: number;
  month_procedures: number;
  receivable: string;
  procedures: number;
}

export interface VetSettings {
  price_insemination: string;
  price_protocol: string;
  price_iatf_insemination: string;
  price_ultrasound: string;
  price_palpation: string;
  price_other: string;
  last_responsible: string;
}

export interface VetWorkspace { today: string; settings: VetSettings; open_alerts: number; can_wipe: boolean }

export interface VetRegisterPayload {
  client?: string | null;
  new_client_name?: string;
  date: string;
  responsible?: string;
  animal: string;
  category?: VetCategory | "";
  diagnosis?: VetResult;
  conduct?: VetConduct;
  cycling?: VetCycling;
  management_days?: number | null;
  protocol_start?: string | null;
  return_days?: number | null;
  discard_reason?: VetDiscardReason;
  coverage_date?: string | null;
  gestation_days?: number | null;
  bull?: string;
  calving_date?: string | null;
  coverage_method?: VetMethod;
  confirm_pregnancy?: boolean;
  edit?: boolean;
  step_done?: "" | "yes" | "no";
  step_date?: string | null;
  step_bull?: string;
  notes?: string;
}

export interface VetQuickPayload {
  date: string;
  action?: "" | "insemination" | "diagnosis" | "protocol";
  step_done?: "" | "yes" | "no";
  bull?: string;
  notes?: string;
  reschedule_to?: string | null;
  diagnosis?: VetResult;
  conduct?: VetConduct;
  cycling?: VetCycling;
  management_days?: number | null;
  gestation_days?: number | null;
  coverage_method?: VetMethod;
}

export interface VetRegisterResult {
  branch: "protocol_step" | "iatf_insemination" | "diagnosis" | "insemination";
  animal_created: boolean;
  animal: { id: string; identifier: string };
  client: { id: string; name: string };
  procedure: VetProcedure;
  alerts: Array<{ kind: VetAlertKind; day: number | null; date: string }>;
}

export type VetReportKind = "insemination" | "insemination_not_done" | "diagnosis" | "iatf_protocol" | "other";
export type VetReportResult = "" | "pregnant" | "open" | "awaiting";

export interface VetReportRow extends VetProcedure {
  client: string;
  client_name: string;
  farm_name: string;
  animal: string;
  identifier: string;
  animal_name: string;
  report_kind: VetReportKind;
  report_result: VetReportResult;
  origin: string;
  report_bull: string;
  next: VetNext | null;
}

export interface VetReportAnimal {
  animal: string;
  identifier: string;
  animal_name: string;
  client_name: string;
  category: VetCategory;
  count: number;
  inseminations: string[];
  bulls: string[];
  result: VetReportResult;
  calving_date: string | null;
  last: { report_kind: VetReportKind; date: string } | null;
  next: VetNext | null;
}

export interface VetReport {
  rows: VetReportRow[];
  animals: VetReportAnimal[];
  stats: { procedures: number; animals: number; inseminations: number; pregnant: number; open: number; rate: number | null; rate_total: number; rate_pregnant: number };
  bulls: Array<{ name: string; count: number }>;
  responsibles: string[];
  recent_dates: Array<{ date: string; count: number }>;
}

export interface VetReportFilters {
  client?: string;
  date?: string;
  procedure?: string;
  result?: string;
  bull?: string;
  category?: string;
  responsible?: string;
  q?: string;
  mode?: "event" | "animal";
}

export interface VetBilling {
  month: string;
  count: number;
  total: string;
  received: string;
  receivable: string;
  clients: Array<{ id: string; name: string; farm_name: string; count: number; total: string; receivable: string }>;
  detail: Array<VetProcedure & { identifier: string }> | null;
  responsibles: Array<{ name: string; count: number; value: string }>;
}

const base = "/veterinary";

export const veterinaryService = {
  workspace: (signal?: AbortSignal) => apiClient.get<VetWorkspace>(`${base}/workspace/`, { signal }).then(r => r.data),
  updateSettings: (data: Partial<VetSettings>) => apiClient.patch<VetSettings>(`${base}/settings/`, data).then(r => r.data),
  clients: (signal?: AbortSignal) => apiClient.get<VetClient[]>(`${base}/clients/`, { signal }).then(r => r.data),
  createClient: (data: { name: string; farm_name?: string; phone?: string }) => apiClient.post<VetClient>(`${base}/clients/`, data).then(r => r.data),
  deleteClient: (id: string) => apiClient.delete(`${base}/clients/${id}/`),
  animals: (signal?: AbortSignal) => apiClient.get<VetAnimal[]>(`${base}/animals/`, { signal }).then(r => r.data),
  setCategory: (id: string, category: VetCategory) => apiClient.patch(`${base}/animals/${id}/`, { category }).then(r => r.data),
  history: (id: string, signal?: AbortSignal) => apiClient.get<VetProcedure[]>(`${base}/animals/${id}/history/`, { signal }).then(r => r.data),
  lookup: (client: string, q: string, signal?: AbortSignal) => apiClient.get<VetLookup>(`${base}/animals/lookup/`, { params: { client, q }, signal }).then(r => r.data),
  quick: (id: string, data: VetQuickPayload) => apiClient.post<VetRegisterResult>(`${base}/animals/${id}/quick/`, data).then(r => r.data),
  register: (data: VetRegisterPayload) => apiClient.post<VetRegisterResult>(`${base}/procedures/`, data).then(r => r.data),
  updateProcedure: (id: string, data: { value?: string; paid?: boolean }) => apiClient.patch(`${base}/procedures/${id}/`, data).then(r => r.data),
  report: (filters: VetReportFilters, signal?: AbortSignal) => apiClient.get<VetReport>(`${base}/report/`, { params: filters, signal }).then(r => r.data),
  billing: (month: string, client?: string, signal?: AbortSignal) => apiClient.get<VetBilling>(`${base}/billing/`, { params: { month, client }, signal }).then(r => r.data),
  payAll: (client: string, month: string) => apiClient.post(`${base}/billing/pay-all/`, { client, month }).then(r => r.data),
  wipe: () => apiClient.post<{ clients: number; animals: number }>(`${base}/wipe/`).then(r => r.data),
};

/** First readable message inside a value ({detail}, {field: [msg]} or nested lists). */
function firstMessage(value: unknown, depth = 0): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (depth > 4 || !value || typeof value !== "object") return null;
  for (const item of Array.isArray(value) ? value : Object.values(value as Record<string, unknown>)) {
    const found = firstMessage(item, depth + 1);
    if (found) return found;
  }
  return null;
}

/** API errors come in the project envelope {error: {code, message, detail}}; prefer the specific detail. */
export function vetError(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: unknown } })?.response?.data as { error?: { detail?: unknown; message?: unknown } } | undefined;
  if (data?.error) return firstMessage(data.error.detail) || firstMessage(data.error.message) || fallback;
  return firstMessage(data) || fallback;
}
