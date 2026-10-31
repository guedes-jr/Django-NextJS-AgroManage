import { apiClient } from "./api";

export type StockLot = { id: string; numero_lote: string; quantidade_atual: string; ativo: boolean };
export async function getStockLots(item: string): Promise<StockLot[]> {
  const lots: StockLot[] = [];
  let page = 1;
  while (true) {
    const { data } = await apiClient.get("/inventory/lotes/", { params: { item, page } });
    if (Array.isArray(data)) return data;
    lots.push(...data.results);
    if (!data.next) return lots;
    page += 1;
  }
}
export async function recordStockCount(lot: StockLot, quantity: string, reason: string) {
  await apiClient.post(`/inventory/lotes/${lot.id}/ajustar-estoque/`, {
    quantidade_contada: quantity, saldo_esperado: lot.quantidade_atual, motivo: reason,
  });
}
