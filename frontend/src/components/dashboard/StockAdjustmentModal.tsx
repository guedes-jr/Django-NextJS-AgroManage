"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { Modal } from "@/components/ui/Modal";
import { getStockLots, recordStockCount, StockLot } from "@/services/stockAdjustmentService";

type Item = { id: string; nome: string; unidade_medida: string };
export function StockAdjustmentModal({ items, onClose, onSaved }: {
  items: Item[]; onClose: () => void; onSaved: () => void;
}) {
  const [itemId, setItemId] = useState("");
  const [lots, setLots] = useState<StockLot[]>([]);
  const [lotId, setLotId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lot = lots.find(value => value.id === lotId);
  const unit = items.find(value => value.id === itemId)?.unidade_medida;
  const difference = lot && quantity !== "" ? Number(quantity) - Number(lot.quantidade_atual) : null;

  useEffect(() => {
    let cancelled = false;
    if (!itemId) return;
    getStockLots(itemId).then(values => { if (!cancelled) setLots(values); })
      .catch(() => { if (!cancelled) setError("Não foi possível carregar os lotes."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [itemId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!lot || saving) return;
    setSaving(true); setError("");
    try {
      await recordStockCount(lot, quantity, reason.trim());
      onSaved();
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 409) {
        setLots([]); setLotId(""); setQuantity("");
        setError("O saldo mudou. Confira a contagem com o saldo atualizado e selecione o lote novamente.");
        try { setLots(await getStockLots(itemId)); } catch { setError("Não foi possível atualizar os lotes. Feche e tente novamente."); }
      } else {
        setError("Não foi possível registrar o ajuste. Confira a contagem e o motivo e tente novamente.");
      }
    } finally { setSaving(false); }
  }

  return <Modal isOpen onClose={() => { if (!saving) onClose(); }} title="Ajuste de inventário"
    description="Informe a contagem física. A diferença será registrada no histórico, com responsável e motivo.">
    <form onSubmit={submit} className="p-3 p-md-4 d-flex flex-column gap-3">
      {error && <div className="alert alert-danger mb-0" role="alert">{error}</div>}
      <label className="form-label mb-0">Produto
        <select className="form-select mt-1" required value={itemId} disabled={saving} onChange={e => { setItemId(e.target.value); setLots([]); setLotId(""); setQuantity(""); setError(""); setLoading(!!e.target.value); }}>
          <option value="">Selecione o produto</option>
          {items.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}
        </select>
      </label>
      <label className="form-label mb-0">Lote
        <select className="form-select mt-1" required value={lotId} disabled={loading || saving || !itemId} onChange={e => { setLotId(e.target.value); setQuantity(""); }}>
          <option value="">{loading ? "Carregando…" : "Selecione o lote"}</option>
          {lots.map(value => <option key={value.id} value={value.id}>{value.numero_lote || "Sem número"}{!value.ativo ? " (inativo)" : ""} — {Number(value.quantidade_atual).toLocaleString("pt-BR")} {unit}</option>)}
        </select>
        {itemId && !loading && lots.length === 0 && <small className="text-muted">Nenhum lote disponível. Registre uma entrada para criar o lote.</small>}
      </label>
      {lot && <p className="mb-0">Saldo atual: <strong>{Number(lot.quantidade_atual).toLocaleString("pt-BR")} {unit}</strong></p>}
      <label className="form-label mb-0">Quantidade contada ({unit || "unidades"})
        <input className="form-control mt-1" type="number" min="0" step="0.01" required disabled={saving || !lot} value={quantity} onChange={e => setQuantity(e.target.value)} />
      </label>
      {difference !== null && <p className="mb-0" aria-live="polite">Diferença a lançar: <strong>{difference > 0 ? "+" : ""}{difference.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {unit}</strong></p>}
      <label className="form-label mb-0">Motivo do ajuste
        <textarea className="form-control mt-1" required maxLength={1000} rows={3} disabled={saving} value={reason} onChange={e => setReason(e.target.value)} />
      </label>
      <button className="btn btn-primary" disabled={saving || !lot || difference === 0 || !reason.trim()}>{saving ? "Registrando…" : "Registrar ajuste"}</button>
    </form>
  </Modal>;
}
