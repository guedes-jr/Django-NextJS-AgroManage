"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Droplets, Plus, Save, ShieldCheck, Sprout, Trash2, Wheat } from "lucide-react";
import apiClient from "@/services/api";
import { cropService } from "@/services/cropService";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";

type OperationKind = "plantio" | "adubacao" | "fertirrigacao" | "defensivos" | "irrigacao";

type Plantation = {
  id: string;
  name?: string;
  crop_name?: string;
  field_name?: string;
  farm_name?: string;
};

type InventoryItem = {
  id: string;
  nome: string;
  categoria?: string;
  especie_animal?: string | null;
  unidade_medida?: string;
  estoque_atual?: string | number | null;
};

type ApplicationLine = {
  item: string;
  pesticide_type?: string;
  quantity: string;
  unit: string;
  unit_price: string;
  total_price: string;
};

type ApplicationRecord = {
  id: string;
  planting_date?: string | null;
  application_date?: string | null;
  item_name?: string | null;
  pesticide_type_display?: string | null;
  quantity?: string | number | null;
  unit?: string | null;
  unit_price?: string | number | null;
  total_price?: string | number | null;
  operator?: string | null;
  notes?: string | null;
};

type IrrigationPump = {
  id: string;
  name: string;
  power_cv: string | number;
  power_kw: string | number;
  flow_rate_l_per_h: string | number;
};

type IrrigationRecord = {
  id: string;
  date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  irrigation_system_display?: string | null;
  pump_name?: string | null;
  operating_days?: number | null;
  hours_per_day?: string | number | null;
  hours?: string | number | null;
  liters_used?: string | number | null;
  energy_kwh?: string | number | null;
  energy_cost?: string | number | null;
  operator?: string | null;
};

const unitOptions = [
  { value: "kg", label: "kg" },
  { value: "g", label: "g" },
  { value: "l", label: "L" },
  { value: "ml", label: "mL" },
  { value: "saco", label: "sc" },
  { value: "tonelada", label: "t" },
  { value: "unidade", label: "un" },
];

const pesticideTypeOptions = [
  { value: "insecticide", label: "Inseticida" },
  { value: "herbicide", label: "Herbicida" },
  { value: "fungicide", label: "Fungicida" },
  { value: "adjuvant", label: "Adjuvante" },
  { value: "acaricide", label: "Acaricida" },
  { value: "bactericide", label: "Bactericida" },
  { value: "other", label: "Outro" },
];

const irrigationSystemOptions = [
  { value: "center_pivot", label: "Pivô central" },
  { value: "drip", label: "Gotejamento" },
  { value: "sprinkler", label: "Aspersão" },
  { value: "micro_sprinkler", label: "Microaspersão" },
  { value: "hose", label: "Mangueira" },
  { value: "other", label: "Outro" },
];

const configByKind = {
  plantio: {
    title: "Sementes e mudas",
    subtitle: "Registre os insumos utilizados no plantio.",
    itemTitle: "Sementes utilizadas no plantio",
    itemColumn: "Semente",
    itemPlaceholder: "Selecione uma semente do estoque...",
    emptyMessage: "Nenhuma semente cadastrada no estoque.",
    totalLabel: "Valor total das sementes",
    dateLabel: "Data do plantio",
    historyTitle: "Histórico de sementes e mudas",
    icon: Sprout,
  },
  adubacao: {
    title: "Adubação de base",
    subtitle: "Registre fertilizantes, corretivos, doses e custos.",
    itemTitle: "Fertilizantes utilizados na aplicação",
    itemColumn: "Fertilizante",
    itemPlaceholder: "Selecione um fertilizante do estoque...",
    emptyMessage: "Nenhum insumo compatível com adubação cadastrado no estoque.",
    totalLabel: "Valor total da adubação",
    dateLabel: "Data",
    historyTitle: "Histórico de adubação de base",
    icon: Wheat,
  },
  fertirrigacao: {
    title: "Fertirrigação",
    subtitle: "Registre adubos aplicados via sistema de irrigação.",
    itemTitle: "Insumos utilizados na fertirrigação",
    itemColumn: "Insumo",
    itemPlaceholder: "Selecione um insumo do estoque...",
    emptyMessage: "Nenhum insumo compatível com fertirrigação cadastrado no estoque.",
    totalLabel: "Valor total da fertirrigação",
    dateLabel: "Data",
    historyTitle: "Histórico de fertirrigação",
    icon: Droplets,
  },
  defensivos: {
    title: "Foliar e defensivos",
    subtitle: "Registre defensivos, tipo de produto, equipamentos e custo.",
    itemTitle: "Defensivos da aplicação",
    itemColumn: "Defensivo",
    itemPlaceholder: "Selecione um defensivo do estoque...",
    emptyMessage: "Nenhum defensivo cadastrado no estoque.",
    totalLabel: "Valor total da aplicação",
    dateLabel: "Data",
    historyTitle: "Histórico de foliar e defensivos",
    icon: ShieldCheck,
  },
  irrigacao: {
    title: "Irrigação",
    subtitle: "Registre manejo de irrigação, bomba, consumo de água e energia.",
    historyTitle: "Histórico de irrigação",
    icon: Droplets,
  },
} satisfies Record<OperationKind, Record<string, unknown>>;

