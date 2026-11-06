"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Boxes, CircleDollarSign, Droplets, Fence, Plus, Save,
  Trash2, Warehouse, Waves, Zap, Wrench, Car, Layers3,
} from "lucide-react";

import { cropService } from "@/services/cropService";
import { farmStructureService } from "@/services/farmStructureService";
import type { FarmStructure } from "@/types";
import { useOrganizationLocale, type TranslationKey } from "@/lib/locale";
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

const groups: Array<{ value: StructureGroup; icon: typeof Droplets; suggestions: string[] }> = [
  { value: "irrigation", icon: Droplets, suggestions: ["Tubo principal", "Tubo linha lateral", "Fita gotejadora", "Conexões", "Registro", "Bomba"] },
  { value: "support", icon: Layers3, suggestions: ["Estaca", "Arame liso", "Grampo", "Tutor", "Treliça"] },
  { value: "fence", icon: Fence, suggestions: ["Mourão", "Arame", "Porteira", "Esticador"] },
  { value: "storage", icon: Warehouse, suggestions: ["Galpão", "Silo", "Prateleira", "Contêiner"] },
  { value: "water", icon: Waves, suggestions: ["Reservatório", "Caixa d'água", "Açude", "Bebedouro"] },
  { value: "electrical", icon: Zap, suggestions: ["Quadro elétrico", "Cabeamento", "Transformador", "Iluminação"] },
  { value: "machine", icon: Wrench, suggestions: ["Trator", "Pulverizador", "Plantadeira", "Implemento"] },
  { value: "vehicle", icon: Car, suggestions: ["Caminhonete", "Caminhão", "Automóvel", "Motocicleta"] },
  { value: "other", icon: Boxes, suggestions: ["Material", "Equipamento", "Serviço"] },
];

const emptyForm = {
  group: "irrigation" as StructureGroup, farm_structure: "", item_type: "",
  specification: "", quantity: "1", unit: "un", unit_value: "0.00", notes: "",
};
const number = (value: string | number) => Number(value || 0);
const money = (value: string | number, language: string) => number(value).toLocaleString(language, { style: "currency", currency: "BRL" });

