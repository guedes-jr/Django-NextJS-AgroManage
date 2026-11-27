import { canonicalSegmentPath, cattleAccessPath } from "./cattleNavigation";
import apiClient, { setOrganizationOperatorMode } from "./api";

export type OrganizationAccess = {
  role: "admin" | "manager" | "operator" | "veterinarian";
  can_manage_users: boolean;
  can_view_financial: boolean;
  can_operate_crops: boolean;
  livestock_species: string[] | null;
  /** Segments this member can open now (contracted ∩ role scope). */
  segments?: string[];
  /** Segments the organization contracted. */
  contracted_segments?: string[];
  read_only: boolean;
  /** Área do veterinário contracted by the organization and allowed for this member. */
  veterinary?: boolean;
  /** Configurações › Recursos dos segmentos: {segment: {feature: on}}. */
  segment_features?: SegmentFeatures;
  /** "suspended": every route goes to SUSPENDED_PATH and the API answers 402 elsewhere. */
  subscription_status?: string | null;
  /** Screen that replaces the workspace: first access, free trial over or suspended for non-payment. */
  access_stage?: "onboarding" | "trial_expired" | "suspended" | null;
  /** End of the free trial while the subscription is trialing. */
  trial_ends_at?: string | null;
  /** Welcome tour shown once after the first access. */
  welcome_tour_pending?: boolean;
};

export type SegmentFeatures = Record<string, Record<string, boolean>>;

export const VETERINARY_PATH = "/home/veterinario";
/** Payment page while the subscription is suspended for non-payment. */
export const SUSPENDED_PATH = "/home/pagamento";
export const isSuspended = (access: OrganizationAccess | null | undefined) => access?.subscription_status === "suspended";
/** First access of a self-service signup: segments, price and terms. */
export const ONBOARDING_PATH = "/home/primeiro-acesso";
/** Subscription confirmation and payment method (required once the free trial ends). */
export const SUBSCRIBE_PATH = "/home/assinar";
/** The only path open in a blocking stage, or null when the workspace is available. */
export function stagePath(access: OrganizationAccess | null | undefined) {
  if (access?.access_stage === "onboarding") return ONBOARDING_PATH;
  if (access?.access_stage === "trial_expired") return SUBSCRIBE_PATH;
  if (isSuspended(access)) return SUSPENDED_PATH;
  return null;
}
/** Fired after the admin changes something the access payload carries (segment features). */
export const ACCESS_CHANGED_EVENT = "fm:organization-access-changed";

/** True when the segment feature is on. Missing segments or features count as off. */
export function featureOn(access: OrganizationAccess | null | undefined, segment: string, feature: string) {
  return !!access?.segment_features?.[segment]?.[feature];
}

/** Contractable business areas (backend apps/billing/segments.py REGISTRY). */
export const SEGMENT_CODES = ["plantacoes", "suinocultura", "gado-de-corte", "pecuaria-leiteira", "area-veterinario"] as const;
/** Web route roots of each segment; a new segment adds its root here. */
const segmentRoots: [string, string[]][] = [
  ["/home/plantacoes", ["plantacoes"]],
  ["/home/seguimento/suinos", ["suinocultura"]],
  ["/home/seguimento/gado-de-corte", ["gado-de-corte"]],
  ["/home/seguimento/pecuaria-leiteira", ["pecuaria-leiteira"]],
  // Legacy cattle root serves both cattle segments.
  ["/home/seguimento/bovinos", ["gado-de-corte", "pecuaria-leiteira"]],
];

/** Segments that can open a /home path (any of them), or null when the path is not a segment area. */
function pathSegments(path: string) {
  path = canonicalSegmentPath(path);
  return segmentRoots.find(([root]) => path === root || path.startsWith(`${root}/`))?.[1] ?? null;
}

export function hasSegment(access: OrganizationAccess | null | undefined, code: string) {
  return !!access?.segments?.includes(code);
}

export function canAccessOrganizationPath(access: OrganizationAccess | null, path: string) {
  const required = pathSegments(path);
  path = cattleAccessPath(path);
  if (!access) return path === "/home";
  // Blocking stages open only their page; those pages open only in their stage (the subscribe
  // page also opens to the admin during the free trial).
  const stage = stagePath(access);
  if (stage) return path === stage;
  if (path === SUSPENDED_PATH || path === ONBOARDING_PATH) return false;
  if (path === SUBSCRIBE_PATH) return access.role === "admin" && !!access.trial_ends_at;
  if (path === VETERINARY_PATH || path.startsWith(`${VETERINARY_PATH}/`)) return !!access.veterinary;
  if (required && access.segments && !required.some(code => access.segments!.includes(code))) return false;
  const personal = ["/home/profile", "/home/notifications", "/home/suporte"];
  const isPersonal = personal.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
  if (access.role === "veterinarian" && !(access.segments || []).some(code => code !== "area-veterinario")) {
    if (path === "/home/agenda") return featureOn(access, "area-veterinario", "agenda");
    return isPersonal;
  }
  if (access.role !== "operator" && access.role !== "veterinarian") {
    return !path.startsWith("/home/usuarios") || access.can_manage_users;
  }
  if (path === "/home" || path === "/home/agenda" || isPersonal) return true;
  const parts = path.split("/");
  if (path.startsWith("/home/plantacoes")) {
    return access.can_operate_crops && !["estrutura", "mao-obra", "colheita", "historico"].includes(parts[4]);
  }
  if (path.startsWith("/home/seguimento/")) {
    if (["vendas", "mao-de-obra"].includes(parts[4])) return false;
    return (access.livestock_species || []).includes(parts[3]);
  }
  return false;
}

export async function getOrganizationAccess() {
  const access = (await apiClient.get<{ access: OrganizationAccess }>("/auth/me/")).data.access;
  setOrganizationOperatorMode(["operator", "veterinarian"].includes(access.role));
  return access;
}
