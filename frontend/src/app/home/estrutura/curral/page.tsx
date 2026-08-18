"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Beef, CalendarDays, ClipboardList, DollarSign, Pencil, Plus, Search, Trash2, Warehouse } from "lucide-react";

import { apiClient } from "@/services/api";
import { farmStructureService, type FarmStructureItemPayload, type FarmStructurePayload } from "@/services/farmStructureService";
import type { Farm, FarmStructure, FarmStructureItem, FarmStructureSummary } from "@/types";
import { LocationPicker } from "@/components/farm/LocationPicker";
import { useToast } from "@/components/ui/Toast";

import styles from "./curral.module.css";
import axios from "axios";
import type { LucideIcon } from "lucide-react";

interface PaginatedFarms { results: Farm[] }
interface StoredUser { role?: string }

const emptyForm: FarmStructurePayload = {
  farm: "", category: "corral", name: "", description: "", quantity: 1,
  built_area_m2: null, length_m: null, width_m: null,
  acquisition_value: "0.00", current_value: "0.00", acquisition_date: null,
  is_active: true, notes: "", latitude: null, longitude: null,
  last_maintenance_date: null, next_maintenance_date: null, maintenance_notes: "",
};

const emptyItem: FarmStructureItemPayload = { structure: "", name: "", quantity: "1", unit: "un", value: "0.00" };

const money = (value: string | number) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const apiMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error) || !error.response?.data) return fallback;
  const first = Object.entries(error.response.data as Record<string, unknown>)[0];
  if (!first) return fallback;
  const detail = Array.isArray(first[1]) ? first[1][0] : first[1];
  return `${first[0] === "detail" ? "" : `${first[0]}: `}${String(detail)}`;
};

