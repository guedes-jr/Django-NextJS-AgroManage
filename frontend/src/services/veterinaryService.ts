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
  herd_synced?: boolean;
  pricing?: { rule: string; base: string; discount?: string } | null;
  responsible_user?: string | null;
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
  /** Farm of the organization linked for the herd integration. */
  farm: string | null;
  herd_purpose: VetHerdPurpose;
}

export type VetHerdPurpose = "unknown" | "beef" | "dairy" | "dual";

export interface VetSettings {
  price_insemination: string;
  price_protocol: string;
  price_iatf_insemination: string;
  price_ultrasound: string;
  price_palpation: string;
  price_other: string;
  last_responsible: string;
  payment_days: number;
  discount_min_animals: number | null;
  discount_percent: string;
  price_iatf_package: string | null;
  vet_name: string;
  vet_registry: string;
  vet_phone: string;
}

/** Recursos dos segmentos of the area (all off until the admin turns them on). */
export interface VetFeatures {
  herd_integration?: boolean;
  agenda?: boolean;
  whatsapp_alerts?: boolean;
  finance?: boolean;
  client_share?: boolean;
  client_pricing?: boolean;
}

export interface VetTeamUser { id: string; name: string; role: string }

export interface VetWorkspace {
  today: string;
  settings: VetSettings;
  open_alerts: number;
  can_wipe: boolean;
  role: string;
  features: VetFeatures;
  team: VetTeamUser[];
}

export interface VetInputRow { lot: string; quantity: string }

export interface VetInputLot {
  id: string;
  item: string;
  name: string;
  lot: string;
  unit: string;
  balance: string;
  unit_cost: string | null;
  expiry: string | null;
  category: string;
}

export interface VetClientPrice { id: string; client: string; kind: VetProcedureKind; price: string }

export interface VetTeamMember { id: string; user: string; name: string; email: string; role: string; commission_percent: string; active: boolean }

export interface VetAttachment { id: string; animal: string; procedure: string | null; name: string; kind: "photo" | "document"; size: number; url: string; created_at: string }

export interface VetPrescriptionItem { product: string; dose: string; route: string; frequency: string; duration: string }

export interface VetPrescription {
  id: string;
  client: string;
  client_name: string;
  animal: string | null;
  animal_identifier: string;
  procedure: string | null;
  date: string;
  items: VetPrescriptionItem[];
  notes: string;
  withdrawal: string;
  created_at: string;
}

export interface VetRate { name: string; total: number; pregnant: number; rate: number }

export interface VetIndicators {
  total: number;
  pregnant: number;
  rate: number | null;
  by_bull: VetRate[];
  by_responsible: VetRate[];
  by_farm: VetRate[];
  by_month: VetRate[];
}

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
  inputs?: VetInputRow[];
  responsible_user?: string | null;
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
  inputs?: VetInputRow[];
  responsible_user?: string | null;
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
  responsibles: Array<{ name: string; user: string | null; count: number; value: string; commission: string }>;
}

/** Farm herd (segment animals) consulted read-only in the area. */
export interface VetHerdAnimal {
  id: string;
  identifier: string;
  species: string;
  species_name: string;
  farm_name: string;
  category: string;
  gender: string;
  status: string;
  reproductive_status: string;
  birth_date: string | null;
  last_vaccine: { name: string; date: string } | null;
  last_health: { type: string; date: string } | null;
  expected_birth: string | null;
  last_mating: string | null;
}

export interface VetHerdPage {
  species: Array<{ code: string; name: string }>;
  count: number;
  page: number;
  page_size: number;
  results: VetHerdAnimal[];
}

export type VetHerdEventKind = "mating" | "pregnancy" | "birth" | "heat" | "vaccination" | "health";

export interface VetHerdHistory {
  id: string;
  identifier: string;
  species_name: string;
  farm_name: string;
  reproductive_status: string;
  events: Array<{ kind: VetHerdEventKind; date: string; title: string; detail: string; status: string }>;
}

const base = "/veterinary";

