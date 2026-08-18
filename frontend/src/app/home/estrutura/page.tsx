"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import type { LucideIcon } from "lucide-react";
import {
  Beef, Bird, Building2, Calculator, ClipboardList, Droplets, Ellipsis,
  ChevronRight, Info, Pencil, PiggyBank, Plus, Search, Trash2, Warehouse,
  Waves, PanelsTopLeft, Tractor, X, BarChart3, ListChecks, MapPinned, CalendarClock, CircleAlert, MapPin, Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { apiClient } from "@/services/api";
import { farmStructureService, type FarmStructureItemPayload, type FarmStructurePayload } from "@/services/farmStructureService";
import type { Farm, FarmStructure, FarmStructureCategory, FarmStructureItem, FarmStructureSummary } from "@/types";
import { LocationPicker } from "@/components/farm/LocationPicker";
import { FarmFormModal, type CreatedFarm } from "@/components/farm/FarmFormModal";
import { useToast } from "@/components/ui/Toast";

import styles from "./structure.module.css";

interface PaginatedFarms { results: Farm[] }
interface StoredUser { role?: string }

const categories: Array<{
  value: FarmStructureCategory;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { value: "pigsty", label: "Chiqueiro", description: "Estruturas destinadas à criação e ao manejo de suínos.", icon: PiggyBank },
  { value: "poultry_house", label: "Galinheiro", description: "Instalações para aves, postura, corte e reprodução.", icon: Bird },
  { value: "warehouse", label: "Depósitos e armazéns", description: "Armazenamento de grãos, insumos e materiais.", icon: Warehouse },
  { value: "irrigation", label: "Irrigação", description: "Sistemas e equipamentos de distribuição de água.", icon: Droplets },
  { value: "water_reservoir", label: "Reservatórios e água", description: "Caixas, açudes, reservatórios e captação.", icon: Waves },
  { value: "facility", label: "Instalações", description: "Oficinas, casas, galpões e estruturas elétricas.", icon: Building2 },
  { value: "fence", label: "Cercas e divisões", description: "Cercas, porteiras e divisões internas da propriedade.", icon: PanelsTopLeft },
  { value: "other", label: "Outros", description: "Outras estruturas não enquadradas nas categorias anteriores.", icon: Ellipsis },
];

const categoryDefaults: Record<FarmStructureCategory, { name: string; materials: string[] }> = {
  corral: { name: "Novo curral", materials: ["Mourão de concreto", "Tábuas", "Porteira", "Bebedouro", "Cocho"] },
  pigsty: { name: "Novo chiqueiro", materials: ["Piso de concreto", "Parede de alvenaria", "Cobertura", "Bebedouro", "Comedouro"] },
  poultry_house: { name: "Novo galinheiro", materials: ["Tela galvanizada", "Cobertura", "Poleiro", "Bebedouro", "Comedouro"] },
  warehouse: { name: "Novo depósito ou armazém", materials: ["Piso de concreto", "Estrutura metálica", "Cobertura", "Portão", "Prateleira"] },
  irrigation: { name: "Novo sistema de irrigação", materials: ["Tubulação", "Bomba d'água", "Aspersor", "Filtro", "Registro"] },
  water_reservoir: { name: "Novo reservatório", materials: ["Reservatório", "Tubulação", "Bomba d'água", "Boia", "Registro"] },
  facility: { name: "Nova instalação", materials: ["Alvenaria", "Cobertura", "Instalação elétrica", "Porta", "Janela"] },
  fence: { name: "Nova cerca ou divisão", materials: ["Mourão", "Arame", "Grampo", "Porteira", "Esticador"] },
  other: { name: "Nova estrutura", materials: ["Material de construção", "Mão de obra", "Equipamento"] },
};

const emptyForm: FarmStructurePayload = {
  farm: "", category: "pigsty", name: "", description: "", quantity: 1,
  built_area_m2: null, length_m: null, width_m: null,
  acquisition_value: "0.00", current_value: "0.00", acquisition_date: null,
  is_active: true, notes: "", latitude: null, longitude: null,
  last_maintenance_date: null, next_maintenance_date: null, maintenance_notes: "",
};
const emptyItem: FarmStructureItemPayload = { structure: "", name: "", quantity: "1", unit: "un", value: "0.00" };

const money = (value: string | number) => Number(value || 0).toLocaleString("pt-BR", {
  style: "currency", currency: "BRL",
});
const apiMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error) || !error.response?.data) return fallback;
  const first = Object.entries(error.response.data as Record<string, unknown>)[0];
  if (!first) return fallback;
  const detail = Array.isArray(first[1]) ? first[1][0] : first[1];
  return `${first[0] === "detail" ? "" : `${first[0]}: `}${String(detail)}`;
};