export default function FarmCurralPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmId, setFarmId] = useState("");
  const [structures, setStructures] = useState<FarmStructure[]>([]);
  const [summary, setSummary] = useState<FarmStructureSummary | null>(null);
  
  const [form, setForm] = useState<FarmStructurePayload>(emptyForm);
  const [editing, setEditing] = useState<FarmStructure | null>(null);
  const [selected, setSelected] = useState<FarmStructure | null>(null);
  const [structureItem, setStructureItem] = useState<FarmStructureItemPayload>(emptyItem);
  
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [role] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return (JSON.parse(localStorage.getItem("user") || "{}") as StoredUser).role || ""; } catch { return ""; }
  });
  const canDelete = role === "owner" || role === "admin";

  useEffect(() => {
    let active = true;
    apiClient.get<PaginatedFarms>("/farms/", { params: { page_size: 100 } }).then(({ data }) => {
      if (!active) return;
      const list = data.results || [];
      setFarms(list); 
      setFarmId(list[0]?.id || ""); 
      setForm((value) => ({ ...value, farm: list[0]?.id || "" }));
      if (!list.length) setLoading(false);
    }).catch(() => { if (active) { setError("Não foi possível carregar as fazendas."); setLoading(false); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!farmId) return;
    let active = true;
    Promise.all([farmStructureService.list(farmId), farmStructureService.summary(farmId)])
      .then(([listResponse, summaryResponse]) => { 
        if (active) { 
          const currais = listResponse.data.results.filter((s: FarmStructure) => s.category === "corral");
          setStructures(currais);
          setSummary(summaryResponse.data); // Resumo global ou curral
        } 
      })
      .catch(() => { if (active) setError("Não foi possível carregar os currais."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [farmId]);

  const refresh = async () => {
    const [listResponse, summaryResponse] = await Promise.all([farmStructureService.list(farmId), farmStructureService.summary(farmId)]);
    const currais = listResponse.data.results.filter((s: FarmStructure) => s.category === "corral");
    setStructures(currais); 
    setSummary(summaryResponse.data);
    if (selected) setSelected(currais.find((asset: FarmStructure) => asset.id === selected.id) || null);
  };

  const reportRows = useMemo(() => structures.flatMap((asset) => [
    {
      key: `structure-${asset.id}`,
      kind: "structure" as const,
      asset,
      item: null,
      searchable: `${asset.name} ${asset.description}`,
    },
    ...asset.items.map((material) => ({
      key: `material-${material.id}`,
      kind: "material" as const,
      asset,
      item: material,
      searchable: `material ${material.name} ${asset.name}`,
    })),
  ]), [structures]);

  const filteredReportRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return reportRows.filter((row) => !term || row.searchable.toLocaleLowerCase("pt-BR").includes(term));
  }, [reportRows, search]);

  const lastRegisteredLocation = useMemo(() => {
    const asset = structures.find((item) => item.latitude && item.longitude);
    if (asset) return { latitude: asset.latitude!, longitude: asset.longitude!, label: asset.name };

    const farm = farms.find((item) => item.id === farmId);
    if (farm?.latitude && farm.longitude) return { latitude: farm.latitude, longitude: farm.longitude, label: farm.name };
    return null;
  }, [structures, farmId, farms]);

  const resetForm = () => { 
    setEditing(null); 
    setSelected(null); 
    setForm({ ...emptyForm, farm: farmId }); 
    setStructureItem(emptyItem); 
  };

  const editStructure = (asset: FarmStructure) => {
    setEditing(asset); setSelected(asset); setStructureItem({ ...emptyItem, structure: asset.id });
    setForm({
      farm: asset.farm, category: asset.category, name: asset.name, description: asset.description,
      built_area_m2: asset.built_area_m2, length_m: asset.length_m, width_m: asset.width_m,
      quantity: asset.quantity, acquisition_value: asset.acquisition_value,
      current_value: asset.current_value, acquisition_date: asset.acquisition_date,
      last_maintenance_date: asset.last_maintenance_date, next_maintenance_date: asset.next_maintenance_date,
      maintenance_notes: asset.maintenance_notes,
      is_active: asset.is_active, notes: asset.notes, latitude: asset.latitude, longitude: asset.longitude,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveStructure = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const payload = { ...form, category: "corral" as const };
      const response = editing ? await farmStructureService.update(editing.id, payload) : await farmStructureService.create(payload);
      setEditing(response.data); setSelected(response.data); setStructureItem({ ...emptyItem, structure: response.data.id });
      await refresh();
      showToast(editing ? "Curral atualizado." : "Curral salvo.", "success");
    } catch (err) { 
      const msg = apiMessage(err, "Não foi possível salvar os dados do curral.");
      setError(msg); showToast(msg, "error");
    }
    finally { setSaving(false); }
  };

  const addMaterial = async (event: FormEvent) => {
    event.preventDefault(); if (!selected) return;
    try { 
      await farmStructureService.addItem({ ...structureItem, structure: selected.id }); 
      setStructureItem({ ...emptyItem, structure: selected.id }); 
      await refresh(); 
      showToast("Item adicionado.", "success");
    }
    catch (err) { const msg = apiMessage(err, "Não foi possível adicionar o item."); setError(msg); showToast(msg, "error"); }
  };

  const removeStructure = async (asset: FarmStructure) => {
    if (!confirm(`Excluir o curral ${asset.name}?`)) return;
    try { await farmStructureService.remove(asset.id); if (selected?.id === asset.id) resetForm(); await refresh(); showToast("Curral excluído.", "success"); }
    catch { setError("Não foi possível excluir o curral."); }
  };

  const paid = structures.reduce((total, item) => total + Number(item.acquisition_value) * item.quantity + Number(item.items_value || 0), 0);
  const current = structures.reduce((total, item) => total + Number(item.current_value) * item.quantity, 0);

  return <div className={styles.page}>
    <header className={styles.hero}>
      <div className="d-flex gap-3 align-items-center">
        <button className="btn btn-link text-white p-0" onClick={() => router.push("/home/estrutura")}><ArrowLeft size={28} /></button>
        <Beef size={38} />
        <div><h1>Curral</h1><p>Cadastre currais e estruturas de manejo para bovinos</p></div>
      </div>
      <button className="btn btn-light fw-semibold" onClick={resetForm}><Plus size={17} /> Novo curral</button>
    </header>
    <main className={styles.content}>
      <div className="d-flex justify-content-end mb-3">
        <select className="form-select" style={{ maxWidth: 320 }} value={farmId} onChange={(e) => { setLoading(true); setFarmId(e.target.value); setForm({ ...emptyForm, farm: e.target.value }); }}>
          {farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
        </select>
      </div>
      {error && <div className="alert alert-danger py-2">{error}</div>}
      
      <section className={styles.panel}><h2>1. Dados do curral</h2><form onSubmit={saveStructure}><div className="row g-3">
        <Field label="Nome"><input required className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Curral principal" /></Field>
        <Field label="Quantidade"><input required type="number" min={1} className="form-control" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></Field>
        <Field label="Área construída (m²)"><input type="number" min="0" step="0.01" className="form-control" value={form.built_area_m2 || ""} onChange={(e) => setForm({ ...form, built_area_m2: e.target.value || null })} /></Field>
        <Field label="Data de aquisição"><input type="date" className="form-control" value={form.acquisition_date || ""} onChange={(e) => setForm({ ...form, acquisition_date: e.target.value || null })} /></Field>
        <Field label="Valor pago"><input required type="number" min="0" step="0.01" className="form-control" value={form.acquisition_value} onChange={(e) => setForm({ ...form, acquisition_value: e.target.value })} /></Field>
        <Field label="Valor atual"><input required type="number" min="0" step="0.01" className="form-control" value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })} /></Field>
        <Field label="Situação"><select className="form-select" value={form.is_active ? "active" : "inactive"} onChange={(e) => setForm({ ...form, is_active: e.target.value === "active" })}><option value="active">Ativa</option><option value="inactive">Inativa</option></select></Field>
        <div className="col-md-9"><label className="form-label">Descrição</label><input className="form-control" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        
        <div className="col-12 mt-4 mb-2"><h3 className="h6 fw-bold">Localização (opcional)</h3></div>
        <div className="col-12"><LocationPicker
          latitude={form.latitude}
          longitude={form.longitude}
          lastLocation={lastRegisteredLocation}
          onChange={(latitude, longitude) => setForm((current) => ({ ...current, latitude, longitude }))}
        /></div>
      </div><div className="d-flex justify-content-end gap-2 mt-4"><button type="button" className="btn btn-outline-secondary" onClick={resetForm}>Limpar</button><button className="btn btn-success px-4" disabled={saving || !farmId}>{saving ? "Salvando..." : (editing ? "Atualizar curral" : "Salvar curral")}</button></div></form></section>

      <section className={styles.panel}><div className="d-flex justify-content-between align-items-center"><h2>2. Materiais e itens utilizados</h2>{!selected && <span className="text-muted small">Salve ou selecione um curral primeiro.</span>}</div>
        {selected && <><form className="row g-2 align-items-end mb-3" onSubmit={addMaterial}><div className="col-md-3"><label className="form-label">Item / Material</label><input required className="form-control" value={structureItem.name} onChange={(e) => setStructureItem({ ...structureItem, name: e.target.value })} list="curral-materials" /><datalist id="curral-materials"><option value="Mourão de concreto" /><option value="Tábuas" /><option value="Porteira" /><option value="Bebedouro" /><option value="Cocho" /></datalist></div><div className="col-md-2"><label className="form-label">Unidade</label><select required className="form-select" value={structureItem.unit} onChange={(e) => setStructureItem({ ...structureItem, unit: e.target.value })}><option value="un">un</option><option value="m">m</option><option value="m²">m²</option><option value="m³">m³</option><option value="kg">kg</option><option value="L">L</option><option value="serviço">serviço</option></select></div><div className="col-md-2"><label className="form-label">Qtd.</label><input required type="number" min="0.01" step="0.01" className="form-control" value={structureItem.quantity} onChange={(e) => setStructureItem({ ...structureItem, quantity: e.target.value })} /></div><div className="col-md-3"><label className="form-label">Valor total</label><input type="number" min="0" step="0.01" className="form-control" required value={structureItem.value} onChange={(e) => setStructureItem({ ...structureItem, value: e.target.value })} /></div><div className="col-md-2"><button className="btn btn-outline-success w-100"><Plus size={16} /> Adicionar</button></div></form>
        <div className="table-responsive"><table className="table table-sm align-middle"><thead><tr><th>Material</th><th>Quantidade</th><th>Valor</th><th /></tr></thead><tbody>{selected.items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.quantity} {item.unit}</td><td>{money(item.value)}</td><td className="text-end">{canDelete && <button className="btn btn-sm text-danger" onClick={() => void farmStructureService.removeItem(item.id).then(refresh)}><Trash2 size={15} /></button>}</td></tr>)}</tbody><tfoot><tr className={styles.reportTotal}><td colSpan={2}>Total em materiais</td><td>{money(selected.items_value || 0)}</td><td /></tr></tfoot></table></div></>}
      </section>

      <section className={styles.summary}><Summary icon={ClipboardList} label="Total de currais" value={String(structures.length)} /><Summary icon={DollarSign} label="Valor investido" value={money(paid)} /><Summary icon={Warehouse} label="Valor atual (líquido)" value={money(current)} /></section>

      <section className={styles.panel}><div className="d-flex flex-wrap justify-content-between align-items-center gap-3"><div><h2 className="mb-1">3. Relatório completo de currais e itens</h2><p className="text-muted small mb-0">Relação consolidada dos currais e seus materiais da fazenda selecionada.</p></div><div className={styles.search}><Search size={17} /><input placeholder="Buscar estrutura ou material" value={search} onChange={(e) => setSearch(e.target.value)} /></div></div>
        <div className="table-responsive mt-3">
          <table className="table align-middle">
            <thead><tr><th>Tipo</th><th>Item</th><th>Vinculado a</th><th>Área</th><th>Quantidade</th><th>Valor pago</th><th>Valor atual</th><th /></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-5"><span className="spinner-border spinner-border-sm text-success" /></td></tr>
              ) : filteredReportRows.length ? (
                filteredReportRows.map((row) => row.kind === "structure"
                  ? <StructureReportRow key={row.key} asset={row.asset} canDelete={canDelete} onEdit={editStructure} onRemove={removeStructure} />
                  : <MaterialReportRow key={row.key} asset={row.asset} item={row.item!} canDelete={canDelete} onRemoved={refresh} />
                )
              ) : (
                <tr><td colSpan={8} className="text-center text-muted py-5">Nenhum curral cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="col-md-3"><label className="form-label">{label}</label>{children}</div>; }