export const veterinaryService = {
  workspace: (signal?: AbortSignal) => apiClient.get<VetWorkspace>(`${base}/workspace/`, { signal }).then(r => r.data),
  updateSettings: (data: Partial<VetSettings>) => apiClient.patch<VetSettings>(`${base}/settings/`, data).then(r => r.data),
  clients: (signal?: AbortSignal) => apiClient.get<VetClient[]>(`${base}/clients/`, { signal }).then(r => r.data),
  createClient: (data: { name: string; farm_name?: string; phone?: string }) => apiClient.post<VetClient>(`${base}/clients/`, data).then(r => r.data),
  updateClient: (id: string, data: Partial<{ name: string; farm_name: string; phone: string; farm: string | null; herd_purpose: VetHerdPurpose }>) => apiClient.patch<VetClient>(`${base}/clients/${id}/`, data).then(r => r.data),
  farms: (signal?: AbortSignal) => apiClient.get<Array<{ id: string; name: string }>>(`${base}/farms/`, { signal }).then(r => r.data),
  clientPrices: (client: string, signal?: AbortSignal) => apiClient.get<VetClientPrice[]>(`${base}/client-prices/`, { params: { client }, signal }).then(r => r.data),
  saveClientPrice: (data: { client: string; kind: VetProcedureKind; price: string }) => apiClient.post<VetClientPrice>(`${base}/client-prices/`, data).then(r => r.data),
  deleteClientPrice: (id: string) => apiClient.delete(`${base}/client-prices/${id}/`),
  team: (signal?: AbortSignal) => apiClient.get<VetTeamMember[]>(`${base}/team/`, { signal }).then(r => r.data),
  teamCandidates: (signal?: AbortSignal) => apiClient.get<VetTeamUser[]>(`${base}/team/candidates/`, { signal }).then(r => r.data),
  addTeamMember: (data: { user: string; commission_percent: string }) => apiClient.post<VetTeamMember>(`${base}/team/`, data).then(r => r.data),
  updateTeamMember: (id: string, data: Partial<{ commission_percent: string; active: boolean }>) => apiClient.patch<VetTeamMember>(`${base}/team/${id}/`, data).then(r => r.data),
  removeTeamMember: (id: string) => apiClient.delete(`${base}/team/${id}/`),
  inputLots: (signal?: AbortSignal) => apiClient.get<VetInputLot[]>(`${base}/input-lots/`, { signal }).then(r => r.data),
  attachments: (animal: string, signal?: AbortSignal) => apiClient.get<VetAttachment[]>(`${base}/attachments/`, { params: { animal }, signal }).then(r => r.data),
  uploadAttachment: (animal: string, file: File, procedure?: string) => {
    const form = new FormData();
    form.append("animal", animal);
    form.append("file", file);
    if (procedure) form.append("procedure", procedure);
    return apiClient.post<VetAttachment>(`${base}/attachments/`, form, { headers: { "Content-Type": "multipart/form-data" } }).then(r => r.data);
  },
  attachmentBlob: (id: string) => apiClient.get<Blob>(`${base}/attachments/${id}/file/`, { responseType: "blob" }).then(r => r.data),
  deleteAttachment: (id: string) => apiClient.delete(`${base}/attachments/${id}/`),
  prescriptions: (params: { animal?: string; client?: string }, signal?: AbortSignal) => apiClient.get<VetPrescription[]>(`${base}/prescriptions/`, { params, signal }).then(r => r.data),
  createPrescription: (data: Omit<VetPrescription, "id" | "client_name" | "animal_identifier" | "created_at" | "procedure"> & { procedure?: string | null }) => apiClient.post<VetPrescription>(`${base}/prescriptions/`, data).then(r => r.data),
  deletePrescription: (id: string) => apiClient.delete(`${base}/prescriptions/${id}/`),
  indicators: (params: { start?: string; end?: string; client?: string }, signal?: AbortSignal) => apiClient.get<VetIndicators>(`${base}/indicators/`, { params, signal }).then(r => r.data),
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
  herd: (params: { species?: string; q?: string; page?: number; status?: string }, signal?: AbortSignal) => apiClient.get<VetHerdPage>(`${base}/herd/`, { params, signal }).then(r => r.data),
  herdAnimal: (id: string, signal?: AbortSignal) => apiClient.get<VetHerdHistory>(`${base}/herd/${id}/`, { signal }).then(r => r.data),
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
