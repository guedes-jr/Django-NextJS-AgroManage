export interface ReproductiveCycle {
  mating_date?: string; birth_date?: string; weaning_date?: string; heat_return_date?: string;
  status?: string; pregnancy_status?: string; pregnancy_confirmed?: boolean;
  live_born?: number; stillborn?: number; mummified?: number; total_born?: number; mortality?: number;
  avg_birth_weight_kg?: number; weaned_quantity?: number; avg_weaning_weight_kg?: number; lactation_days?: number;
}
export interface ReproductiveFemale {
  id: string; farm: string; category: string; status: string; reproductive_status: string;
  reproductive_cycles?: ReproductiveCycle[];
}
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const daysBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86400000;
const weighted = (items: { value?: number; quantity?: number }[]) => {
  const known = items.filter(item => item.value != null && Number(item.quantity) > 0);
  const quantity = known.reduce((sum, item) => sum + Number(item.quantity), 0);
  return quantity ? known.reduce((sum, item) => sum + Number(item.value) * Number(item.quantity), 0) / quantity : null;
};
export function reproductiveIndicators(females: ReproductiveFemale[], year: string, farm: string) {
  const selected = females.filter(female => !farm || female.farm === farm);
  const active = selected.filter(female => female.status === "active");
  const matrices = active.filter(female => female.category === "Matriz").length;
  const all = selected.flatMap(female => (female.reproductive_cycles || []).map(cycle => ({ female, cycle })));
  const matings = all.filter(item => item.cycle.mating_date?.startsWith(year));
  const evaluated = matings.filter(item => item.cycle.pregnancy_confirmed || item.cycle.status === "failed");
  const confirmed = evaluated.filter(item => item.cycle.pregnancy_confirmed);
  const resolved = confirmed.filter(item => item.cycle.birth_date || ["lost", "completed"].includes(item.cycle.pregnancy_status || ""));
  const births = all.filter(item => item.cycle.birth_date?.startsWith(year));
  const weanings = all.filter(item => item.cycle.weaning_date?.startsWith(year));
  const sum = (key: keyof ReproductiveCycle, items = births) => items.reduce((sum, item) => sum + Number(item.cycle[key] || 0), 0);
  const birthIntervals = selected.flatMap(female => {
    const dates = (female.reproductive_cycles || []).map(cycle => cycle.birth_date).filter((value): value is string => !!value).sort();
    return dates.slice(1).flatMap((date, index) => date.startsWith(year) ? [daysBetween(dates[index], date)] : []);
  }).filter(value => Number.isFinite(value) && value >= 0);
  // Observed next service is not a recorded heat; name this interval accordingly.
  const weanToMating = selected.flatMap(female => {
    const cycles = (female.reproductive_cycles || []).filter(cycle => cycle.mating_date).sort((a, b) => a.mating_date!.localeCompare(b.mating_date!));
    return cycles.slice(0, -1).flatMap((cycle, index) => {
      const next = cycles[index + 1].mating_date!;
      return cycle.weaning_date && next.startsWith(year) ? [daysBetween(cycle.weaning_date, next)] : [];
    });
  }).filter(value => Number.isFinite(value) && value >= 0);
  const born = sum("live_born"), totalBorn = sum("total_born"), weaned = sum("weaned_quantity", weanings);
  const covered = new Set(matings.filter(item => item.female.status === "active").map(item => item.female.id)).size;
  const weanedMothers = new Set(weanings.map(item => item.female.id)).size;
  return { matrices, active, born, totalBorn, weaned,
    stillborn: sum("stillborn"), mummified: sum("mummified"), mortality: sum("mortality"),
    birthCount: births.length, weanedMothers,
    coverageRate: active.length ? covered / active.length * 100 : null,
    pregnancyRate: evaluated.length ? confirmed.length / evaluated.length * 100 : null,
    farrowingRate: resolved.length ? resolved.filter(item => item.cycle.birth_date).length / resolved.length * 100 : null,
    birthWeight: weighted(births.map(item => ({ value: item.cycle.avg_birth_weight_kg, quantity: item.cycle.live_born }))),
    weaningWeight: weighted(weanings.map(item => ({ value: item.cycle.avg_weaning_weight_kg, quantity: item.cycle.weaned_quantity }))),
    lactationDays: average(weanings.map(item => item.cycle.lactation_days).filter((value): value is number => value != null)),
    birthInterval: average(birthIntervals), weanToMating: average(weanToMating),
    emptyRate: active.length ? active.filter(item => ["vazia", "aguardando_cobertura"].includes(item.reproductive_status)).length / active.length * 100 : null,
  };
}
