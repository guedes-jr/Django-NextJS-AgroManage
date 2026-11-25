import { cattleAccessPath, legacyCattleRoot } from "./cattleNavigation";
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
};

export type SegmentFeatures = Record<string, Record<string, boolean>>;

export const VETERINARY_PATH = "/home/veterinario";
/** Fired after the admin changes something the access payload carries (segment features). */
export const ACCESS_CHANGED_EVENT = "fm:organization-access-changed";

/** True when the segment feature is on. Missing segments or features count as off. */
export function featureOn(access: OrganizationAccess | null | undefined, segment: string, feature: string) {
  return !!access?.segment_features?.[segment]?.[feature];
}

export const SEGMENT_CODES = ["plantacoes", "bovinos", "suinos", "area-veterinario"] as const;

/** Segment opened by a /home path, if any ("plantacoes", "bovinos", "suinos"). */
function pathSegment(path: string) {
  if (path.startsWith("/home/plantacoes")) return "plantacoes";
  if (path.startsWith("/home/seguimento/")) return path.split("/")[3] || null;
  return null;
}

export function hasSegment(access: OrganizationAccess | null | undefined, code: string) {
  return !!access?.segments?.includes(code);
}

export function canAccessOrganizationPath(access: OrganizationAccess | null, path: string) {
  path = cattleAccessPath(path);
  if (!access) return path === "/home";
  if (path === VETERINARY_PATH || path.startsWith(`${VETERINARY_PATH}/`)) return !!access.veterinary;
  const segment = pathSegment(path);
  if (segment && access.segments && !access.segments.includes(segment)) return false;
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
