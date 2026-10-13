import { apiClient } from "./api";
import { canAccessOrganizationPath, type OrganizationAccess } from "./organizationAccess";

export interface NavbarSearchResult {
  id: string;
  kind: "animal" | "batch" | "inventory" | "structure";
  label: string;
  species: string;
  farm: string;
  href?: string;
}
interface SearchPage<T> { results: T[] }
interface AnimalHit { id: string; identifier: string; species_name: string; species_code: string; farm_name: string }
interface BatchHit { id: string; batch_code: string; name?: string; species_code: string; farm_name: string }
interface InventoryHit { id: string; nome: string; categoria_display: string; unidade_medida_display: string }
interface StructureHit { id: string; name: string; category_label: string; farm: string; farm_name: string }
const speciesLabels: Record<string, string> = { suinos: "Suínos", bovinos: "Bovinos", aves: "Aves" };
const rows = <T,>(data: SearchPage<T> | T[]) => Array.isArray(data) ? data : data.results;

export async function searchNavbar(query: string, signal: AbortSignal, access: OrganizationAccess): Promise<NavbarSearchResult[]> {
  const params = { search: query, page_size: 5 };
  const requests: Promise<NavbarSearchResult[]>[] = [];
  if (access.role !== "operator" || access.livestock_species?.length) {
    requests.push(
      apiClient.get<SearchPage<AnimalHit> | AnimalHit[]>("/livestock/animals/", { params, signal })
        .then(({ data }) => rows(data).map((animal): NavbarSearchResult => ({
          id: animal.id, kind: "animal", label: animal.identifier,
          species: animal.species_name || speciesLabels[animal.species_code] || animal.species_code,
          farm: animal.farm_name,
        }))),
      apiClient.get<SearchPage<BatchHit> | BatchHit[]>("/livestock/batches/", { params, signal })
        .then(({ data }) => rows(data).map((batch): NavbarSearchResult => ({
          id: batch.id, kind: "batch", label: batch.name ? `${batch.batch_code} · ${batch.name}` : batch.batch_code,
          species: speciesLabels[batch.species_code] || batch.species_code, farm: batch.farm_name,
        }))),
    );
  }
  if (canAccessOrganizationPath(access, "/home/estoque/produtos")) {
    requests.push(apiClient.get<SearchPage<InventoryHit> | InventoryHit[]>("/inventory/items/", { params, signal })
      .then(({ data }) => rows(data).map((item): NavbarSearchResult => ({
        id: item.id, kind: "inventory", label: item.nome,
        species: item.categoria_display, farm: "",
        href: `/home/estoque/produtos?${new URLSearchParams({ search: item.nome })}`,
      }))));
  }
  if (canAccessOrganizationPath(access, "/home/estrutura")) {
    requests.push(apiClient.get<SearchPage<StructureHit> | StructureHit[]>("/farms/structures/", { params, signal })
      .then(({ data }) => rows(data).map((structure): NavbarSearchResult => ({
        id: structure.id, kind: "structure", label: structure.name,
        species: structure.category_label, farm: structure.farm_name,
        href: `/home/estrutura?${new URLSearchParams({ search: structure.name, farm: structure.farm })}`,
      }))));
  }
  return (await Promise.all(requests)).flat();
}
