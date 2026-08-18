"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Beef, Bird, Building2, Calculator, ClipboardList, Droplets, Ellipsis,
  ChevronRight, Info, Pencil, PiggyBank, Search, Trash2, Warehouse,
  Waves, PanelsTopLeft, Tractor, ListChecks, CircleAlert
} from "lucide-react";
import { useRouter } from "next/navigation";

import { apiClient } from "@/services/api";
import { farmStructureService } from "@/services/farmStructureService";
import type { Farm, FarmStructure, FarmStructureCategory, FarmStructureItem, FarmStructureSummary } from "@/types";
import { useToast } from "@/components/ui/Toast";

import styles from "./structure.module.css";
import axios from "axios";

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

const getCategoryPath = (cat: FarmStructureCategory) => {
  const map: Record<FarmStructureCategory, string> = {
    corral: "curral", pigsty: "chiqueiro", poultry_house: "galinheiro",
    warehouse: "armazem", irrigation: "irrigacao", water_reservoir: "reservatorio",
    facility: "instalacao", fence: "cerca", other: "outro"
  };
  return map[cat] || "outro";
};

export default function FarmStructurePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmId, setFarmId] = useState("");
  const [items, setItems] = useState<FarmStructure[]>([]);
  const [summary, setSummary] = useState<FarmStructureSummary | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
    } catch (requestError) {
      setError(apiMessage(requestError, "Não foi possível carregar a estrutura desta fazenda."));
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
        const initialFarmId = available[0]?.id || "";
        setFarmId(initialFarmId);
        if (initialFarmId) void loadStructures(initialFarmId);
        else setLoading(false);
      })
      .catch(() => { if (active) { setError("Não foi possível carregar as fazendas."); setLoading(false); } });
    return () => { active = false; };
  }, [loadStructures]);

  const reportRows = useMemo(() => items
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
    ]), [items]);

  const filteredReportRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return reportRows.filter((row) => !term || row.searchable.toLocaleLowerCase("pt-BR").includes(term));
  }, [reportRows, search]);

  const openCreate = (category: FarmStructureCategory) => {
    router.push(`/home/estrutura/${getCategoryPath(category)}`);
  };

  const openEdit = (item: FarmStructure) => {
    router.push(`/home/estrutura/${getCategoryPath(item.category)}?edit=${item.id}`);
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
              <p>Selecione uma opção para acessar o módulo correspondente.</p>
            </div>
          </div>
          <div className={styles.categoryGrid}>
            <button className={styles.categoryCard} onClick={() => router.push("/home/estrutura/propriedade")}>
              <div className={styles.categoryMain}><div className={styles.categoryIcon}><Building2 size={34} /></div><div><h3>Propriedade</h3><p>Cadastre uma nova fazenda para organizar talhões, plantações e estruturas.</p></div></div>
              <div className={styles.categoryFooter}><span>Acessar módulo</span><strong>Abrir <ChevronRight size={16} /></strong></div>
            </button>
            <button className={styles.categoryCard} onClick={() => router.push("/home/estrutura/maquinas")}>
              <div className={styles.categoryMain}><div className={styles.categoryIcon}><Tractor size={34} /></div><div><h3>Máquinas agrícolas e veículos</h3><p>Máquinas, implementos, caminhões e veículos da propriedade.</p></div></div>
              <div className={styles.categoryFooter}><span>Acessar módulo</span><strong>Abrir <ChevronRight size={16} /></strong></div>
            </button>
            <button className={styles.categoryCard} onClick={() => router.push("/home/estrutura/curral")}>
              <div className={styles.categoryMain}><div className={styles.categoryIcon}><Beef size={34} /></div><div><h3>Curral</h3><p>Estruturas de manejo para bovinos e criações de grande porte.</p></div></div>
              <div className={styles.categoryFooter}><span>Acessar módulo</span><strong>Abrir <ChevronRight size={16} /></strong></div>
            </button>
            {categories.map(({ value, label, description, icon: Icon }) => (
              <button key={value} className={styles.categoryCard} onClick={() => openCreate(value)}>
                <div className={styles.categoryMain}><div className={styles.categoryIcon}><Icon size={34} /></div><div><h3>{label}</h3><p>{description}</p></div></div>
                <div className={styles.categoryFooter}>
                  <span>Acessar módulo</span>
                  <strong>Abrir <ChevronRight size={16} /></strong>
                </div>
              </button>
            ))}
          </div>
        </section>

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
            <button onClick={() => document.getElementById("structure-report")?.scrollIntoView({ behavior: "smooth" })}><ListChecks size={20} /><span><strong>Ver todos os itens</strong><small>Lista consolidada</small></span></button>
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <div className={styles.summaryCard}>
      <Icon size={28} />
      <div className={styles.summaryInfo}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </div>
  );
}

function StructureReportRow({ structure, canDelete, onEdit, onRemove }: {
  structure: FarmStructure;
  canDelete: boolean;
  onEdit: (item: FarmStructure) => void;
  onRemove: (item: FarmStructure) => Promise<void>;
}) {
  return (
    <tr>
      <td><span className={`badge border ${styles.badge} ${styles.badgeStructure}`}>{structure.category_label}</span></td>
      <td><strong>{structure.name}</strong>{structure.description && <div className="text-muted small text-truncate" style={{ maxWidth: 250 }}>{structure.description}</div>}</td>
      <td>Estrutura principal</td>
      <td>{structure.built_area_m2 ? `${structure.built_area_m2} m²` : "—"}</td>
      <td>{structure.quantity}</td>
      <td>{money(Number(structure.acquisition_value) * structure.quantity)}</td>
      <td className="text-success fw-semibold">{money(Number(structure.current_value) * structure.quantity)}</td>
      <td className="text-end">
        <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => onEdit(structure)} title="Editar dados da estrutura"><Pencil size={15} /></button>
        {canDelete && <button className="btn btn-sm btn-outline-danger" onClick={() => void onRemove(structure)} title="Excluir estrutura"><Trash2 size={15} /></button>}
      </td>
    </tr>
  );
}

function MaterialReportRow({ structure, material, canDelete, onRemoved }: {
  structure: FarmStructure;
  material: FarmStructureItem;
  canDelete: boolean;
  onRemoved: () => void;
}) {
  return (
    <tr className={styles.materialRow}>
      <td><span className={`badge border ${styles.badge} ${styles.badgeMaterial}`}>Item utilizado</span></td>
      <td><strong>{material.name}</strong></td>
      <td className="text-truncate" style={{ maxWidth: 150 }}>{structure.name}</td>
      <td>—</td>
      <td>{material.quantity} {material.unit}</td>
      <td>{money(material.value)}</td>
      <td>—</td>
      <td className="text-end">
        {canDelete && <button className="btn btn-sm text-danger" onClick={() => void farmStructureService.removeItem(material.id).then(onRemoved)} title="Remover item da estrutura"><Trash2 size={15} /></button>}
      </td>
    </tr>
  );
}
