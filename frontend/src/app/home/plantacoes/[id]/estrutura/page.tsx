"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Boxes, CircleDollarSign, Droplets, Fence, Plus, Save,
  Trash2, Warehouse, Waves, Zap, Wrench, Car, Layers3,
} from "lucide-react";

import { cropService } from "@/services/cropService";
import { farmStructureService } from "@/services/farmStructureService";
import type { FarmStructure } from "@/types";
import styles from "./sector-structure.module.css";

type PlantationInfo = {
  id: string; farm: string; farm_name: string; field_name: string;
  sector_name?: string; crop_name: string; planted_area_ha?: string | null;
};
type StructureGroup = "irrigation" | "support" | "fence" | "storage" | "water" | "electrical" | "machine" | "vehicle" | "other";
type SectorItem = {
  id: string; group: StructureGroup; group_display: string; item_type: string;
  specification: string; quantity: string; unit: string; unit_value: string;
  total_value: string; farm_structure?: string | null; farm_structure_name?: string;
};

const groups: Array<{ value: StructureGroup; label: string; icon: typeof Droplets; suggestions: string[] }> = [
  { value: "irrigation", label: "Irrigação", icon: Droplets, suggestions: ["Tubo principal", "Tubo linha lateral", "Fita gotejadora", "Conexões", "Registro", "Bomba"] },
  { value: "support", label: "Estrutura de sustentação", icon: Layers3, suggestions: ["Estaca", "Arame liso", "Grampo", "Tutor", "Treliça"] },
  { value: "fence", label: "Cercas e divisões", icon: Fence, suggestions: ["Mourão", "Arame", "Porteira", "Esticador"] },
  { value: "storage", label: "Depósitos e armazenagem", icon: Warehouse, suggestions: ["Galpão", "Silo", "Prateleira", "Contêiner"] },
  { value: "water", label: "Reservatórios e água", icon: Waves, suggestions: ["Reservatório", "Caixa d'água", "Açude", "Bebedouro"] },
  { value: "electrical", label: "Instalações elétricas", icon: Zap, suggestions: ["Quadro elétrico", "Cabeamento", "Transformador", "Iluminação"] },
  { value: "machine", label: "Máquinas e implementos", icon: Wrench, suggestions: ["Trator", "Pulverizador", "Plantadeira", "Implemento"] },
  { value: "vehicle", label: "Veículos", icon: Car, suggestions: ["Caminhonete", "Caminhão", "Automóvel", "Motocicleta"] },
  { value: "other", label: "Outros", icon: Boxes, suggestions: ["Material", "Equipamento", "Serviço"] },
];

