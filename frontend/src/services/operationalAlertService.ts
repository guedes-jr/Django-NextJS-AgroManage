import { getOrganizationAccess } from "./organizationAccess";
import { getReproductionDashboard } from "./livestockService";
import { newestAlerts } from "./operationalAlertPresentation";

export type SystemAlert = {
  id: string; alert_key?: string; text: string; time?: string; type: string;
  species: string; due_date?: string; created_at?: string;
};
export const alertSegments: Record<string, string> = { suinos: "Suinocultura", bovinos: "Bovinos" };

export async function getSystemAlerts(): Promise<SystemAlert[]> {
  const access = await getOrganizationAccess();
  const codes = access.role === "feeder" ? [] : access.role === "operator"
    ? (access.livestock_species || []).filter(code => code in alertSegments) : Object.keys(alertSegments);
  const groups = await Promise.all(codes.map(async species => {
    const data = await getReproductionDashboard(species, true);
    const alerts: Omit<SystemAlert, "species" | "id">[] = [...(data.alerts || []), ...(data.aiSuggestions || []).map((item: { text: string; alert_key?: string }) => ({ ...item, type: "info" }))];
    return alerts.map((alert, index) => ({ ...alert, type: alert.type || "info", species, id: `${species}:${alert.alert_key || index}` }));
  }));
  return newestAlerts(groups.flat());
}