export default function FarmStructurePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const modalCloseRef = useRef<HTMLButtonElement>(null);
  const modalTriggerRef = useRef<HTMLElement | null>(null);
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
  const [showFarmForm, setShowFarmForm] = useState(false);
  const [editing, setEditing] = useState<FarmStructure | null>(null);
  const [form, setForm] = useState<FarmStructurePayload>(emptyForm);
  const [structureItem, setStructureItem] = useState<FarmStructureItemPayload>(emptyItem);
  const [role] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return (JSON.parse(localStorage.getItem("user") || "{}") as StoredUser).role || ""; }
    catch { return ""; }
  });

  const canDelete = role === "owner" || role === "admin";

  const closeForm = useCallback((force = false) => {
    if (!force && saving) return;
    if (!force && showForm && !editing && form.name && form.name !== categoryDefaults[form.category].name
      && !confirm("Descartar os dados preenchidos desta estrutura?")) return;
    setShowForm(false);
    window.setTimeout(() => modalTriggerRef.current?.focus(), 0);
  }, [editing, form.category, form.name, saving, showForm]);

  useEffect(() => {
    if (!showForm) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalCloseRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showForm]);

  useEffect(() => {
    if (!showForm) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeForm();
      if (event.key === "Tab") {
        const dialog = modalCloseRef.current?.closest('[role="dialog"]');
        const nodes = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') || []);
        if (!nodes.length) return;
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeForm, showForm]);

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
    } catch (requestError) {
      setError(apiMessage(requestError, "Não foi possível carregar a estrutura desta fazenda."));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFarmCreated = (farm: CreatedFarm) => {
    setFarms((current) => [...current.filter((item) => item.id !== farm.id), farm]);
    setFarmId(farm.id);
    setForm((current) => ({ ...current, farm: farm.id }));
    void loadStructures(farm.id);
  };

  useEffect(() => {
    let active = true;
    apiClient.get<PaginatedFarms>("/farms/", { params: { page_size: 100 } })
      .then(({ data }) => {
        if (!active) return;
        const available = data.results || [];
        setFarms(available);
        const initialFarmId = available[0]?.id || "";
        setFarmId(initialFarmId);
        if (initialFarmId) void loadStructures(initialFarmId);
        else setLoading(false);
      })
      .catch(() => { if (active) { setError("Não foi possível carregar as fazendas."); setLoading(false); } });
    return () => { active = false; };
  }, [loadStructures]);

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

  const openCreate = (category: FarmStructureCategory = "pigsty") => {
    modalTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const defaults = categoryDefaults[category];
    setEditing(null);
    setForm({
      ...emptyForm,
      farm: farmId,
      category,
      name: defaults.name,
      latitude: lastRegisteredLocation?.latitude || null,
      longitude: lastRegisteredLocation?.longitude || null,
    });
    setStructureItem(emptyItem);
    setShowForm(true);
  };

  const selectCategory = (category: FarmStructureCategory) => {
    setSelectedCategory(category);
    window.setTimeout(() => document.getElementById("category-overview")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const openEdit = (item: FarmStructure) => {
    modalTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditing(item);
    setForm({
      farm: item.farm, category: item.category, name: item.name, description: item.description,
      built_area_m2: item.built_area_m2, length_m: item.length_m, width_m: item.width_m,
      quantity: item.quantity, acquisition_value: item.acquisition_value,
      current_value: item.current_value, acquisition_date: item.acquisition_date,
      last_maintenance_date: item.last_maintenance_date, next_maintenance_date: item.next_maintenance_date,
      maintenance_notes: item.maintenance_notes,
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
      showToast(editing ? "Estrutura atualizada com sucesso." : "Estrutura cadastrada com sucesso.", "success");
    } catch (requestError) {
      const message = apiMessage(requestError, "Não foi possível salvar. Verifique os dados e suas permissões.");
      setError(message); showToast(message, "error");
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
      showToast("Item adicionado à estrutura.", "success");
    } catch (requestError) { const message = apiMessage(requestError, "Não foi possível adicionar o item utilizado."); setError(message); showToast(message, "error"); }
  };

  const removeStructureItem = async (itemId: string) => {
    try {
      await farmStructureService.removeItem(itemId);
      const [list, totals] = await Promise.all([farmStructureService.list(farmId), farmStructureService.summary(farmId)]);
      setItems(list.data.results);
      setEditing((current) => current ? list.data.results.find((item) => item.id === current.id) || current : null);
      setSummary(totals.data);
      showToast("Item removido da estrutura.", "success");
    } catch (requestError) {
      const message = apiMessage(requestError, "Não foi possível remover o item.");
      setError(message); showToast(message, "error");
    }
  };

  const remove = async (item: FarmStructure) => {
    if (!confirm(`Excluir a estrutura “${item.name}”?`)) return;
    try {
      await farmStructureService.remove(item.id);
      await loadStructures(farmId);
      showToast("Estrutura excluída.", "success");
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
        <button className="btn btn-light d-flex align-items-center gap-2 fw-semibold" onClick={() => openCreate(selectedCategory === "all" ? "pigsty" : selectedCategory)} disabled={!farmId}>
          <Plus size={18} /> Nova estrutura
        </button>
      </header>

      <div className={styles.content}>
        <div className={`${styles.infoBar} d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3`}>
          <div className={styles.info}><Info size={21} /><span><strong>Organize a estrutura da fazenda por categorias.</strong><br />Cada item fica vinculado à propriedade selecionada.</span></div>
          <select className="form-select" style={{ maxWidth: 320 }} value={farmId} onChange={(event) => { const nextFarm = event.target.value; setFarmId(nextFarm); void loadStructures(nextFarm); }}>
            {farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
          </select>
        </div>

        {error && <div className={styles.errorState} role="alert"><CircleAlert size={20} /><span>{error}</span><button onClick={() => void loadStructures(farmId)}>Tentar novamente</button></div>}
        {!farms.length && !loading && <div className="alert alert-warning">Cadastre uma fazenda antes de adicionar estruturas.</div>}

        <section className="mb-4"><h2 className={styles.sectionTitle}>Resumo geral da estrutura</h2><div className={styles.summaryGrid}>
          <SummaryCard icon={ClipboardList} label="Total de itens" value={String(summary?.total_items || 0)} detail={`${summary?.total_records || 0} registros`} />
          <SummaryCard icon={Calculator} label="Valor total pago" value={money(summary?.acquisition_value || 0)} detail="Valor de aquisição" />
          <SummaryCard icon={Warehouse} label="Valor líquido atual" value={money(summary?.current_value || 0)} detail="Estrutura atual" />
        </div></section>

        <section className={styles.categorySection}>
          <div className={styles.categoryHeading}>
            <div>
              <h2 className={styles.sectionTitle}>1. Escolha a categoria da estrutura</h2>
              <p>Selecione uma opção para acessar o cadastro correspondente.</p>
            </div>
            {selectedCategory !== "all" && (
              <button className={styles.clearFilter} onClick={() => setSelectedCategory("all")}>
                <X size={15} /> Exibir todas
              </button>
            )}
          </div>
          <div className={styles.categoryGrid}>
            <button className={styles.categoryCard} onClick={() => setShowFarmForm(true)}>
              <div className={styles.categoryMain}><div className={styles.categoryIcon}><Building2 size={34} /></div><div><h3>Propriedade</h3><p>Cadastre uma nova fazenda para organizar talhões, plantações e estruturas.</p></div></div>
              <div className={styles.categoryFooter}><span>Cadastro da fazenda</span><strong>Adicionar <Plus size={16} /></strong></div>
            </button>
            <button className={styles.categoryCard} onClick={() => router.push("/home/estrutura/maquinas")}>
              <div className={styles.categoryMain}><div className={styles.categoryIcon}><Tractor size={34} /></div><div><h3>Máquinas agrícolas e veículos</h3><p>Máquinas, implementos, caminhões e veículos da propriedade.</p></div></div>
              <div className={styles.categoryFooter}><span>Acessar módulo</span><strong>Abrir <ChevronRight size={16} /></strong></div>
            </button>
            <button className={styles.categoryCard} onClick={() => router.push("/home/estrutura/curral")}>
              <div className={styles.categoryMain}><div className={styles.categoryIcon}><Beef size={34} /></div><div><h3>Curral</h3><p>Estruturas de manejo para bovinos e criações de grande porte.</p></div></div>
              <div className={styles.categoryFooter}><span>Acessar módulo</span><strong>Abrir <ChevronRight size={16} /></strong></div>
            </button>
            {categories.map(({ value, label, description, icon: Icon }) => {
              const data = categorySummary.get(value);
              return (
                <button key={value} className={`${styles.categoryCard} ${selectedCategory === value ? styles.selected : ""}`}
                  onClick={() => selectCategory(value)}>
                  <div className={styles.categoryMain}><div className={styles.categoryIcon}><Icon size={34} /></div><div><h3>{label}</h3><p>{description}</p></div></div>
                  <div className={styles.categoryFooter}>
                    <span><ClipboardList size={16} /> {data?.items || 0} itens cadastrados</span>
                    <strong>{selectedCategory === value ? "Selecionada" : "Ver itens"} <ChevronRight size={16} /></strong>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {selectedCategory !== "all" && <CategoryOverview category={categories.find((candidate) => candidate.value === selectedCategory)!} structures={items.filter((item) => item.category === selectedCategory)} onEdit={openEdit} onCreate={() => openCreate(selectedCategory)} />}

        <section id="structure-report" className="mt-4" style={{ order: 4 }}>
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

        <section className={styles.quickActions} style={{ order: 3 }}>
          <h2 className={styles.sectionTitle}>Ações rápidas</h2>
          <div>
            <button onClick={() => openCreate(selectedCategory === "all" ? "pigsty" : selectedCategory)} disabled={!farmId}><Plus size={20} /><span><strong>Nova estrutura</strong><small>Cadastrar novo item</small></span></button>
            <button onClick={() => document.getElementById("structure-report")?.scrollIntoView({ behavior: "smooth" })}><ListChecks size={20} /><span><strong>Ver todos os itens</strong><small>Lista consolidada</small></span></button>
          </div>
        </section>
      </div>

      {showForm && <div className={styles.modalBackdrop} onMouseDown={() => closeForm()}><div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="structure-modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}><div><h2 id="structure-modal-title" className="h4 fw-bold mb-1">{editing ? "Editar estrutura" : `Cadastrar ${categories.find((category) => category.value === form.category)?.label || "estrutura"}`}</h2><p className="text-muted small mb-0">Informe dimensões, valores, localização e materiais utilizados.</p></div><button ref={modalCloseRef} type="button" className="btn-close" onClick={() => closeForm()} aria-label="Fechar formulário" /></div>
        <form onSubmit={submit}><div className={`${styles.identityFields} p-4 row g-3`}>
          <div className="col-md-7"><label className="form-label">Nome</label><input required className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="col-md-5"><label className="form-label">Categoria</label><select className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as FarmStructureCategory })}>{categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></div>
          <div className="col-12"><label className="form-label">Descrição</label><textarea className="form-control" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="col-md-3"><label className="form-label">Quantidade</label><input required min={1} type="number" className="form-control" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></div>
          <div className="col-md-3"><label className="form-label">Valor unitário pago</label><input required min={0} step="0.01" type="number" className="form-control" value={form.acquisition_value} onChange={(e) => setForm({ ...form, acquisition_value: e.target.value })} /></div>
          <div className="col-md-3"><label className="form-label">Valor unitário atual</label><input required min={0} step="0.01" type="number" className="form-control" value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })} /></div>
          <div className="col-md-3"><label className="form-label">Aquisição</label><input type="date" className="form-control" value={form.acquisition_date || ""} onChange={(e) => setForm({ ...form, acquisition_date: e.target.value || null })} /></div>
          <div className="col-md-4"><label className="form-label">Última manutenção</label><input type="date" className="form-control" value={form.last_maintenance_date || ""} onChange={(e) => setForm({ ...form, last_maintenance_date: e.target.value || null })} /></div>
          <div className="col-md-4"><label className="form-label">Próxima manutenção</label><input type="date" className="form-control" value={form.next_maintenance_date || ""} onChange={(e) => setForm({ ...form, next_maintenance_date: e.target.value || null })} /></div>
          <div className="col-md-4"><label className="form-label">Situação</label><select className="form-select" value={form.is_active ? "active" : "inactive"} onChange={(e) => setForm({ ...form, is_active: e.target.value === "active" })}><option value="active">Ativa</option><option value="inactive">Inativa</option></select></div>
          <div className="col-12"><label className="form-label">Observações de manutenção</label><textarea className="form-control" rows={2} value={form.maintenance_notes || ""} onChange={(e) => setForm({ ...form, maintenance_notes: e.target.value })} /></div>
          <div className="col-12"><label className="form-label">Observações</label><textarea className="form-control" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div><div className={styles.modalActions}><button type="button" className="btn btn-outline-secondary" onClick={() => closeForm()}>Cancelar</button><button className="btn btn-success" disabled={saving}>{saving ? <><span className="spinner-border spinner-border-sm me-2" />Salvando...</> : editing ? "Atualizar dados" : "Salvar e adicionar itens"}</button></div></form>
        <div className={`${styles.flowGrid} ${form.category === "irrigation" ? styles.irrigationFlow : ""}`}>
        <section className={`${styles.stepCard} ${styles.dimensionsStep}`}><div className={styles.stepHeading}><span>{form.category === "irrigation" ? 3 : 1}</span><h3>Dimensões</h3></div><form onSubmit={submit}><div className="row g-3">
          <div className="col-12"><label className="form-label">Área construída (m²)</label><input type="number" min={0} step="0.01" className="form-control" value={form.built_area_m2 || ""} onChange={(e) => setForm({ ...form, built_area_m2: e.target.value || null })} /></div>
          <div className="col-12"><label className="form-label">Comprimento (m)</label><input type="number" min={0} step="0.01" className="form-control" value={form.length_m || ""} onChange={(e) => setForm({ ...form, length_m: e.target.value || null })} /></div>
          <div className="col-12"><label className="form-label">Largura (m)</label><input type="number" min={0} step="0.01" className="form-control" value={form.width_m || ""} onChange={(e) => setForm({ ...form, width_m: e.target.value || null })} /></div>
          <div className="col-12"><button className="btn btn-success w-100" disabled={saving}>{editing ? "Salvar dimensões" : "Salvar estrutura"}</button></div>
        </div></form></section>
        <section className={`${styles.stepCard} ${styles.itemsStep}`}><div className={styles.stepHeading}><span>{form.category === "irrigation" ? 1 : 2}</span><h3>Itens utilizados</h3></div>{!editing && <p className="small text-muted">Salve os dados iniciais da estrutura para liberar a inclusão de itens.</p>}
          {editing && <><form className="row g-2 align-items-end" onSubmit={addStructureItem}><div className="col-md-4"><label className="form-label">Item</label><input required list={`materials-${form.category}`} className="form-control" value={structureItem.name} onChange={(e) => setStructureItem({ ...structureItem, name: e.target.value })} /><datalist id={`materials-${form.category}`}>{categoryDefaults[form.category].materials.map((material) => <option key={material} value={material} />)}</datalist></div><div className="col-md-2"><label className="form-label">Quantidade</label><input required type="number" min="0.01" step="0.01" className="form-control" value={structureItem.quantity} onChange={(e) => setStructureItem({ ...structureItem, quantity: e.target.value })} /></div><div className="col-md-2"><label className="form-label">Unidade</label><select required className="form-select" value={structureItem.unit} onChange={(e) => setStructureItem({ ...structureItem, unit: e.target.value })}><option value="un">un</option><option value="m">m</option><option value="m²">m²</option><option value="m³">m³</option><option value="kg">kg</option><option value="L">L</option><option value="serviço">serviço</option></select></div><div className="col-md-2"><label className="form-label">Valor total</label><input required type="number" min="0" step="0.01" className="form-control" value={structureItem.value} onChange={(e) => setStructureItem({ ...structureItem, value: e.target.value })} /></div><div className="col-md-2"><button className="btn btn-outline-success w-100"><Plus size={16} /> Adicionar</button></div></form>
          <div className="table-responsive mt-3"><table className="table table-sm"><thead><tr><th>Item</th><th>Quantidade</th><th>Valor</th><th /></tr></thead><tbody>{editing.items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.quantity} {item.unit}</td><td>{money(item.value)}</td><td className="text-end">{canDelete && <button type="button" className="btn btn-sm text-danger" onClick={() => void removeStructureItem(item.id)}><Trash2 size={14} /></button>}</td></tr>)}</tbody></table></div></>}
        </section>
        <section className={`${styles.stepCard} ${styles.locationStep}`}><div className={styles.stepHeading}><span>{form.category === "irrigation" ? 2 : 3}</span><h3>Localização <small>(opcional)</small></h3></div><form onSubmit={submit}><LocationPicker latitude={form.latitude} longitude={form.longitude} lastLocation={lastRegisteredLocation} onChange={(latitude, longitude) => setForm((current) => ({ ...current, latitude, longitude }))} /><button className="btn btn-success w-100 mt-3" disabled={saving}>{editing ? "Salvar localização" : "Salvar estrutura"}</button></form></section>
        </div>
        {editing && <div className={styles.successBar}><span><MapPinned size={24} /></span><div><strong>Estrutura salva</strong><small>Os dados e itens cadastrados já estão disponíveis para uso na fazenda.</small></div><button className="btn btn-success" onClick={() => closeForm(true)}>Concluir</button></div>}
      </div></div>}
      <FarmFormModal isOpen={showFarmForm} onClose={() => setShowFarmForm(false)} onCreated={handleFarmCreated} />
    </div>
  );
}

function CategoryOverview({ category, structures, onEdit, onCreate }: { category: typeof categories[number]; structures: FarmStructure[]; onEdit: (item: FarmStructure) => void; onCreate: () => void }) {
  const paid = structures.reduce((total, item) => total + Number(item.acquisition_value) * item.quantity + Number(item.items_value || 0), 0);
  const current = structures.reduce((total, item) => total + Number(item.current_value) * item.quantity, 0);
  const pending = structures.filter((item) => item.maintenance_status === "overdue" || item.maintenance_status === "due_soon");
  const Icon = category.icon;
  const maintenanceLabel = { overdue: "Atrasada", due_soon: "Próxima", scheduled: "Agendada", not_scheduled: "Sem agenda" } as const;
  return <section id="category-overview" className={styles.categoryOverview} aria-labelledby="category-overview-title">
    <header><div><Icon size={24} /><span><h2 id="category-overview-title">Visão de {category.label}</h2><p>{category.description}</p></span></div><button onClick={onCreate}><Plus size={17} /> Nova estrutura</button></header>
    <div className={styles.categoryStats}>
      <SummaryCard icon={ClipboardList} label="Estruturas" value={String(structures.length)} detail={`${structures.filter((item) => item.is_active).length} ativas`} />
      <SummaryCard icon={Calculator} label="Valor investido" value={money(paid)} detail="Estruturas e materiais" />
      <SummaryCard icon={Warehouse} label="Valor atual" value={money(current)} detail="Patrimônio estimado" />
      <SummaryCard icon={CalendarClock} label="Pendências" value={String(pending.length)} detail="Manutenções próximas ou vencidas" />
    </div>
    {!structures.length ? <div className={styles.categoryEmpty}><Icon size={34} /><strong>Nenhuma estrutura cadastrada</strong><p>Cadastre a primeira estrutura desta categoria para acompanhar patrimônio, materiais, localização e manutenção.</p><button onClick={onCreate}><Plus size={17} /> Cadastrar agora</button></div>
      : <div className={styles.structureCards}>{structures.map((item) => <article key={item.id} className={styles.structureDetailCard}>
        <header><div><strong>{item.name}</strong><span className={item.is_active ? styles.activeStatus : styles.inactiveStatus}>{item.is_active ? "Ativa" : "Inativa"}</span></div><button onClick={() => onEdit(item)} aria-label={`Editar ${item.name}`}><Pencil size={16} /></button></header>
        <p>{item.description || "Sem descrição informada."}</p>
        <dl><div><dt>Quantidade</dt><dd>{item.quantity}</dd></div><div><dt>Área</dt><dd>{item.built_area_m2 ? `${item.built_area_m2} m²` : "—"}</dd></div><div><dt>Materiais</dt><dd>{item.items.length}</dd></div><div><dt>Valor atual</dt><dd>{money(Number(item.current_value) * item.quantity)}</dd></div></dl>
        <div className={styles.structureMeta}><span><MapPin size={15} />{item.latitude && item.longitude ? "Localização cadastrada" : "Sem localização"}</span><span data-status={item.maintenance_status}><Wrench size={15} />{maintenanceLabel[item.maintenance_status]}{item.next_maintenance_date ? ` · ${new Date(`${item.next_maintenance_date}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}</span></div>
        {item.maintenance_notes && <small className={styles.maintenanceNote}>{item.maintenance_notes}</small>}
      </article>)}</div>}
  </section>;
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