const emptyLine = (kind: OperationKind): ApplicationLine => ({
  item: "",
  pesticide_type: kind === "defensivos" ? "insecticide" : undefined,
  quantity: "",
  unit: "",
  unit_price: "",
  total_price: "",
});

const extractArray = <T,>(data: unknown): T[] => {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && "results" in data) {
    const results = (data as { results?: unknown }).results;
    return Array.isArray(results) ? (results as T[]) : [];
  }
  return [];
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
};

const fmt = (value?: string | number | null, decimals = 2) => {
  if (value === null || value === undefined || value === "") return "-";
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

const money = (value?: string | number | null) => {
  if (value === null || value === undefined || value === "") return "R$ 0,00";
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return "R$ 0,00";
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const cvToKw = (cv: string | number) => Number(cv || 0) * 0.7355;

const calculateInclusiveDays = (startDate: string, endDate: string) => {
  if (!startDate) return 1;
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate || startDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  return Math.max(Math.floor((end.getTime() - start.getTime()) / 86400000) + 1, 1);
};

const calculateLineTotal = (quantity: string, unitPrice: string) => {
  const q = Number(quantity || 0);
  const p = Number(unitPrice || 0);
  return q && p ? String(q * p) : "";
};

export function CropOperationPage({ kind }: { kind: OperationKind }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const config = configByKind[kind];
  const Icon = config.icon as typeof Sprout;
  const isIrrigation = kind === "irrigacao";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plantation, setPlantation] = useState<Plantation | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<ApplicationRecord[]>([]);
  const [irrigationHistory, setIrrigationHistory] = useState<IrrigationRecord[]>([]);
  const [lines, setLines] = useState<ApplicationLine[]>([emptyLine(kind)]);
  const [form, setForm] = useState({ date: "", operator: "", notes: "" });
  const [equipments, setEquipments] = useState([{ equipment: "", quantity: "", unit_price: "", total_price: "" }]);
  const [pumpModalOpen, setPumpModalOpen] = useState(false);
  const [pumps, setPumps] = useState<IrrigationPump[]>([]);
  const [pumpForm, setPumpForm] = useState({ name: "", power_cv: "", flow_rate_l_per_h: "" });
  const [savingPump, setSavingPump] = useState(false);
  const [irrigationForm, setIrrigationForm] = useState({
    start_date: "",
    end_date: "",
    irrigation_system: "",
    pump_equipment: "",
    hours_per_day: "",
    kwh_value: "",
    operator: "",
    notes: "",
  });

  const fetchHistory = useCallback(async () => {
    if (kind === "plantio") {
      const { data } = await cropService.listPlantings({ plantation: id });
      setHistory(extractArray<ApplicationRecord>(data));
    } else if (kind === "adubacao") {
      const { data } = await cropService.listFertilizations({ plantation: id });
      setHistory(extractArray<ApplicationRecord>(data));
    } else if (kind === "fertirrigacao") {
      const { data } = await cropService.listFertigations({ plantation: id });
      setHistory(extractArray<ApplicationRecord>(data));
    } else if (kind === "defensivos") {
      const { data } = await cropService.listPesticideApplications({ plantation: id });
      setHistory(extractArray<ApplicationRecord>(data));
    } else {
      const { data } = await cropService.listIrrigations({ plantation: id });
      setIrrigationHistory(extractArray<IrrigationRecord>(data));
    }
  }, [id, kind]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const requests: Promise<unknown>[] = [
          cropService.get(id),
          isIrrigation ? cropService.listIrrigationPumps() : apiClient.get("/inventory/items/all_items/"),
        ];

        const [plantationRes, secondaryRes] = await Promise.all(requests);
        setPlantation((plantationRes as { data: Plantation }).data);

        if (isIrrigation) {
          setPumps(extractArray<IrrigationPump>((secondaryRes as { data: unknown }).data));
        } else {
          const data = (secondaryRes as { data: unknown }).data;
          setInventoryItems(Array.isArray(data) ? data as InventoryItem[] : []);
        }

        await fetchHistory();
      } catch (error) {
        console.error("Erro ao carregar atalho da plantacao", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchHistory, id, isIrrigation, kind]);

  const filteredItems = useMemo(() => {
    if (kind === "plantio") {
      return inventoryItems.filter((item) => item.categoria === "semente" || (!item.especie_animal && item.categoria === "outro"));
    }
    if (kind === "defensivos") {
      return inventoryItems.filter((item) => item.categoria === "defensivo" || (!item.especie_animal && item.categoria === "outro"));
    }
    return inventoryItems.filter((item) =>
      ["fertilizante", "foliar", "corretivo", "material", "outro"].includes(item.categoria || "") ||
      (!item.especie_animal && item.categoria !== "defensivo")
    );
  }, [inventoryItems, kind]);

  const selectedPump = pumps.find((pump) => pump.id === irrigationForm.pump_equipment);
  const irrigationDays = calculateInclusiveDays(irrigationForm.start_date, irrigationForm.end_date);
  const irrigationHoursTotal = Number(irrigationForm.hours_per_day || 0) * irrigationDays;
  const irrigationEnergyKwh = Number(selectedPump?.power_kw || 0) * irrigationHoursTotal;
  const irrigationEnergyCost = irrigationEnergyKwh * Number(irrigationForm.kwh_value || 0);
  const irrigationWaterLiters = Number(selectedPump?.flow_rate_l_per_h || 0) * irrigationHoursTotal;

  const getStockPrice = async (itemId: string) => {
    const { data: lots } = await apiClient.get<{ custo_unitário: string | null; quantidade_atual: string }[]>(`/inventory/items/${itemId}/lots/`);
    const activeLot = lots.find((lot) => lot.custo_unitário && Number(lot.custo_unitário) > 0);
    return activeLot?.custo_unitário ? String(Number(activeLot.custo_unitário)) : "";
  };

  const updateLine = (index: number, patch: Partial<ApplicationLine>) => {
    setLines((prev) => prev.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      const next = { ...line, ...patch };
      if ("quantity" in patch || "unit_price" in patch || "unit" in patch || "item" in patch) {
        const q = Number(next.quantity || 0);
        const p = Number(next.unit_price || 0);
        let multiplier = 1;
        const item = inventoryItems.find((inventoryItem) => inventoryItem.id === next.item);
        if (item) {
          const invUnit = (item.unidade_medida || "").toLowerCase();
          const selectedUnit = (next.unit || "").toLowerCase();
          if (invUnit === "l" && selectedUnit === "ml") multiplier = 0.001;
          else if (invUnit === "ml" && selectedUnit === "l") multiplier = 1000;
          else if (invUnit === "kg" && selectedUnit === "g") multiplier = 0.001;
          else if (invUnit === "g" && selectedUnit === "kg") multiplier = 1000;
          else if (invUnit === "tonelada" && selectedUnit === "kg") multiplier = 0.001;
          else if (invUnit === "kg" && selectedUnit === "tonelada") multiplier = 1000;
        }
        next.total_price = q && p ? String(q * p * multiplier) : "";
      }
      return next;
    }));
  };

  const handleItemChange = async (index: number, itemId: string) => {
    const selectedItem = inventoryItems.find((item) => item.id === itemId);
    if (!selectedItem) {
      updateLine(index, { item: "", unit: "", unit_price: "", total_price: "" });
      return;
    }
    try {
      const unitPrice = await getStockPrice(itemId);
      updateLine(index, { item: itemId, unit: selectedItem.unidade_medida || "", unit_price: unitPrice });
    } catch {
      updateLine(index, { item: itemId, unit: selectedItem.unidade_medida || "" });
    }
  };

  const handleSaveApplications = async (conclude: boolean) => {
    const validLines = lines.filter((line) => line.item && line.quantity);
    if (!plantation || validLines.length === 0 || !form.date) return;

    try {
      setSaving(true);
      await Promise.all(validLines.map((line) => {
        const basePayload = {
          plantation: plantation.id,
          item: line.item,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unit_price || null,
          total_price: line.total_price || calculateLineTotal(line.quantity, line.unit_price) || "0",
          operator: form.operator,
          notes: form.notes,
        };

        if (kind === "plantio") {
          return cropService.createPlanting({ ...basePayload, planting_date: form.date });
        }
        if (kind === "adubacao") {
          return cropService.createFertilization({ ...basePayload, application_date: form.date });
        }
        if (kind === "fertirrigacao") {
          return cropService.createFertigation({ ...basePayload, application_date: form.date });
        }
        const validEquipments = equipments.filter((equipment) => equipment.equipment);
        return cropService.createPesticideApplication({
          ...basePayload,
          pesticide_type: line.pesticide_type || "other",
          application_date: form.date,
          equipments: validEquipments.map((equipment) => ({
            equipment: equipment.equipment,
            quantity: equipment.quantity ? Number(equipment.quantity) : null,
            unit_price: equipment.unit_price ? Number(equipment.unit_price) : null,
            total_price: equipment.total_price ? Number(equipment.total_price) : null,
          })),
        });
      }));

      if (conclude) {
        router.push(`/home/plantacoes/${id}`);
        return;
      }

      await fetchHistory();
      setLines([emptyLine(kind)]);
      setForm({ date: "", operator: "", notes: "" });
      setEquipments([{ equipment: "", quantity: "", unit_price: "", total_price: "" }]);
    } catch (error) {
      console.error("Erro ao salvar lançamento", error);
      alert("Erro ao salvar o lançamento. Verifique os dados informados.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveIrrigation = async (conclude: boolean) => {
    if (!plantation || !irrigationForm.start_date || !irrigationForm.pump_equipment) return;

    try {
      setSaving(true);
      await cropService.createIrrigation({
        plantation: plantation.id,
        start_date: irrigationForm.start_date,
        end_date: irrigationForm.end_date || irrigationForm.start_date,
        irrigation_system: irrigationForm.irrigation_system,
        pump_equipment: irrigationForm.pump_equipment,
        hours_per_day: irrigationForm.hours_per_day || null,
        kwh_value: irrigationForm.kwh_value || null,
        operator: irrigationForm.operator,
        notes: irrigationForm.notes,
      });

      if (conclude) {
        router.push(`/home/plantacoes/${id}`);
        return;
      }

      await fetchHistory();
      setIrrigationForm({ start_date: "", end_date: "", irrigation_system: "", pump_equipment: "", hours_per_day: "", kwh_value: "", operator: "", notes: "" });
    } catch (error) {
      console.error("Erro ao salvar irrigação", error);
      alert("Erro ao salvar a irrigação. Verifique os dados informados.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePump = async () => {
    if (!pumpForm.name || !pumpForm.power_cv || !pumpForm.flow_rate_l_per_h) return;
    try {
      setSavingPump(true);
      const { data } = await cropService.createIrrigationPump({
        name: pumpForm.name,
        power_cv: pumpForm.power_cv,
        flow_rate_l_per_h: pumpForm.flow_rate_l_per_h,
      });
      setPumps((prev) => [...prev, data]);
      setIrrigationForm((prev) => ({ ...prev, pump_equipment: data.id }));
      setPumpForm({ name: "", power_cv: "", flow_rate_l_per_h: "" });
      setPumpModalOpen(false);
    } catch (error) {
      console.error("Erro ao cadastrar bomba", error);
    } finally {
      setSavingPump(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <Skeleton height="50px" width="300px" className="mb-4" />
        <Skeleton height="260px" className="mb-4" />
        <Skeleton height="320px" />
      </div>
    );
  }

  if (!plantation) {
    return <div className="p-4 text-muted">Plantação nao encontrada.</div>;
  }

  return (
    <div className="position-relative overflow-hidden" style={{ minHeight: "100vh" }}>
      <div className="mb-3 d-flex align-items-center gap-2 text-muted small fw-medium">
        <span style={{ cursor: "pointer" }} onClick={() => router.push(`/home/plantacoes/${id}`)} className="hover-text-primary">
          {plantation.name || plantation.crop_name}
        </span>
        <span>›</span>
        <span>{plantation.field_name || "Talhão"}</span>
        <span>›</span>
        <span className="text-primary fw-semibold">{config.title as string}</span>
      </div>

      <div className="d-flex align-items-center gap-3 mb-4">
        <button className="btn btn-outline-secondary btn-sm d-flex align-items-center justify-content-center" onClick={() => router.back()} style={{ width: 38, height: 38, borderRadius: 10 }}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="fw-black mb-1 text-foreground d-flex align-items-center gap-2" style={{ fontSize: "1.75rem" }}>
            <Icon size={28} className="text-primary" /> {config.title as string}
          </h1>
          <p className="text-muted-foreground small mb-0">{config.subtitle as string}</p>
        </div>
      </div>

      <div className="dashboard-card p-4 mb-4">
        {isIrrigation ? (
          <IrrigationForm
            form={irrigationForm}
            setForm={setIrrigationForm}
            pumps={pumps}
            selectedPump={selectedPump}
            onOpenPumpModal={() => setPumpModalOpen(true)}
            days={irrigationDays}
            hoursTotal={irrigationHoursTotal}
            energyKwh={irrigationEnergyKwh}
            energyCost={irrigationEnergyCost}
            waterLiters={irrigationWaterLiters}
          />
        ) : (
          <ApplicationForm
            kind={kind}
            config={config}
            lines={lines}
            items={filteredItems}
            form={form}
            equipments={equipments}
            setForm={setForm}
            setLines={setLines}
            updateLine={updateLine}
            handleItemChange={handleItemChange}
            setEquipments={setEquipments}
          />
        )}

        <div className="d-flex justify-content-between align-items-center mt-4 pt-3 border-top gap-3 flex-wrap">
          <Button variant="outline-secondary" onClick={() => router.back()} style={{ borderRadius: 10 }}>
            Cancelar
          </Button>
          <div className="d-flex gap-2">
            <Button variant="outline-primary" disabled={saving} onClick={() => isIrrigation ? handleSaveIrrigation(false) : handleSaveApplications(false)} style={{ borderRadius: 10 }}>
              <Save size={16} />
              {saving ? "Salvando..." : "Salvar"}
            </Button>
            <Button disabled={saving} onClick={() => isIrrigation ? handleSaveIrrigation(true) : handleSaveApplications(true)} style={{ borderRadius: 10 }}>
              {saving ? "Salvando..." : "Salvar e concluir"}
            </Button>
          </div>
        </div>
      </div>

      <div className="dashboard-card p-4 mb-4">
        <h2 className="fw-black text-foreground mb-3" style={{ fontSize: "1.05rem" }}>
          {config.historyTitle as string}
        </h2>
        {isIrrigation ? <IrrigationHistory records={irrigationHistory} /> : <ApplicationHistory kind={kind} records={history} />}
      </div>

      <Modal
        isOpen={pumpModalOpen}
        onClose={() => setPumpModalOpen(false)}
        title="Cadastrar bomba"
        footer={
          <div className="d-flex gap-2 justify-content-end">
            <Button variant="outline-secondary" onClick={() => setPumpModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreatePump} disabled={savingPump}>{savingPump ? "Salvando..." : "Salvar bomba"}</Button>
          </div>
        }
      >
        <div className="p-4 p-md-5">
          <div className="row g-3">
            <div className="col-12">
              <label className="form-label small fw-medium">Nome da bomba *</label>
              <input className="form-control" value={pumpForm.name} onChange={(event) => setPumpForm({ ...pumpForm, name: event.target.value })} placeholder="Ex.: Bomba poço 01" />
            </div>
            <div className="col-6">
              <label className="form-label small fw-medium">Potência (CV) *</label>
              <input className="form-control" type="number" step="0.01" value={pumpForm.power_cv} onChange={(event) => setPumpForm({ ...pumpForm, power_cv: event.target.value })} />
            </div>
            <div className="col-6">
              <label className="form-label small fw-medium">Potência convertida</label>
              <div className="form-control bg-light">{fmt(cvToKw(pumpForm.power_cv))} kW</div>
            </div>
            <div className="col-12">
              <label className="form-label small fw-medium">Vazão (L/h) *</label>
              <input className="form-control" type="number" step="0.01" value={pumpForm.flow_rate_l_per_h} onChange={(event) => setPumpForm({ ...pumpForm, flow_rate_l_per_h: event.target.value })} />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ApplicationForm({
  kind,
  config,
  lines,
  items,
  form,
  equipments,
  setForm,
  setLines,
  updateLine,
  handleItemChange,
  setEquipments,
}: {
  kind: OperationKind;
  config: Record<string, unknown>;
  lines: ApplicationLine[];
  items: InventoryItem[];
  form: { date: string; operator: string; notes: string };
  equipments: { equipment: string; quantity: string; unit_price: string; total_price: string }[];
  setForm: (form: { date: string; operator: string; notes: string }) => void;
  setLines: React.Dispatch<React.SetStateAction<ApplicationLine[]>>;
  updateLine: (index: number, patch: Partial<ApplicationLine>) => void;
  handleItemChange: (index: number, itemId: string) => void;
  setEquipments: React.Dispatch<React.SetStateAction<{ equipment: string; quantity: string; unit_price: string; total_price: string }[]>>;
}) {
  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
        <strong className="small text-success">{config.itemTitle as string}</strong>
        <Button variant="outline-success" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine(kind)])}>
          <Plus size={16} /> Adicionar
        </Button>
      </div>

      <div className="table-responsive">
        <table className="table align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>{config.itemColumn as string}</th>
              {kind === "defensivos" && <th style={{ minWidth: 160 }}>Tipo</th>}
              <th style={{ minWidth: 130 }}>Quantidade</th>
              <th style={{ minWidth: 120 }}>Unidade</th>
              <th style={{ minWidth: 140 }}>Preço (R$)</th>
              <th style={{ minWidth: 150 }}>Valor total</th>
              <th className="text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td style={{ minWidth: 260 }}>
                  <select className="form-select" value={line.item} onChange={(event) => handleItemChange(index, event.target.value)}>
                    <option value="">{config.itemPlaceholder as string}</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome}{item.estoque_atual ? ` (${item.estoque_atual} ${item.unidade_medida || ""})` : ""}
                      </option>
                    ))}
                  </select>
                </td>
                {kind === "defensivos" && (
                  <td>
                    <select className="form-select" value={line.pesticide_type || "other"} onChange={(event) => updateLine(index, { pesticide_type: event.target.value })}>
                      {pesticideTypeOptions.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                    </select>
                  </td>
                )}
                <td>
                  <input className="form-control" type="number" step="0.01" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} />
                </td>
                <td>
                  <select className="form-select" value={line.unit} onChange={(event) => updateLine(index, { unit: event.target.value })}>
                    <option value="">Selecione...</option>
                    {unitOptions.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                  </select>
                </td>
                <td>
                  <input className="form-control bg-light" type="number" step="0.01" value={line.unit_price} readOnly title="Preço automatico do estoque" />
                </td>
                <td><div className="form-control bg-success-subtle fw-semibold text-success">{money(line.total_price)}</div></td>
                <td className="text-center">
                  <Button variant="outline-danger" size="sm" onClick={() => setLines((prev) => prev.length === 1 ? [emptyLine(kind)] : prev.filter((_, lineIndex) => lineIndex !== index))}>
                    <Trash2 size={16} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {items.length === 0 && <small className="text-muted">{config.emptyMessage as string}</small>}

      <div className="d-flex justify-content-between align-items-center rounded border bg-success-subtle px-3 py-2 flex-wrap gap-2">
        <span className="fw-medium">Total de itens: {lines.filter((line) => line.item).length}</span>
        <strong className="text-success">{config.totalLabel as string}: {money(lines.reduce((sum, line) => sum + Number(line.total_price || 0), 0))}</strong>
      </div>

      <div className="row g-3">
        <div className="col-md-6 col-12">
          <label className="form-label small fw-medium">{config.dateLabel as string} *</label>
          <input className="form-control" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
        </div>
        <div className="col-md-6 col-12">
          <label className="form-label small fw-medium">Operador</label>
          <input className="form-control" value={form.operator} onChange={(event) => setForm({ ...form, operator: event.target.value })} />
        </div>
        <div className="col-12">
          <label className="form-label small fw-medium">Observações</label>
          <textarea className="form-control" rows={3} maxLength={300} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          <div className="text-end text-muted small">{form.notes.length}/300</div>
        </div>
      </div>

      {kind === "defensivos" && (
        <div className="border rounded-3 overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="d-flex align-items-center justify-content-between px-3 py-2 flex-wrap gap-2" style={{ background: "rgba(16, 185, 129, 0.06)", borderBottom: "1px solid var(--border)" }}>
            <strong className="small text-success">Equipamentos utilizados</strong>
            <Button variant="outline-success" size="sm" onClick={() => setEquipments((prev) => [...prev, { equipment: "", quantity: "", unit_price: "", total_price: "" }])}>
              <Plus size={16} /> Adicionar equipamento
            </Button>
          </div>
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Equipamento</th>
                  <th style={{ minWidth: 160 }}>Quantidade</th>
                  <th style={{ minWidth: 160 }}>Valor unitário</th>
                  <th style={{ minWidth: 160 }}>Valor total</th>
                  <th className="text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {equipments.map((equipment, index) => (
                  <tr key={index}>
                    <td style={{ minWidth: 240 }}>
                      <input className="form-control" placeholder="Ex.: Pulverizador costal" value={equipment.equipment} onChange={(event) => setEquipments((prev) => prev.map((item, itemIndex) => itemIndex !== index ? item : { ...item, equipment: event.target.value }))} />
                    </td>
                    <td>
                      <input className="form-control" type="number" step="0.01" value={equipment.quantity} onChange={(event) => {
                        const quantity = event.target.value;
                        setEquipments((prev) => prev.map((item, itemIndex) => itemIndex !== index ? item : { ...item, quantity, total_price: quantity && item.unit_price ? String(Number(quantity) * Number(item.unit_price)) : "" }));
                      }} />
                    </td>
                    <td>
                      <input className="form-control" type="number" step="0.01" value={equipment.unit_price} onChange={(event) => {
                        const unitPrice = event.target.value;
                        setEquipments((prev) => prev.map((item, itemIndex) => itemIndex !== index ? item : { ...item, unit_price: unitPrice, total_price: unitPrice && item.quantity ? String(Number(unitPrice) * Number(item.quantity)) : "" }));
                      }} />
                    </td>
                    <td><div className="form-control bg-success-subtle fw-semibold text-success">{money(equipment.total_price)}</div></td>
                    <td className="text-center">
                      <Button variant="outline-danger" size="sm" onClick={() => setEquipments((prev) => prev.length === 1 ? [{ equipment: "", quantity: "", unit_price: "", total_price: "" }] : prev.filter((_, itemIndex) => itemIndex !== index))}>
                        <Trash2 size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function IrrigationForm({
  form,
  setForm,
  pumps,
  selectedPump,
  onOpenPumpModal,
  days,
  hoursTotal,
  energyKwh,
  energyCost,
  waterLiters,
}: {
  form: { start_date: string; end_date: string; irrigation_system: string; pump_equipment: string; hours_per_day: string; kwh_value: string; operator: string; notes: string };
  setForm: (form: { start_date: string; end_date: string; irrigation_system: string; pump_equipment: string; hours_per_day: string; kwh_value: string; operator: string; notes: string }) => void;
  pumps: IrrigationPump[];
  selectedPump?: IrrigationPump;
  onOpenPumpModal: () => void;
  days: number;
  hoursTotal: number;
  energyKwh: number;
  energyCost: number;
  waterLiters: number;
}) {
  return (
    <div className="row g-3">
      <div className="col-md-6 col-12">
        <label className="form-label small fw-medium">Data inicial *</label>
        <input className="form-control" type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value, end_date: form.end_date || event.target.value })} />
      </div>
      <div className="col-md-6 col-12">
        <label className="form-label small fw-medium">Data final</label>
        <input className="form-control" type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} />
      </div>
      <div className="col-md-6 col-12">
        <label className="form-label small fw-medium">Sistema de irrigação</label>
        <select className="form-select" value={form.irrigation_system} onChange={(event) => setForm({ ...form, irrigation_system: event.target.value })}>
          <option value="">Selecione...</option>
          {irrigationSystemOptions.map((system) => <option key={system.value} value={system.value}>{system.label}</option>)}
        </select>
      </div>
      <div className="col-md-6 col-12">
        <label className="form-label small fw-medium">Bomba utilizada *</label>
        <div className="input-group">
          <select className="form-select" value={form.pump_equipment} onChange={(event) => setForm({ ...form, pump_equipment: event.target.value })}>
            <option value="">Selecione...</option>
            {pumps.map((pump) => (
              <option key={pump.id} value={pump.id}>{pump.name} - {fmt(pump.power_cv)} CV / {fmt(pump.flow_rate_l_per_h, 0)} L/h</option>
            ))}
          </select>
          <Button variant="outline-success" onClick={onOpenPumpModal} title="Cadastrar nova bomba">
            <Plus size={16} />
          </Button>
        </div>
        {selectedPump && <small className="text-muted">Potência convertida: {fmt(selectedPump.power_kw)} kW</small>}
      </div>
      <div className="col-md-6 col-12">
        <label className="form-label small fw-medium">Horas de funcionamento por dia</label>
        <input className="form-control" type="number" step="0.1" value={form.hours_per_day} onChange={(event) => setForm({ ...form, hours_per_day: event.target.value })} placeholder="Ex.: 6.5" />
      </div>
      <div className="col-md-6 col-12">
        <label className="form-label small fw-medium">Valor do kWh</label>
        <input className="form-control" type="number" step="0.0001" value={form.kwh_value} onChange={(event) => setForm({ ...form, kwh_value: event.target.value })} />
      </div>
      <div className="col-md-6 col-12">
        <label className="form-label small fw-medium">Operador</label>
        <input className="form-control" value={form.operator} onChange={(event) => setForm({ ...form, operator: event.target.value })} />
      </div>
      <div className="col-md-6 col-12">
        <label className="form-label small fw-medium">Observações</label>
        <textarea className="form-control" rows={2} maxLength={300} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      </div>
      <div className="col-12">
        <div className="rounded border bg-success-subtle p-3">
          <div className="row g-3 small">
            <div className="col-6 col-md-3"><span className="text-muted d-block">Dias do período</span><strong>{days}</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted d-block">Horas totais</span><strong>{fmt(hoursTotal)} h</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted d-block">Energia</span><strong>{fmt(energyKwh)} kWh</strong></div>
            <div className="col-6 col-md-3"><span className="text-muted d-block">Custo energia</span><strong>{money(energyCost)}</strong></div>
            <div className="col-12"><span className="text-muted d-block">Volume total de água aplicado</span><strong>{fmt(waterLiters, 0)} L</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApplicationHistory({ kind, records }: { kind: OperationKind; records: ApplicationRecord[] }) {
  return (
    <div className="table-responsive">
      <table className="table align-middle mb-0">
        <thead className="table-light">
          <tr>
            <th>Data</th>
            <th>Insumo</th>
            {kind === "defensivos" && <th>Tipo</th>}
            <th>Quantidade</th>
            <th>Preço</th>
            <th>Total</th>
            <th>Operador</th>
            <th>Observações</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 ? (
            <tr>
              <td colSpan={kind === "defensivos" ? 8 : 7} className="text-center text-muted-foreground py-4">
                Nenhum lançamento registrado ainda.
              </td>
            </tr>
          ) : records.map((record) => (
            <tr key={record.id}>
              <td>{formatDate(kind === "plantio" ? record.planting_date : record.application_date)}</td>
              <td>{record.item_name || "-"}</td>
              {kind === "defensivos" && <td>{record.pesticide_type_display || "-"}</td>}
              <td>{fmt(record.quantity)} {record.unit || ""}</td>
              <td>{money(record.unit_price)}</td>
              <td className="fw-bold">{money(record.total_price)}</td>
              <td>{record.operator || "-"}</td>
              <td className="text-muted-foreground small">{record.notes || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IrrigationHistory({ records }: { records: IrrigationRecord[] }) {
  return (
    <div className="table-responsive">
      <table className="table align-middle mb-0">
        <thead className="table-light">
          <tr>
            <th>Periodo</th>
            <th>Sistema</th>
            <th>Bomba</th>
            <th>Dias</th>
            <th>Horas</th>
            <th>Agua</th>
            <th>Energia</th>
            <th>Custo</th>
            <th>Operador</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 ? (
            <tr>
              <td colSpan={9} className="text-center text-muted-foreground py-4">
                Nenhuma irrigação registrada ainda.
              </td>
            </tr>
          ) : records.map((record) => (
            <tr key={record.id}>
              <td>{formatDate(record.start_date || record.date)}{record.end_date ? ` - ${formatDate(record.end_date)}` : ""}</td>
              <td>{record.irrigation_system_display || "-"}</td>
              <td>{record.pump_name || "-"}</td>
              <td>{record.operating_days || "-"}</td>
              <td>{fmt(record.hours || record.hours_per_day)} h</td>
              <td>{fmt(record.liters_used, 0)} L</td>
              <td>{fmt(record.energy_kwh)} kWh</td>
              <td className="fw-bold">{money(record.energy_cost)}</td>
              <td>{record.operator || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