const emptyForm = {
  group: "irrigation" as StructureGroup, farm_structure: "", item_type: "",
  specification: "", quantity: "1", unit: "un", unit_value: "0.00", notes: "",
};
const number = (value: string | number) => Number(value || 0);
const money = (value: string | number) => number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function SectorStructurePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [plantation, setPlantation] = useState<PlantationInfo | null>(null);
  const [items, setItems] = useState<SectorItem[]>([]);
  const [farmStructures, setFarmStructures] = useState<FarmStructure[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [{ data: plantationData }, { data: itemData }] = await Promise.all([
        cropService.get(id), cropService.listSectorStructureItems(id),
      ]);
      setPlantation(plantationData);
      setItems(itemData.results || itemData);
      if (plantationData.farm) {
        const { data } = await farmStructureService.list(plantationData.farm);
        setFarmStructures(data.results);
      }
    } catch { setError("Não foi possível carregar a estrutura deste setor."); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => {
    let active = true;
    Promise.all([cropService.get(id), cropService.listSectorStructureItems(id)])
      .then(async ([{ data: plantationData }, { data: itemData }]) => {
        if (!active) return;
        setPlantation(plantationData);
        setItems(itemData.results || itemData);
        if (plantationData.farm) {
          const { data } = await farmStructureService.list(plantationData.farm);
          if (active) setFarmStructures(data.results);
        }
      })
      .catch(() => { if (active) setError("Não foi possível carregar a estrutura deste setor."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const grouped = useMemo(() => groups.map((group) => ({
    ...group,
    items: items.filter((item) => item.group === group.value),
  })).filter((group) => group.items.length), [items]);
  const total = useMemo(() => items.reduce((sum, item) => sum + number(item.total_value), 0), [items]);
  const selectedGroup = groups.find((group) => group.value === form.group)!;

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await cropService.createSectorStructureItem({
        ...form, plantation: id, farm_structure: form.farm_structure || null,
      });
      setForm((current) => ({ ...emptyForm, group: current.group }));
      setShowForm(false);
      await load();
    } catch { setError("Não foi possível adicionar o item. Confira os valores informados."); }
    finally { setSaving(false); }
  };

  const remove = async (item: SectorItem) => {
    if (!confirm(`Excluir “${item.item_type}” da estrutura do setor?`)) return;
    await cropService.deleteSectorStructureItem(item.id);
    await load();
  };

  return <div className={styles.page}>
    <header className={styles.hero}>

      <div><h1>Estrutura do Setor</h1><p>Lance a estrutura utilizada no setor plantado</p></div>
      <button className={styles.saveButton} onClick={() => router.back()}><Save size={20} /> Salvar</button>
    </header>

    <main className={styles.content}>
      {error && <div className="alert alert-danger">{error}</div>}
      <section className={styles.infoPanel}>
        <h2><Layers3 size={20} /> Dados do setor</h2>
        <div className={styles.infoGrid}>
          <Info label="Fazenda" value={plantation?.farm_name} />
          <Info label="Setor" value={plantation?.sector_name || plantation?.field_name} />
          <Info label="Cultura" value={plantation?.crop_name} />
          <Info label="Área (ha)" value={plantation?.planted_area_ha || "—"} />
        </div>
      </section>

      <section className={styles.structurePanel}>
        <div className={styles.panelHeading}>
          <div><h2>Estrutura utilizada</h2><p>Organize os componentes por grupos e acompanhe seus custos.</p></div>
          <button onClick={() => setShowForm(true)}><Plus size={18} /> Adicionar item</button>
        </div>

        {loading ? <div className="text-center p-5"><span className="spinner-border text-success" /></div>
          : grouped.length ? grouped.map(({ value, label, icon: Icon, items: groupItems }) => {
            const groupTotal = groupItems.reduce((sum, item) => sum + number(item.total_value), 0);
            return <div className={styles.group} key={value}>
              <div className={styles.groupTitle}><h3><Icon size={20} /> {label}</h3><strong>{money(groupTotal)}</strong></div>
              <div className="table-responsive"><table className="table align-middle mb-0">
                <thead><tr><th>Tipo de item</th><th>Especificação</th><th>Quantidade</th><th>Unidade</th><th>Valor unit.</th><th>Valor total</th><th /></tr></thead>
                <tbody>{groupItems.map((item) => <tr key={item.id}>
                  <td><strong>{item.item_type}</strong>{item.farm_structure_name && <small>Patrimônio: {item.farm_structure_name}</small>}</td>
                  <td>{item.specification || "—"}</td><td>{number(item.quantity).toLocaleString("pt-BR")}</td><td>{item.unit}</td>
                  <td>{money(item.unit_value)}</td><td className="fw-bold text-success">{money(item.total_value)}</td>
                  <td><button className={styles.deleteButton} onClick={() => void remove(item)} title="Excluir"><Trash2 size={16} /></button></td>
                </tr>)}</tbody>
                <tfoot><tr><td colSpan={5}>Total {label}</td><td>{money(groupTotal)}</td><td /></tr></tfoot>
              </table></div>
            </div>;
          }) : <div className={styles.empty}><Boxes size={38} /><strong>Nenhuma estrutura lançada</strong><span>Adicione irrigação, sustentação ou outros componentes utilizados neste setor.</span></div>}
      </section>

      <section className={styles.summary}>
        <CircleDollarSign size={28} /><div><span>Total de grupos</span><strong>{grouped.length}</strong></div>
        <div><span>Total de itens</span><strong>{items.length}</strong></div>
        <div className={styles.grandTotal}><span>Total geral</span><strong>{money(total)}</strong></div>
      </section>
    </main>

    {showForm && <div className={styles.backdrop} onMouseDown={() => setShowForm(false)}>
      <form className={styles.modal} onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.modalHeading}><div><h2>Adicionar item à estrutura</h2><p>O valor total será calculado automaticamente.</p></div><button type="button" className="btn-close" onClick={() => setShowForm(false)} /></div>
        <div className="row g-3 p-4">
          <div className="col-md-6"><label className="form-label">Grupo</label><select className="form-select" value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value as StructureGroup, item_type: "" })}>{groups.map((group) => <option key={group.value} value={group.value}>{group.label}</option>)}</select></div>
          <div className="col-md-6"><label className="form-label">Vincular patrimônio existente (opcional)</label><select className="form-select" value={form.farm_structure} onChange={(e) => { const structure = farmStructures.find((item) => item.id === e.target.value); setForm({ ...form, farm_structure: e.target.value, item_type: structure?.name || form.item_type, specification: structure?.description || form.specification }); }}><option value="">Sem vínculo</option>{farmStructures.map((structure) => <option key={structure.id} value={structure.id}>{structure.category_label} — {structure.name}</option>)}</select></div>
          <div className="col-md-6"><label className="form-label">Tipo de item</label><input required className="form-control" list={`suggestions-${form.group}`} value={form.item_type} onChange={(e) => setForm({ ...form, item_type: e.target.value })} /><datalist id={`suggestions-${form.group}`}>{selectedGroup.suggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}</datalist></div>
          <div className="col-md-6"><label className="form-label">Especificação</label><input className="form-control" placeholder="Ex.: PVC PN 60 50 mm" value={form.specification} onChange={(e) => setForm({ ...form, specification: e.target.value })} /></div>
          <div className="col-md-3"><label className="form-label">Quantidade</label><input required min="0.01" step="0.01" type="number" className="form-control" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
          <div className="col-md-3"><label className="form-label">Unidade</label><select className="form-select" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}><option>un</option><option>m</option><option>m²</option><option>m³</option><option>kg</option><option>L</option><option>kit</option><option>serviço</option></select></div>
          <div className="col-md-3"><label className="form-label">Valor unitário</label><input required min="0" step="0.01" type="number" className="form-control" value={form.unit_value} onChange={(e) => setForm({ ...form, unit_value: e.target.value })} /></div>
          <div className="col-md-3"><label className="form-label">Valor total</label><input readOnly className="form-control fw-bold text-success" value={money(number(form.quantity) * number(form.unit_value))} /></div>
        </div>
        <div className={styles.modalActions}><button type="button" className="btn btn-outline-secondary" onClick={() => setShowForm(false)}>Cancelar</button><button className="btn btn-success px-4" disabled={saving}>{saving ? "Salvando..." : "Adicionar item"}</button></div>
      </form>
    </div>}
  </div>;
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return <div><span>{label}</span><strong>{value || "—"}</strong></div>;
}