function Summary({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) { return <div><Icon size={24} /><span>{label}</span><strong>{value}</strong></div>; }

function StructureReportRow({ asset, canDelete, onEdit, onRemove }: {
  asset: FarmStructure;
  canDelete: boolean;
  onEdit: (asset: FarmStructure) => void;
  onRemove: (asset: FarmStructure) => Promise<void>;
}) {
  return <tr>
    <td><span className="badge bg-success-subtle text-success border border-success-subtle">Curral</span></td>
    <td><strong>{asset.name}</strong>{asset.description && <div className="text-muted small">{asset.description}</div>}</td>
    <td>Estrutura principal</td>
    <td>{asset.built_area_m2 ? `${asset.built_area_m2} m²` : "—"}</td>
    <td>{asset.quantity}</td>
    <td>{money(Number(asset.acquisition_value) * asset.quantity)}</td>
    <td className="text-success fw-semibold">{money(Number(asset.current_value) * asset.quantity)}</td>
    <td className="text-end"><button className="btn btn-sm btn-outline-secondary me-2" onClick={() => onEdit(asset)} title="Editar"><Pencil size={15} /></button>{canDelete && <button className="btn btn-sm btn-outline-danger" onClick={() => void onRemove(asset)} title="Excluir"><Trash2 size={15} /></button>}</td>
  </tr>;
}

function MaterialReportRow({ asset, item, canDelete, onRemoved }: {
  asset: FarmStructure;
  item: FarmStructureItem;
  canDelete: boolean;
  onRemoved: () => Promise<void>;
}) {
  return <tr className={styles.implementRow}>
    <td><span className="badge bg-secondary-subtle text-secondary border">Item utilizado</span></td>
    <td><strong>{item.name}</strong></td>
    <td>{asset.name}</td>
    <td>—</td>
    <td>{item.quantity} {item.unit}</td>
    <td>{money(item.value)}</td>
    <td>—</td>
    <td className="text-end">{canDelete && <button className="btn btn-sm btn-outline-danger" onClick={() => void farmStructureService.removeItem(item.id).then(onRemoved)} title="Excluir item"><Trash2 size={15} /></button>}</td>
  </tr>;
}
