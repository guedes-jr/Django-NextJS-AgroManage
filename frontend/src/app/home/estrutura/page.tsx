"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Beef, Bird, Building2, Calculator, ClipboardList, Droplets, Ellipsis,
  ChevronRight, Info, Pencil, PiggyBank, Plus, Search, Trash2, Warehouse,
  Waves, PanelsTopLeft,
} from "lucide-react";

import { apiClient } from "@/services/api";
import { farmStructureService, type FarmStructureItemPayload, type FarmStructurePayload } from "@/services/farmStructureService";
import type { Farm, FarmStructure, FarmStructureCategory, FarmStructureItem, FarmStructureSummary } from "@/types";
import { LocationPicker } from "@/components/farm/LocationPicker";

import styles from "./structure.module.css";

interface PaginatedFarms { results: Farm[] }
interface StoredUser { role?: string }

const categories: Array<{
  value: FarmStructureCategory;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { value: "corral", label: "Curral", description: "Estruturas de manejo para bovinos e criações de grande porte.", icon: Beef },
  { value: "pigsty", label: "Chiqueiro", description: "Estruturas destinadas à criação e ao manejo de suínos.", icon: PiggyBank },
  { value: "poultry_house", label: "Galinheiro", description: "Instalações para aves, postura, corte e reprodução.", icon: Bird },
  { value: "warehouse", label: "Depósitos e armazéns", description: "Armazenamento de grãos, insumos e materiais.", icon: Warehouse },
  { value: "irrigation", label: "Irrigação", description: "Sistemas e equipamentos de distribuição de água.", icon: Droplets },
  { value: "water_reservoir", label: "Reservatórios e água", description: "Caixas, açudes, reservatórios e captação.", icon: Waves },
  { value: "facility", label: "Instalações", description: "Oficinas, casas, galpões e estruturas elétricas.", icon: Building2 },
  { value: "fence", label: "Cercas e divisões", description: "Cercas, porteiras e divisões internas da propriedade.", icon: PanelsTopLeft },
  { value: "other", label: "Outros", description: "Outras estruturas não enquadradas nas categorias anteriores.", icon: Ellipsis },
];

const emptyForm: FarmStructurePayload = {
  farm: "", category: "corral", name: "", description: "", quantity: 1,
  built_area_m2: null, length_m: null, width_m: null,
  acquisition_value: "0.00", current_value: "0.00", acquisition_date: null,
  is_active: true, notes: "", latitude: null, longitude: null,
};
const emptyItem: FarmStructureItemPayload = { structure: "", name: "", quantity: "1", unit: "un", value: "0.00" };

const money = (value: string | number) => Number(value || 0).toLocaleString("pt-BR", {
  style: "currency", currency: "BRL",
});

