import { cattleAccessPath, legacyCattleRoot } from "./cattleNavigation";
import apiClient, { setOrganizationOperatorMode } from "./api";

export type OrganizationAccess = {
  role: "admin" | "manager" | "operator" | "feeder" | "veterinarian";
  can_manage_users: boolean;
  can_view_financial: boolean;
  can_operate_crops: boolean;
  livestock_species: string[] | null;
  read_only: boolean;
  /** Área do veterinário contracted by the organization and allowed for this role. */
  veterinary?: boolean;
};

export const VETERINARY_PATH = "/home/veterinario";

export function canAccessOrganizationPath(access: OrganizationAccess | null, path: string) {
  path = cattleAccessPath(path);
  if (!access) return path === "/home";
  if (path === VETERINARY_PATH || path.startsWith(`${VETERINARY_PATH}/`)) return !!access.veterinary;
  if (access.role === "veterinarian") {
    return ["/home/profile", "/home/notifications", "/home/suporte"].some(prefix => path === prefix || path.startsWith(`${prefix}/`));
  }
  if (access.role === "feeder") {
    return ["/home/profile", "/home/notifications", "/home/suporte"].some(prefix => path === prefix || path.startsWith(`${prefix}/`))
      || ((access.livestock_species || []).includes("bovinos") && path === `${legacyCattleRoot}/racao/tratos`);
  }
  if (access.role !== "operator") {
    return !path.startsWith("/home/usuarios") || access.can_manage_users;
  }
  const personal = ["/home/profile", "/home/notifications", "/home/suporte"];
  if (path === "/home" || path === "/home/agenda" || personal.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) return true;
  const segments = path.split("/");
  if (path.startsWith("/home/plantacoes")) {
    return access.can_operate_crops && !["estrutura", "mao-obra", "colheita", "historico"].includes(segments[4]);
  }
  if (path.startsWith("/home/seguimento/")) {
    if (["vendas", "mao-de-obra"].includes(segments[4])) return false;
    return (access.livestock_species || []).includes(segments[3]);
  }
  return false;
}

export async function getOrganizationAccess() {
  const access = (await apiClient.get<{ access: OrganizationAccess }>("/auth/me/")).data.access;
  setOrganizationOperatorMode(["operator", "feeder"].includes(access.role));
  return access;
}
