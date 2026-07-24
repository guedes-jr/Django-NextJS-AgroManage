"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, ClipboardList, DollarSign, Pencil, Plus, Search, Tractor, Trash2, Wrench } from "lucide-react";

import { apiClient } from "@/services/api";
import { farmAssetService, type FarmAssetImplementPayload, type FarmAssetPayload } from "@/services/farmAssetService";
import type { Farm, FarmAsset, FarmAssetImplement, FarmAssetSummary, FarmAssetType } from "@/types";
import { LocationPicker } from "@/components/farm/LocationPicker";

import styles from "./machines.module.css";

interface PaginatedFarms { results: Farm[] }
interface StoredUser { role?: string }

const assetTypes: Array<{ value: FarmAssetType; label: string }> = [
  { value: "tractor", label: "Trator" }, { value: "harvester", label: "Colheitadeira" },
  { value: "planter", label: "Plantadeira" }, { value: "sprayer", label: "Pulverizador" },
  { value: "truck", label: "Caminhão" }, { value: "pickup", label: "Caminhonete" },
  { value: "car", label: "Automóvel" }, { value: "motorcycle", label: "Motocicleta" },
  { value: "other", label: "Outro" },
];

const emptyAsset: FarmAssetPayload = {
  farm: "", asset_type: "tractor", brand: "", model: "", manufacture_year: null,
  fuel: "Diesel", traction: "", current_hours: null, power: "", tank_capacity_l: null,
  serial_number: "", transmission: "", acquisition_date: null, acquisition_value: "0.00",
  current_value: "0.00", description: "", latitude: null, longitude: null, is_active: true,
};

const emptyImplement: FarmAssetImplementPayload = {
  asset: "", name: "", brand_model: "", quantity: 1, manufacture_year: null, acquisition_value: "0.00",
};

