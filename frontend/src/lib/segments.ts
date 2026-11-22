/** Segments that own stock items, feed formulas and finance entries (backend `segmento`). */
export type OwnerSegment = "suinos" | "gado-de-corte" | "pecuaria-leiteira";

/** Segment of a feed/stock screen: swine pages, or the cattle production in focus (beef/dairy). */
export function ownerSegment(species?: string, cattleProduction?: string | null): OwnerSegment | undefined {
  if (species === "suino") return "suinos";
  if (species === "bovino") return cattleProduction === "dairy" ? "pecuaria-leiteira" : "gado-de-corte";
  return undefined;
}

/** Same rule as the backend `item_in_segments`: own segment, or general with a compatible species. */
export function usableBySegment(item: { segmento?: string | null; especie_animal?: string | null }, segment: OwnerSegment) {
  if (item.segmento) return item.segmento === segment;
  const species = segment === "suinos" ? "suino" : "bovino";
  return !item.especie_animal || item.especie_animal === "multiplo" || item.especie_animal === species;
}