export default function SectorStructurePage() {
  const { language, t } = useOrganizationLocale();
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
    } catch { setError(t("plantations.structure.loadFailed")); }
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
      .catch(() => { if (active) setError(t("plantations.structure.loadFailed")); })
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
    } catch { setError(t("plantations.structure.addFailed")); }
    finally { setSaving(false); }
  };

  const remove = async (item: SectorItem) => {
    if (!confirm(t("plantations.structure.deleteConfirm").replace("{item}", item.item_type))) return;
    await cropService.deleteSectorStructureItem(item.id);
    await load();
  };

  return <div className={styles.page}>
    <header className={styles.hero}>

      <div><h1>{t("plantations.structure.title")}</h1><p>{t("plantations.structure.subtitle")}</p></div>
      <button className={styles.saveButton} onClick={() => router.back()}><Save size={20} /> {t("plantations.save")}</button>
    </header>

    <main className={styles.content}>
      {error && <div className="alert alert-danger">{error}</div>}
      <section className={styles.infoPanel}>
        <h2><Layers3 size={20} /> {t("plantations.structure.sectorData")}</h2>
        <div className={styles.infoGrid}>
          <Info label={t("plantations.property")} value={plantation?.farm_name} />
          <Info label={t("plantations.field")} value={plantation?.sector_name || plantation?.field_name} />
          <Info label={t("plantations.crop")} value={plantation?.crop_name} />
          <Info label={t("plantations.detail.area")} value={plantation?.planted_area_ha || "—"} />
        </div>
      </section>

      <section className={styles.structurePanel}>
        <div className={styles.panelHeading}>
          <div><h2>{t("plantations.structure.used")}</h2><p>{t("plantations.structure.usedDescription")}</p></div>
          <button onClick={() => setShowForm(true)}><Plus size={18} /> {t("plantations.structure.addItem")}</button>
        </div>

        {loading ? <div className="text-center p-5"><span className="spinner-border text-success" /></div>
          : grouped.length ? grouped.map(({ value, icon: Icon, items: groupItems }) => {
            const groupTotal = groupItems.reduce((sum, item) => sum + number(item.total_value), 0);
            const label = t(`plantations.structure.group.${value}` as TranslationKey);
            return <div className={styles.group} key={value}>
              <div className={styles.groupTitle}><h3><Icon size={20} /> {label}</h3><strong>{money(groupTotal, language)}</strong></div>
              <div className="table-responsive"><table className="table align-middle mb-0">
                <thead><tr><th>{t("plantations.structure.itemType")}</th><th>{t("plantations.structure.specification")}</th><th>{t("plantations.structure.quantity")}</th><th>{t("plantations.structure.unit")}</th><th>{t("plantations.structure.unitValue")}</th><th>{t("plantations.structure.totalValue")}</th><th /></tr></thead>
                <tbody>{groupItems.map((item) => <tr key={item.id}>
                  <td><strong>{item.item_type}</strong>{item.farm_structure_name && <small>{t("plantations.structure.asset")} {item.farm_structure_name}</small>}</td>
                  <td>{item.specification || "—"}</td><td>{number(item.quantity).toLocaleString(language)}</td><td>{item.unit}</td>
                  <td>{money(item.unit_value, language)}</td><td className="fw-bold text-success">{money(item.total_value, language)}</td>
                  <td><button className={styles.deleteButton} onClick={() => void remove(item)} title={t("plantations.agronomist.delete")}><Trash2 size={16} /></button></td>
                </tr>)}</tbody>
                <tfoot><tr><td colSpan={5}>{t("plantations.structure.total")} {label}</td><td>{money(groupTotal, language)}</td><td /></tr></tfoot>
              </table></div>
            </div>;
          }) : <div className={styles.empty}><Boxes size={38} /><strong>{t("plantations.structure.empty")}</strong><span>{t("plantations.structure.emptyDescription")}</span></div>}
      </section>

      <section className={styles.summary}>
        <CircleDollarSign size={28} /><div><span>{t("plantations.structure.totalGroups")}</span><strong>{grouped.length}</strong></div>
        <div><span>{t("plantations.structure.totalItems")}</span><strong>{items.length}</strong></div>
        <div className={styles.grandTotal}><span>{t("plantations.structure.total")}</span><strong>{money(total, language)}</strong></div>
      </section>
    </main>

    {showForm && <div className={styles.backdrop} onMouseDown={() => setShowForm(false)}>
      <form className={styles.modal} onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.modalHeading}><div><h2>{t("plantations.structure.addModalTitle")}</h2><p>{t("plantations.structure.totalAuto")}</p></div><button type="button" className="btn-close" onClick={() => setShowForm(false)} aria-label={t("plantations.structure.cancel")} /></div>
        <div className="row g-3 p-4">
          <div className="col-md-6"><label className="form-label">{t("plantations.structure.group")}</label><select className="form-select" value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value as StructureGroup, item_type: "" })}>{groups.map((group) => <option key={group.value} value={group.value}>{t(`plantations.structure.group.${group.value}` as TranslationKey)}</option>)}</select></div>
          <div className="col-md-6"><label className="form-label">{t("plantations.structure.linkAsset")}</label><select className="form-select" value={form.farm_structure} onChange={(e) => { const structure = farmStructures.find((item) => item.id === e.target.value); setForm({ ...form, farm_structure: e.target.value, item_type: structure?.name || form.item_type, specification: structure?.description || form.specification }); }}><option value="">{t("plantations.structure.noLink")}</option>{farmStructures.map((structure) => <option key={structure.id} value={structure.id}>{structure.category_label} — {structure.name}</option>)}</select></div>
          <div className="col-md-6"><label className="form-label">{t("plantations.structure.itemType")}</label><input required className="form-control" list={`suggestions-${form.group}`} value={form.item_type} onChange={(e) => setForm({ ...form, item_type: e.target.value })} /><datalist id={`suggestions-${form.group}`}>{selectedGroup.suggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}</datalist></div>
          <div className="col-md-6"><label className="form-label">{t("plantations.structure.specification")}</label><input className="form-control" placeholder={t("plantations.structure.specificationPlaceholder")} value={form.specification} onChange={(e) => setForm({ ...form, specification: e.target.value })} /></div>
          <div className="col-md-3"><label className="form-label">{t("plantations.structure.quantity")}</label><input required min="0.01" step="0.01" type="number" className="form-control" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
          <div className="col-md-3"><label className="form-label">{t("plantations.structure.unit")}</label><select className="form-select" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}><option>un</option><option>{t("animalDetail.monthsShort")}</option><option>m²</option><option>m³</option><option>kg</option><option>L</option><option>kit</option><option>serviço</option></select></div>
          <div className="col-md-3"><label className="form-label">{t("plantations.structure.unitValue")}</label><input required min="0" step="0.01" type="number" className="form-control" value={form.unit_value} onChange={(e) => setForm({ ...form, unit_value: e.target.value })} /></div>
          <div className="col-md-3"><label className="form-label">{t("plantations.structure.totalValue")}</label><input readOnly className="form-control fw-bold text-success" value={money(number(form.quantity) * number(form.unit_value), language)} /></div>
        </div>
        <div className={styles.modalActions}><button type="button" className="btn btn-outline-secondary" onClick={() => setShowForm(false)}>{t("plantations.structure.cancel")}</button><button className="btn btn-success px-4" disabled={saving}>{saving ? t("plantations.structure.saving") : t("plantations.structure.addItem")}</button></div>
      </form>
    </div>}
  </div>;
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return <div><span>{label}</span><strong>{value || "—"}</strong></div>;
}