export default function FarmStructurePage() {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmId, setFarmId] = useState("");
  const [items, setItems] = useState<FarmStructure[]>([]);
  const [summary, setSummary] = useState<FarmStructureSummary | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<FarmStructureCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FarmStructure | null>(null);
  const [form, setForm] = useState<FarmStructurePayload>(emptyForm);
  const [structureItem, setStructureItem] = useState<FarmStructureItemPayload>(emptyItem);
  const [role] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return (JSON.parse(localStorage.getItem("user") || "{}") as StoredUser).role || ""; }
    catch { return ""; }
  });

  const canDelete = role === "owner" || role === "admin";

  const loadStructures = useCallback(async (selectedFarm: string) => {
    if (!selectedFarm) return;
    setLoading(true);
    setError("");
    try {
      const [listResponse, summaryResponse] = await Promise.all([
        farmStructureService.list(selectedFarm), farmStructureService.summary(selectedFarm),
      ]);
      setItems(listResponse.data.results);
      setSummary(summaryResponse.data);
    } catch {
      setError("Não foi possível carregar a estrutura desta fazenda.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    apiClient.get<PaginatedFarms>("/farms/", { params: { page_size: 100 } })
      .then(({ data }) => {
        if (!active) return;
        const available = data.results || [];
        setFarms(available);
        setFarmId((current) => current || available[0]?.id || "");
        if (!available.length) setLoading(false);
      })
      .catch(() => { if (active) { setError("Não foi possível carregar as fazendas."); setLoading(false); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!farmId) return;
    let active = true;
    Promise.all([farmStructureService.list(farmId), farmStructureService.summary(farmId)])
      .then(([listResponse, summaryResponse]) => {
        if (!active) return;
        setItems(listResponse.data.results);
        setSummary(summaryResponse.data);
      })
      .catch(() => { if (active) setError("Não foi possível carregar a estrutura desta fazenda."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [farmId]);

  const categorySummary = useMemo(() => new Map(
    (summary?.categories || []).map((category) => [category.category, category]),
  ), [summary]);

  const reportRows = useMemo(() => items
    .filter((structure) => selectedCategory === "all" || structure.category === selectedCategory)
    .flatMap((structure) => [
      {
        key: `structure-${structure.id}`,
        kind: "structure" as const,
        structure,
        material: null,
        searchable: `${structure.name} ${structure.description} ${structure.category_label}`,
      },
      ...structure.items.map((material) => ({
        key: `material-${material.id}`,
        kind: "material" as const,
        structure,
        material,
        searchable: `${material.name} ${material.unit} ${structure.name} ${structure.category_label}`,
      })),
    ]), [items, selectedCategory]);

  const filteredReportRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return reportRows.filter((row) => !term || row.searchable.toLocaleLowerCase("pt-BR").includes(term));
  }, [reportRows, search]);

  const lastRegisteredLocation = useMemo(() => {
    const item = items.find((structure) => structure.latitude && structure.longitude);
    if (item) return { latitude: item.latitude!, longitude: item.longitude!, label: item.name };

    const farm = farms.find((candidate) => candidate.id === farmId);
    if (farm?.latitude && farm.longitude) {
      return { latitude: farm.latitude, longitude: farm.longitude, label: farm.name };
    }
    return null;
  }, [farmId, farms, items]);

  const openCreate = (category: FarmStructureCategory = "corral") => {
    setEditing(null);
    setForm({
      ...emptyForm,
      farm: farmId,
      category,
      latitude: lastRegisteredLocation?.latitude || null,
      longitude: lastRegisteredLocation?.longitude || null,
    });
    setStructureItem(emptyItem);
    setShowForm(true);
  };

  const openEdit = (item: FarmStructure) => {
    setEditing(item);
    setForm({
      farm: item.farm, category: item.category, name: item.name, description: item.description,
      built_area_m2: item.built_area_m2, length_m: item.length_m, width_m: item.width_m,
      quantity: item.quantity, acquisition_value: item.acquisition_value,
      current_value: item.current_value, acquisition_date: item.acquisition_date,
      is_active: item.is_active, notes: item.notes, latitude: item.latitude, longitude: item.longitude,
    });
    setStructureItem({ ...emptyItem, structure: item.id });
    setShowForm(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = editing
        ? await farmStructureService.update(editing.id, form)
        : await farmStructureService.create(form);
      setEditing(response.data);
      setStructureItem({ ...emptyItem, structure: response.data.id });
      await loadStructures(farmId);
    } catch {
      setError("Não foi possível salvar. Verifique os dados e suas permissões.");
    } finally {
      setSaving(false);
    }
  };

  const addStructureItem = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    try {
      await farmStructureService.addItem({ ...structureItem, structure: editing.id });
      const list = await farmStructureService.list(farmId);
      const updated = list.data.results.find((item) => item.id === editing.id) || null;
      setItems(list.data.results); setEditing(updated);
      setStructureItem({ ...emptyItem, structure: editing.id });
      const totals = await farmStructureService.summary(farmId); setSummary(totals.data);
    } catch { setError("Não foi possível adicionar o item utilizado."); }
  };

  const remove = async (item: FarmStructure) => {
    if (!confirm(`Excluir a estrutura “${item.name}”?`)) return;
    try {
      await farmStructureService.remove(item.id);
      await loadStructures(farmId);
    } catch {
      setError("Não foi possível excluir esta estrutura.");
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className="d-flex align-items-center gap-3">
          <div className={styles.heroIcon}><Warehouse size={30} /></div>
          <div><h1>Estrutura da Fazenda</h1><p>Cadastre e gerencie toda a estrutura da propriedade</p></div>
        </div>
        <button className="btn btn-light d-flex align-items-center gap-2 fw-semibold" onClick={() => openCreate()} disabled={!farmId}>
          <Plus size={18} /> Nova estrutura
        </button>
      </header>

      <div className={styles.content}>
        <div className={`${styles.infoBar} d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3`}>
          <div className={styles.info}><Info size={21} /><span><strong>Organize a estrutura da fazenda por categorias.</strong><br />Cada item fica vinculado à propriedade selecionada.</span></div>
          <select className="form-select" style={{ maxWidth: 320 }} value={farmId} onChange={(event) => { setLoading(true); setFarmId(event.target.value); }}>
            {farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
          </select>
        </div>

        {error && <div className="alert alert-danger py-2">{error}</div>}
        {!farms.length && !loading && <div className="alert alert-warning">Cadastre uma fazenda antes de adicionar estruturas.</div>}

        <section className={styles.categorySection}>
          <h2 className={styles.sectionTitle}>Categorias da estrutura</h2>
          <div className={styles.categoryGrid}>
            {categories.map(({ value, label, description, icon: Icon }) => {
              const data = categorySummary.get(value);
              return (
                <button key={value} className={`${styles.categoryCard} ${selectedCategory === value ? styles.selected : ""}`}
                  onClick={() => setSelectedCategory(selectedCategory === value ? "all" : value)}>
                  <div className={styles.categoryMain}><div className={styles.categoryIcon}><Icon size={34} /></div><div><h3>{label}</h3><p>{description}</p></div></div>
                  <div className={styles.categoryFooter}>
                    <span><ClipboardList size={16} /> {data?.items || 0} itens cadastrados</span>
                    <strong>{money(data?.current_value || 0)} <ChevronRight size={16} /></strong>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-4" style={{ order: 4 }}>
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
            <div>
              <h2 className={`${styles.sectionTitle} mb-1`}>Relatório completo das estruturas e itens</h2>
              <p className="text-muted small mb-0">Todas as estruturas e todos os materiais utilizados na fazenda selecionada.</p>
            </div>
            <div className={styles.search}><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar estrutura ou item" /></div>
          </div>
          <div className={styles.tableCard}>
            <div className="table-responsive"><table className="table align-middle mb-0">
              <thead><tr><th>Tipo</th><th>Estrutura / Item</th><th>Vinculado a</th><th>Área / Unidade</th><th>Quantidade</th><th>Valor pago</th><th>Valor atual</th><th className="text-end">Ações</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={8} className="text-center py-5"><span className="spinner-border spinner-border-sm text-success" /></td></tr>
                  : filteredReportRows.length ? filteredReportRows.map((row) => row.kind === "structure"
                    ? <StructureReportRow key={row.key} structure={row.structure} canDelete={canDelete} onEdit={openEdit} onRemove={remove} />
                    : <MaterialReportRow key={row.key} structure={row.structure} material={row.material!} canDelete={canDelete} onRemoved={() => loadStructures(farmId)} />
                  ) : <tr><td colSpan={8} className="text-center text-muted py-5">Nenhuma estrutura ou item encontrado.</td></tr>}
              </tbody>
              {!!items.length && <tfoot><tr className={styles.reportTotal}><td colSpan={4}>Total geral da fazenda</td><td>{reportRows.length} registros</td><td>{money(summary?.acquisition_value || 0)}</td><td>{money(summary?.current_value || 0)}</td><td /></tr></tfoot>}
            </table></div>
          </div>
        </section>

        <section className="mt-4" style={{ order: 3 }}><h2 className={styles.sectionTitle}>Resumo geral da estrutura</h2><div className={styles.summaryGrid}>
          <SummaryCard icon={ClipboardList} label="Total de itens" value={String(summary?.total_items || 0)} detail={`${summary?.total_records || 0} registros`} />
          <SummaryCard icon={Calculator} label="Valor total pago" value={money(summary?.acquisition_value || 0)} detail="Valor de aquisição" />
          <SummaryCard icon={Droplets} label="Depreciação acumulada" value={money(summary?.depreciation_value || 0)} detail="Até o momento" />
          <SummaryCard icon={Warehouse} label="Valor líquido atual" value={money(summary?.current_value || 0)} detail="Estrutura atual" />
        </div></section>
      </div>

      {showForm && <div className={styles.modalBackdrop} onMouseDown={() => setShowForm(false)}><div className={styles.modalCard} onMouseDown={(event) => event.stopPropagation()}>
        <div className="d-flex justify-content-between align-items-center border-bottom p-4"><div><h2 className="h4 fw-bold mb-1">{editing ? "Editar estrutura" : "Nova estrutura"}</h2><p className="text-muted small mb-0">Informe os dados patrimoniais da estrutura.</p></div><button className="btn-close" onClick={() => setShowForm(false)} /></div>
        <form onSubmit={submit}><div className="p-4 row g-3">
          <div className="col-md-7"><label className="form-label">Nome</label><input required className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="col-md-5"><label className="form-label">Categoria</label><select className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as FarmStructureCategory })}>{categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></div>
          <div className="col-12"><label className="form-label">Descrição</label><textarea className="form-control" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="col-md-4"><label className="form-label">Área construída (m²)</label><input type="number" min={0} step="0.01" className="form-control" value={form.built_area_m2 || ""} onChange={(e) => setForm({ ...form, built_area_m2: e.target.value || null })} /></div>
          <div className="col-md-4"><label className="form-label">Comprimento (m)</label><input type="number" min={0} step="0.01" className="form-control" value={form.length_m || ""} onChange={(e) => setForm({ ...form, length_m: e.target.value || null })} /></div>
          <div className="col-md-4"><label className="form-label">Largura (m)</label><input type="number" min={0} step="0.01" className="form-control" value={form.width_m || ""} onChange={(e) => setForm({ ...form, width_m: e.target.value || null })} /></div>
          <div className="col-md-3"><label className="form-label">Quantidade</label><input required min={1} type="number" className="form-control" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></div>
          <div className="col-md-3"><label className="form-label">Valor unitário pago</label><input required min={0} step="0.01" type="number" className="form-control" value={form.acquisition_value} onChange={(e) => setForm({ ...form, acquisition_value: e.target.value })} /></div>
          <div className="col-md-3"><label className="form-label">Valor unitário atual</label><input required min={0} step="0.01" type="number" className="form-control" value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })} /></div>
          <div className="col-md-3"><label className="form-label">Aquisição</label><input type="date" className="form-control" value={form.acquisition_date || ""} onChange={(e) => setForm({ ...form, acquisition_date: e.target.value || null })} /></div>
          <div className="col-12"><label className="form-label">Observações</label><textarea className="form-control" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="col-12">
            <LocationPicker
              latitude={form.latitude}
              longitude={form.longitude}
              lastLocation={lastRegisteredLocation}
              onChange={(latitude, longitude) => setForm((current) => ({ ...current, latitude, longitude }))}
            />
          </div>
        </div><div className="border-top p-3 d-flex justify-content-end gap-2"><button type="button" className="btn btn-outline-secondary" onClick={() => setShowForm(false)}>Cancelar</button><button className="btn btn-success" disabled={saving}>{saving ? "Salvando..." : "Salvar estrutura"}</button></div></form>
        <div className="border-top p-4"><div className="d-flex justify-content-between align-items-center mb-3"><h3 className="h6 fw-bold text-success mb-0">Itens e materiais utilizados</h3>{!editing && <span className="small text-muted">Salve a estrutura para adicionar itens.</span>}</div>
          {editing && <><form className="row g-2 align-items-end" onSubmit={addStructureItem}><div className="col-md-4"><label className="form-label">Item</label><input required className="form-control" value={structureItem.name} onChange={(e) => setStructureItem({ ...structureItem, name: e.target.value })} /></div><div className="col-md-2"><label className="form-label">Quantidade</label><input required type="number" min="0.01" step="0.01" className="form-control" value={structureItem.quantity} onChange={(e) => setStructureItem({ ...structureItem, quantity: e.target.value })} /></div><div className="col-md-2"><label className="form-label">Unidade</label><input required className="form-control" value={structureItem.unit} onChange={(e) => setStructureItem({ ...structureItem, unit: e.target.value })} /></div><div className="col-md-2"><label className="form-label">Valor total</label><input required type="number" min="0" step="0.01" className="form-control" value={structureItem.value} onChange={(e) => setStructureItem({ ...structureItem, value: e.target.value })} /></div><div className="col-md-2"><button className="btn btn-outline-success w-100"><Plus size={16} /> Adicionar</button></div></form>
          <div className="table-responsive mt-3"><table className="table table-sm"><thead><tr><th>Item</th><th>Quantidade</th><th>Valor</th><th /></tr></thead><tbody>{editing.items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.quantity} {item.unit}</td><td>{money(item.value)}</td><td className="text-end">{canDelete && <button className="btn btn-sm text-danger" onClick={() => void farmStructureService.removeItem(item.id).then(() => loadStructures(farmId))}><Trash2 size={14} /></button>}</td></tr>)}</tbody></table></div></>}
        </div>
      </div></div>}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return <div className={styles.summaryCard}><div className={styles.summaryIcon}><Icon size={25} /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>;
}

function StructureReportRow({ structure, canDelete, onEdit, onRemove }: {
  structure: FarmStructure;
  canDelete: boolean;
  onEdit: (structure: FarmStructure) => void;
  onRemove: (structure: FarmStructure) => Promise<void>;
}) {
  return <tr>
    <td><span className="badge bg-success-subtle text-success border border-success-subtle">{structure.category_label}</span></td>
    <td><strong>{structure.name}</strong>{structure.description && <div className="text-muted small">{structure.description}</div>}</td>
    <td>Estrutura principal</td>
    <td>{structure.built_area_m2 ? `${structure.built_area_m2} m²` : "—"}</td>
    <td>{structure.quantity}</td>
    <td>{money(Number(structure.acquisition_value) * structure.quantity)}</td>
    <td className="text-success fw-semibold">{money(Number(structure.current_value) * structure.quantity)}</td>
    <td className="text-end"><button className="btn btn-sm btn-outline-secondary me-2" onClick={() => onEdit(structure)} title="Editar"><Pencil size={15} /></button>{canDelete && <button className="btn btn-sm btn-outline-danger" onClick={() => void onRemove(structure)} title="Excluir"><Trash2 size={15} /></button>}</td>
  </tr>;
}

function MaterialReportRow({ structure, material, canDelete, onRemoved }: {
  structure: FarmStructure;
  material: FarmStructureItem;
  canDelete: boolean;
  onRemoved: () => Promise<void>;
}) {
  return <tr className={styles.materialRow}>
    <td><span className="badge bg-secondary-subtle text-secondary border">Item utilizado</span></td>
    <td><strong>{material.name}</strong></td>
    <td>{structure.name} <div className="text-muted small">{structure.category_label}</div></td>
    <td>{material.unit}</td>
    <td>{material.quantity}</td>
    <td>{money(material.value)}</td>
    <td>—</td>
    <td className="text-end">{canDelete && <button className="btn btn-sm btn-outline-danger" onClick={() => void farmStructureService.removeItem(material.id).then(onRemoved)} title="Excluir item"><Trash2 size={15} /></button>}</td>
  </tr>;
}