const money = (value: string | number) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function FarmMachineryPage() {
  const router = useRouter();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmId, setFarmId] = useState("");
  const [assets, setAssets] = useState<FarmAsset[]>([]);
  const [summary, setSummary] = useState<FarmAssetSummary | null>(null);
  const [form, setForm] = useState<FarmAssetPayload>(emptyAsset);
  const [editing, setEditing] = useState<FarmAsset | null>(null);
  const [selected, setSelected] = useState<FarmAsset | null>(null);
  const [implement, setImplement] = useState<FarmAssetImplementPayload>(emptyImplement);
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
      setFarms(list); setFarmId(list[0]?.id || ""); setForm((value) => ({ ...value, farm: list[0]?.id || "" }));
      if (!list.length) setLoading(false);
    }).catch(() => { if (active) { setError("Não foi possível carregar as fazendas."); setLoading(false); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!farmId) return;
    let active = true;
    Promise.all([farmAssetService.list(farmId), farmAssetService.summary(farmId)])
      .then(([list, totals]) => { if (active) { setAssets(list.data.results); setSummary(totals.data); } })
      .catch(() => { if (active) setError("Não foi possível carregar máquinas e veículos."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [farmId]);

  const refresh = async () => {
    const [list, totals] = await Promise.all([farmAssetService.list(farmId), farmAssetService.summary(farmId)]);
    setAssets(list.data.results); setSummary(totals.data);
    if (selected) setSelected(list.data.results.find((asset) => asset.id === selected.id) || null);
  };

  const reportRows = useMemo(() => assets.flatMap((asset) => [
    {
      key: `asset-${asset.id}`,
      kind: "asset" as const,
      asset,
      implement: null,
      searchable: `${asset.asset_type_label} ${asset.brand} ${asset.model} ${asset.serial_number}`,
    },
    ...asset.implements.map((item) => ({
      key: `implement-${item.id}`,
      kind: "implement" as const,
      asset,
      implement: item,
      searchable: `implemento ${item.name} ${item.brand_model} ${asset.brand} ${asset.model}`,
    })),
  ]), [assets]);

  const filteredReportRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return reportRows.filter((row) => !term || row.searchable.toLocaleLowerCase("pt-BR").includes(term));
  }, [reportRows, search]);

  const lastRegisteredLocation = useMemo(() => {
    const asset = assets.find((item) => item.latitude && item.longitude);
    if (asset) return { latitude: asset.latitude!, longitude: asset.longitude!, label: `${asset.brand} ${asset.model}` };

    const farm = farms.find((item) => item.id === farmId);
    if (farm?.latitude && farm.longitude) return { latitude: farm.latitude, longitude: farm.longitude, label: farm.name };
    return null;
  }, [assets, farmId, farms]);

  const resetForm = () => { setEditing(null); setSelected(null); setForm({ ...emptyAsset, farm: farmId }); setImplement(emptyImplement); };
  const editAsset = (asset: FarmAsset) => {
    setEditing(asset); setSelected(asset); setImplement({ ...emptyImplement, asset: asset.id });
    setForm({
      farm: asset.farm, asset_type: asset.asset_type, brand: asset.brand, model: asset.model,
      manufacture_year: asset.manufacture_year, fuel: asset.fuel, traction: asset.traction,
      current_hours: asset.current_hours, power: asset.power, tank_capacity_l: asset.tank_capacity_l,
      serial_number: asset.serial_number, transmission: asset.transmission,
      acquisition_date: asset.acquisition_date, acquisition_value: asset.acquisition_value,
      current_value: asset.current_value, description: asset.description, latitude: asset.latitude,
      longitude: asset.longitude, is_active: asset.is_active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveAsset = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = editing ? await farmAssetService.update(editing.id, form) : await farmAssetService.create(form);
      setEditing(response.data); setSelected(response.data); setImplement({ ...emptyImplement, asset: response.data.id });
      await refresh();
    } catch { setError("Não foi possível salvar os dados da máquina ou veículo."); }
    finally { setSaving(false); }
  };

  const addImplement = async (event: FormEvent) => {
    event.preventDefault(); if (!selected) return;
    try { await farmAssetService.addImplement({ ...implement, asset: selected.id }); setImplement({ ...emptyImplement, asset: selected.id }); await refresh(); }
    catch { setError("Não foi possível adicionar o implemento."); }
  };

  const removeAsset = async (asset: FarmAsset) => {
    if (!confirm(`Excluir ${asset.brand} ${asset.model}?`)) return;
    try { await farmAssetService.remove(asset.id); if (selected?.id === asset.id) resetForm(); await refresh(); }
    catch { setError("Não foi possível excluir o registro."); }
  };

  return <div className={styles.page}>
    <header className={styles.hero}><div className="d-flex gap-3 align-items-center"><button className="btn btn-link text-white p-0" onClick={() => router.push("/home/estrutura")}><ArrowLeft size={28} /></button><Tractor size={38} /><div><h1>Máquinas agrícolas e veículos</h1><p>Cadastre máquinas, implementos e veículos utilizados na fazenda</p></div></div><button className="btn btn-light fw-semibold" onClick={resetForm}><Plus size={17} /> Novo cadastro</button></header>
    <main className={styles.content}>
      <div className="d-flex justify-content-end mb-3"><select className="form-select" style={{ maxWidth: 320 }} value={farmId} onChange={(e) => { setLoading(true); setFarmId(e.target.value); setForm({ ...emptyAsset, farm: e.target.value }); }}>
        {farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select></div>
      {error && <div className="alert alert-danger py-2">{error}</div>}
      <section className={styles.panel}><h2>1. Dados da máquina ou veículo</h2><form onSubmit={saveAsset}><div className="row g-3">
        <Field label="Tipo"><select required className="form-select" value={form.asset_type} onChange={(e) => setForm({ ...form, asset_type: e.target.value as FarmAssetType })}>{assetTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></Field>
        <Field label="Marca"><input required className="form-control" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
        <Field label="Modelo"><input required className="form-control" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
        <Field label="Ano de fabricação"><input type="number" min="1900" max="2100" className="form-control" value={form.manufacture_year || ""} onChange={(e) => setForm({ ...form, manufacture_year: e.target.value ? Number(e.target.value) : null })} /></Field>
        <Field label="Combustível"><input className="form-control" value={form.fuel} onChange={(e) => setForm({ ...form, fuel: e.target.value })} /></Field>
        <Field label="Tração"><input className="form-control" placeholder="Ex.: 4x4" value={form.traction} onChange={(e) => setForm({ ...form, traction: e.target.value })} /></Field>
        <Field label="Horas atuais"><input type="number" min="0" step="0.1" className="form-control" value={form.current_hours || ""} onChange={(e) => setForm({ ...form, current_hours: e.target.value || null })} /></Field>
        <Field label="Potência"><input className="form-control" placeholder="Ex.: 140 cv" value={form.power} onChange={(e) => setForm({ ...form, power: e.target.value })} /></Field>
        <Field label="Capacidade do tanque (L)"><input type="number" min="0" step="0.01" className="form-control" value={form.tank_capacity_l || ""} onChange={(e) => setForm({ ...form, tank_capacity_l: e.target.value || null })} /></Field>
        <Field label="Número de série / Chassi"><input className="form-control" value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} /></Field>
        <Field label="Transmissão"><input className="form-control" value={form.transmission} onChange={(e) => setForm({ ...form, transmission: e.target.value })} /></Field>
        <Field label="Data de aquisição"><input type="date" className="form-control" value={form.acquisition_date || ""} onChange={(e) => setForm({ ...form, acquisition_date: e.target.value || null })} /></Field>
        <Field label="Valor pago"><input required type="number" min="0" step="0.01" className="form-control" value={form.acquisition_value} onChange={(e) => setForm({ ...form, acquisition_value: e.target.value })} /></Field>
        <Field label="Valor atual"><input required type="number" min="0" step="0.01" className="form-control" value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })} /></Field>
        <div className="col-md-6"><label className="form-label">Descrição / observações</label><textarea rows={3} className="form-control" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="col-12"><LocationPicker
          latitude={form.latitude}
          longitude={form.longitude}
          lastLocation={lastRegisteredLocation}
          subjectLabel="máquina ou veículo"
          onChange={(latitude, longitude) => setForm((current) => ({ ...current, latitude, longitude }))}
        /></div>
      </div><div className="d-flex justify-content-end gap-2 mt-4"><button type="button" className="btn btn-outline-secondary" onClick={resetForm}>Limpar</button><button className="btn btn-success px-4" disabled={saving || !farmId}>{saving ? "Salvando..." : "Salvar dados"}</button></div></form></section>

      <section className={styles.panel}><div className="d-flex justify-content-between align-items-center"><h2>2. Implementos vinculados</h2>{!selected && <span className="text-muted small">Salve ou selecione uma máquina primeiro.</span>}</div>
        {selected && <><form className="row g-2 align-items-end mb-3" onSubmit={addImplement}><div className="col-md-3"><label className="form-label">Implemento</label><input required className="form-control" value={implement.name} onChange={(e) => setImplement({ ...implement, name: e.target.value })} /></div><div className="col-md-3"><label className="form-label">Marca / Modelo</label><input className="form-control" value={implement.brand_model} onChange={(e) => setImplement({ ...implement, brand_model: e.target.value })} /></div><div className="col-md-2"><label className="form-label">Quantidade</label><input type="number" min="1" className="form-control" value={implement.quantity} onChange={(e) => setImplement({ ...implement, quantity: Number(e.target.value) })} /></div><div className="col-md-2"><label className="form-label">Valor unitário</label><input type="number" min="0" step="0.01" className="form-control" value={implement.acquisition_value} onChange={(e) => setImplement({ ...implement, acquisition_value: e.target.value })} /></div><div className="col-md-2"><button className="btn btn-outline-success w-100"><Plus size={16} /> Adicionar</button></div></form>
        <div className="table-responsive"><table className="table table-sm align-middle"><thead><tr><th>Implemento</th><th>Marca / Modelo</th><th>Quantidade</th><th>Valor</th><th /></tr></thead><tbody>{selected.implements.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.brand_model || "—"}</td><td>{item.quantity}</td><td>{money(Number(item.acquisition_value) * item.quantity)}</td><td className="text-end">{canDelete && <button className="btn btn-sm text-danger" onClick={() => void farmAssetService.removeImplement(item.id).then(refresh)}><Trash2 size={15} /></button>}</td></tr>)}</tbody></table></div></>}
      </section>

      <section className={styles.summary}><Summary icon={ClipboardList} label="Máquinas e veículos" value={String(summary?.total_assets || 0)} /><Summary icon={Wrench} label="Valor em implementos" value={money(summary?.implements_value || 0)} /><Summary icon={DollarSign} label="Valor total investido" value={money(summary?.total_invested || 0)} /><Summary icon={CalendarDays} label="Valor atual dos bens" value={money(summary?.current_value || 0)} /></section>

      <section className={styles.panel}><div className="d-flex flex-wrap justify-content-between align-items-center gap-3"><div><h2 className="mb-1">3. Relatório completo de máquinas, veículos e implementos</h2><p className="text-muted small mb-0">Relação consolidada de todos os bens agrícolas da fazenda selecionada.</p></div><div className={styles.search}><Search size={17} /><input placeholder="Buscar item, marca, modelo ou chassi" value={search} onChange={(e) => setSearch(e.target.value)} /></div></div>
        <div className="table-responsive mt-3">
          <table className="table align-middle">
            <thead><tr><th>Categoria</th><th>Item</th><th>Vinculado a</th><th>Ano</th><th>Identificação</th><th>Quantidade</th><th>Valor pago</th><th>Valor atual</th><th /></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-5"><span className="spinner-border spinner-border-sm text-success" /></td></tr>
              ) : filteredReportRows.length ? (
                filteredReportRows.map((row) => row.kind === "asset"
                  ? <AssetReportRow key={row.key} asset={row.asset} canDelete={canDelete} onEdit={editAsset} onRemove={removeAsset} />
                  : <ImplementReportRow key={row.key} asset={row.asset} implement={row.implement!} canDelete={canDelete} onRemoved={refresh} />
                )
              ) : (
                <tr><td colSpan={9} className="text-center text-muted py-5">Nenhuma máquina, veículo ou implemento cadastrado.</td></tr>
              )}
            </tbody>
            {!!assets.length && (
              <tfoot>
                <tr className={styles.reportTotal}>
                  <td colSpan={5}>Total geral</td>
                  <td>{(summary?.total_assets || 0) + assets.reduce((total, asset) => total + asset.implements.reduce((sum, item) => sum + item.quantity, 0), 0)} itens</td>
                  <td>{money(summary?.total_invested || 0)}</td>
                  <td>{money(summary?.current_value || 0)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </main>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="col-md-3"><label className="form-label">{label}</label>{children}</div>; }
function Summary({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) { return <div><Icon size={24} /><span>{label}</span><strong>{value}</strong></div>; }

function AssetReportRow({ asset, canDelete, onEdit, onRemove }: {
  asset: FarmAsset;
  canDelete: boolean;
  onEdit: (asset: FarmAsset) => void;
  onRemove: (asset: FarmAsset) => Promise<void>;
}) {
  return <tr>
    <td><span className="badge bg-success-subtle text-success border border-success-subtle">{asset.asset_type_label}</span></td>
    <td><strong>{asset.brand} {asset.model}</strong></td>
    <td>Bem principal</td>
    <td>{asset.manufacture_year || "—"}</td>
    <td><span className="small">{asset.serial_number || "Sem chassi/série"}</span></td>
    <td>1</td>
    <td>{money(asset.acquisition_value)}</td>
    <td className="text-success fw-semibold">{money(asset.current_value)}</td>
    <td className="text-end"><button className="btn btn-sm btn-outline-secondary me-2" onClick={() => onEdit(asset)} title="Editar"><Pencil size={15} /></button>{canDelete && <button className="btn btn-sm btn-outline-danger" onClick={() => void onRemove(asset)} title="Excluir"><Trash2 size={15} /></button>}</td>
  </tr>;
}

function ImplementReportRow({ asset, implement, canDelete, onRemoved }: {
  asset: FarmAsset;
  implement: FarmAssetImplement;
  canDelete: boolean;
  onRemoved: () => Promise<void>;
}) {
  return <tr className={styles.implementRow}>
    <td><span className="badge bg-secondary-subtle text-secondary border">Implemento</span></td>
    <td><strong>{implement.name}</strong>{implement.brand_model && <div className="text-muted small">{implement.brand_model}</div>}</td>
    <td>{asset.brand} {asset.model}</td>
    <td>{implement.manufacture_year || "—"}</td>
    <td>—</td>
    <td>{implement.quantity}</td>
    <td>{money(Number(implement.acquisition_value) * implement.quantity)}</td>
    <td>—</td>
    <td className="text-end">{canDelete && <button className="btn btn-sm btn-outline-danger" onClick={() => void farmAssetService.removeImplement(implement.id).then(onRemoved)} title="Excluir implemento"><Trash2 size={15} /></button>}</td>
  </tr>;
}
