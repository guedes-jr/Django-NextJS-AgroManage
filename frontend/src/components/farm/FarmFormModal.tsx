"use client";

import { useState } from "react";
import { Building2, FileText, MapPin, Ruler } from "lucide-react";
import { apiClient } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { Farm } from "@/types";

export type CreatedFarm = Farm;
type Props = { isOpen: boolean; onClose: () => void; onCreated: (farm: CreatedFarm) => void | Promise<void> };
const emptyForm = { name: "", code: "", total_area_ha: "", city: "", state: "", address: "", notes: "" };

function apiError(error: unknown) {
  if (!error || typeof error !== "object" || !("response" in error)) return "Não foi possível cadastrar a propriedade.";
  const data = (error.response as { data?: Record<string, unknown> }).data;
  const first = data && Object.entries(data)[0];
  if (!first) return "Não foi possível cadastrar a propriedade.";
  const detail = Array.isArray(first[1]) ? first[1][0] : first[1];
  return `${first[0] === "detail" ? "" : `${first[0]}: `}${String(detail)}`;
}

export function FarmFormModal({ isOpen, onClose, onCreated }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const close = () => { if (!saving) { setForm(emptyForm); setError(""); onClose(); } };
  const submit = async () => {
    if (!form.name.trim()) return setError("Informe o nome da propriedade.");
    try {
      setSaving(true); setError("");
      const { data } = await apiClient.post<CreatedFarm>("/farms/", { ...form, name: form.name.trim(), code: form.code.trim(), city: form.city.trim(), state: form.state.trim().toUpperCase(), address: form.address.trim(), notes: form.notes.trim(), total_area_ha: form.total_area_ha ? Number(form.total_area_ha) : null });
      await onCreated(data); setForm(emptyForm); onClose();
    } catch (requestError) { setError(apiError(requestError)); }
    finally { setSaving(false); }
  };
  return <Modal isOpen={isOpen} onClose={close} title="Nova Propriedade" description="Cadastre a fazenda para liberar talhões, plantações e estruturas." maxWidth="max-w-2xl" footer={<div className="d-flex flex-column flex-md-row gap-2 w-100 justify-content-end"><Button variant="outline-secondary" onClick={close} disabled={saving}>Cancelar</Button><Button onClick={submit} disabled={saving} className="px-5 fw-bold" style={{ background: "var(--primary)", color: "white" }}>{saving ? "Salvando..." : "Cadastrar propriedade"}</Button></div>}>
    <div className="p-4 p-md-5">{error && <div className="alert alert-danger small" role="alert">{error}</div>}<div className="row g-3">
      <div className="col-md-8"><label className="form-label fw-bold">Nome da propriedade *</label><div className="login-input-wrapper"><input autoFocus required className="login-input login-input-icon-left bg-white text-foreground" placeholder="Ex.: Fazenda Boa Esperança" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><Building2 className="login-input-icon text-muted-foreground" size={16} /></div></div>
      <div className="col-md-4"><label className="form-label fw-bold">Código / CAR</label><div className="login-input-wrapper"><input className="login-input login-input-icon-left bg-white text-foreground" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /><FileText className="login-input-icon text-muted-foreground" size={16} /></div></div>
      <div className="col-md-4"><label className="form-label fw-bold">Área total (ha)</label><div className="login-input-wrapper"><input type="number" min="0" step="0.01" className="login-input login-input-icon-left bg-white text-foreground" value={form.total_area_ha} onChange={(e) => setForm({ ...form, total_area_ha: e.target.value })} /><Ruler className="login-input-icon text-muted-foreground" size={16} /></div></div>
      <div className="col-md-5"><label className="form-label fw-bold">Cidade</label><input className="form-control" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
      <div className="col-md-3"><label className="form-label fw-bold">UF</label><input className="form-control text-uppercase" maxLength={2} placeholder="PE" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
      <div className="col-12"><label className="form-label fw-bold">Endereço</label><div className="login-input-wrapper"><input className="login-input login-input-icon-left bg-white text-foreground" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /><MapPin className="login-input-icon text-muted-foreground" size={16} /></div></div>
      <div className="col-12"><label className="form-label fw-bold">Observações</label><textarea className="form-control" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
    </div></div>
  </Modal>;
}
