import { apiClient } from "./api";

export interface NavbarSearchResult {
  id: string;
  kind: "animal" | "batch";
  label: string;
  species: string;
  farm: string;
}
interface SearchPage<T> { results: T[] }
interface AnimalHit { id: string; identifier: string; species_name: string; species_code: string; farm_name: string }
interface BatchHit { id: string; batch_code: string; name?: string; species_code: string; farm_name: string }
const speciesLabels: Record<string, string> = { suinos: "Suínos", bovinos: "Bovinos", aves: "Aves" };
const rows = <T,>(data: SearchPage<T> | T[]) => Array.isArray(data) ? data : data.results;

export async function searchNavbar(query: string, signal: AbortSignal): Promise<NavbarSearchResult[]> {
  const params = { search: query, page_size: 5 };
  const [animals, batches] = await Promise.all([
    apiClient.get<SearchPage<AnimalHit> | AnimalHit[]>("/livestock/animals/", { params, signal }),
    apiClient.get<SearchPage<BatchHit> | BatchHit[]>("/livestock/batches/", { params, signal }),
  ]);
  return [
    ...rows(animals.data).map((animal): NavbarSearchResult => ({
      id: animal.id, kind: "animal", label: animal.identifier,
      species: animal.species_name || speciesLabels[animal.species_code] || animal.species_code,
      farm: animal.farm_name,
    })),
    ...rows(batches.data).map((batch): NavbarSearchResult => ({
      id: batch.id, kind: "batch", label: batch.name ? `${batch.batch_code} · ${batch.name}` : batch.batch_code,
      species: speciesLabels[batch.species_code] || batch.species_code, farm: batch.farm_name,
    })),
  ];
}
