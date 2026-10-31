"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { cowHead } from "@lucide/lab";
import homeStyles from "@/components/livestock/species-module-home.module.css";
import { LayoutDashboard, Tags, Scale, HeartPulse, Baby, Wheat, MapPin, Milk, BadgeDollarSign, ChartNoAxesCombined, RefreshCw, Plus, ChevronRight, ArrowLeft, Search, ClipboardList, CheckCircle2, Icon, type LucideProps } from "lucide-react";
import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";
import { Modal } from "@/components/ui/Modal";
import { clinicalService } from "@/services/clinicalService";
import { cattleService, cattleError, type CattleAnimal, type CattleBatch, type CattlePasture, type CattleGrazing, type CattleMilk, type CattleHistory, type CattleOverview, type CattleFeed, type CattleResource } from "@/services/cattleService";
import { CattleForm, type CattleField, type CattleFormSpec } from "./CattleForm";
import styles from "./cattle.module.css";
import { CattleManagementWorkspace } from "./CattleManagementWorkspace";

export type CattleView = "overview" | "animals" | "batches" | "weights" | "reproduction" | "health" | "pastures" | "grazings" | "milk" | "sales" | "feeding" | "reports" | "management";
type Row = CattleAnimal | CattleBatch | CattlePasture | CattleGrazing | CattleMilk | CattleFeed;
function CattleIcon(props: LucideProps) { return <Icon iconNode={cowHead} {...props} />; }
const root = "/home/rebanho/bovinos";
const modules = [
  { id: "overview", label: "Visão geral", href: root, icon: LayoutDashboard, description: "Indicadores do rebanho de corte e leite" },
  { id: "animals", label: "Animais", href: `${root}/cadastro`, icon: CattleIcon, description: "Brincos, raças, categorias e histórico individual" },
  { id: "batches", label: "Lotes", href: `${root}/lotes`, icon: Tags, description: "Cria, recria, engorda e reprodução" },
  { id: "management", label: "Manejos", href: `${root}/manejos`, icon: Tags, description: "Pesagens, sanidade e castração com conferência e confirmação" },
  { id: "weights", label: "Pesagens", href: `${root}/pesagens`, icon: Scale, description: "Peso atual, evolução e ganho médio diário" },
  { id: "reproduction", label: "Reprodução", href: `${root}/reproducao`, icon: Baby, description: "Coberturas, diagnóstico, partos e bezerras/os" },
  { id: "health", label: "Sanidade", href: `${root}/sanidade`, icon: HeartPulse, description: "Vacinas, exames, tratamentos e ocorrências" },
  { id: "pastures", label: "Pastagens", href: `${root}/pastos`, icon: MapPin, description: "Piquetes, área e ocupação por lote" },
  { id: "milk", label: "Leite", href: `${root}/leite`, icon: Milk, description: "Ordenhas por vaca e turno, produção e descarte" },
  { id: "feeding", label: "Alimentação", href: `${root}/racao`, icon: Wheat, description: "Consumo, fórmulas e produção de ração" },
  { id: "sales", label: "Vendas", href: `${root}/vendas`, icon: BadgeDollarSign, description: "Venda de lotes e receitas no financeiro" },
  { id: "reports", label: "Relatórios", href: `${root}/relatorios`, icon: ChartNoAxesCombined, description: "Inventário, custos e resultados do rebanho" },
];
const navigationGroups = [
  { id: "herd", label: "Rebanho", ids: ["animals", "batches", "pastures"] },
  { id: "management", label: "Manejo e reprodução", ids: ["management", "weights", "health", "reproduction"] },
  { id: "production", label: "Produção", ids: ["milk", "feeding"] },
  { id: "business", label: "Gestão e resultados", ids: ["sales", "reports"] },
];
const moduleTones: Record<string, string> = { animals: "green", batches: "orange", pastures: "emerald", management: "slate", weights: "blue", reproduction: "purple", health: "green", milk: "cyan", feeding: "blue", sales: "emerald", reports: "cyan" };
const categories = ["Bezerro", "Garrote", "Novilha", "Touro", "Matriz", "Vaca", "Terminação", "Reprodutor"];
const phases: Record<string, string> = { creche: "Cria", crescimento: "Recria", engorda: "Engorda", reproducao: "Reprodução" };
const statuses: Record<string, string> = { active: "Ativo", sold: "Vendido", finished: "Encerrado", dead: "Morto", em_preparo: "Em preparo", vazia: "Vazia", pronta: "Pronta", coberta: "Aguardando diagnóstico", gestante: "Gestante", lactante: "Em lactação", descanso: "Em descanso", ativa: "Ativo", aguardando_cobertura: "Aguardando cobertura" };
const sessions: Record<string, string> = { morning: "Manhã", afternoon: "Tarde", evening: "Noite" };
const number = (value: unknown) => value === undefined || value === null ? "—" : Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const date = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
const options = (values: string[] | Record<string, string>) => Array.isArray(values) ? values.map(value => ({ value, label: value })) : Object.entries(values).map(([value, label]) => ({ value, label }));
const notes: CattleField = { name: "notes", label: "Observações", type: "textarea" };
const dayField: CattleField = { name: "date", label: "Data", type: "date", required: true };
const positive = (name: string, label: string, required = true): CattleField => ({ name, label, type: "number", min: "0.01", step: "0.01", required });
const payload = (values: Record<string, string>) => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ""));
function Table({ columns, children }: { columns: string[]; children: ReactNode }) { return <div className="table-responsive"><table className={styles.table}><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }

export function CattleWorkspace({ view = "overview" }: { view?: CattleView }) {
  const access = useOrganizationAccess();
  const operator = access?.role === "operator";
  const canWrite = !!access && !access.read_only;
  const manager = !!access && !operator;
  const [overview, setOverview] = useState<CattleOverview | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [farms, setFarms] = useState<{ id: string; name: string }[]>([]);
  const [sales, setSales] = useState<Awaited<ReturnType<typeof cattleService.sales>>>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [category, setCategory] = useState("");
  const [farm, setFarm] = useState("");
  const [withdrawal, setWithdrawal] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<CattleFormSpec | null>(null);
  const [historyAnimal, setHistoryAnimal] = useState<CattleAnimal | null>(null);
  const [history, setHistory] = useState<CattleHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const resource: CattleResource = view === "batches" || view === "sales" ? "batches" : view === "milk" ? "milk" : view === "feeding" ? "feed" : view === "pastures" ? "pastures" : view === "grazings" ? "grazings" : "animals";

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      const params: Record<string, string | number> = { page, search };
      if ((resource === "animals" || resource === "batches") && status) params.status = status;
      if (farm) params.farm = farm;
      if (resource === "animals" && withdrawal) params.withdrawal = withdrawal;
      if (resource === "animals" && category) params.category = category;
      if (view === "reproduction") params.gender = "F";
      Promise.all([
        cattleService.overview(controller.signal, farm),
        cattleService.farms(controller.signal),
        ["overview", "reports", "management"].includes(view) ? Promise.resolve(null) : cattleService.list<Row>(resource, params, controller.signal),
        view === "sales" && manager ? cattleService.sales(controller.signal, farm) : Promise.resolve([]),
      ]).then(([summary, farms, data, sales]) => {
        if (controller.signal.aborted) return;
        setOverview(summary); setFarms(farms); setRows(data?.results || []); setCount(data?.count || 0); setSales(sales);
      }).catch(error => { if (!controller.signal.aborted) { setRows([]); setError(cattleError(error)); } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [view, resource, page, search, status, category, farm, withdrawal, refresh, manager]);

  useEffect(() => {
    if (!historyAnimal) return;
    const controller = new AbortController();
    cattleService.history(historyAnimal.id, controller.signal).then(data => { if (!controller.signal.aborted) setHistory(data); })
      .catch(error => { if (!controller.signal.aborted) setHistoryError(cattleError(error)); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [historyAnimal]);

  const farmField: CattleField = { name: "farm_id", label: "Fazenda", type: "select", required: true, options: farms.map(farm => ({ value: farm.id, label: farm.name })) };
  const farmInitial = farm || (farms.length === 1 ? farms[0].id : "");
  const openHistory = (animal: CattleAnimal) => { setHistory([]); setHistoryError(""); setHistoryLoading(true); setHistoryAnimal(animal); };
  async function resolveAnimal(values: Record<string, string>) {
    const data = await cattleService.list<CattleAnimal>("animals", { identifier: values.identifier.trim(), farm: values.farm_id, status: "active" });
    if (data.results.length !== 1) throw { response: { data: { detail: "Brinco não encontrado nesta fazenda. Cadastre o animal antes de registrar a ordenha." } } };
    return data.results[0];
  }
  function newAnimal(preset: { gender?: "F" | "M"; category?: string } = {}) {
    setForm({ title: "Cadastrar bovino", description: "Registro individual por brinco. Animais cadastrados individualmente não devem ser contados novamente em um lote coletivo.",
      initial: { farm_id: farmInitial, entry_date: today(), gender: "F", category: "Vaca", reproductive_status: "vazia", ...preset },
      fields: [farmField, { name: "identifier", label: "Brinco / identificação", required: true, maxLength: 50 }, { name: "gender", label: "Sexo", type: "select", required: true, options: options({ F: "Fêmea", M: "Macho" }) }, { name: "category", label: "Categoria", type: "select", required: true, options: options(categories) }, { name: "reproductive_status", label: "Situação inicial da fêmea", visibleWhen: { field: "gender", value: "F" }, type: "select", options: options({ vazia: "Vazia", em_preparo: "Em preparo", pronta: "Pronta para cobertura", lactante: "Em lactação", descanso: "Em descanso" }) }, { name: "breed_name_input", label: "Raça" }, { name: "birth_date", label: "Nascimento", type: "date", max: today() }, { name: "entry_date", label: "Entrada na fazenda", type: "date", required: true, max: today() }, positive("initial_weight_kg", "Peso de entrada (kg)", false), { name: "sire_name", label: "Pai (nome / registro)" }, { name: "dam_name", label: "Mãe (nome / registro)" }, notes],
      save: values => cattleService.create("animals", { ...payload(values), current_weight_kg: values.initial_weight_kg || null, reproductive_status: values.gender === "M" ? "ativa" : values.reproductive_status || "vazia" }),
    });
  }
  function editAnimal(animal: CattleAnimal) {
    setForm({ title: `Editar ${animal.identifier}`, initial: { identifier: animal.identifier, category: animal.category, notes: animal.notes || "" }, fields: [{ name: "identifier", label: "Brinco / identificação", required: true, maxLength: 50 }, { name: "category", label: "Categoria", type: "select", required: true, options: options(categories) }, notes], save: values => cattleService.update("animals", animal.id, values) });
  }
  function newBatch() {
    setForm({ title: "Cadastrar lote bovino", description: "Use lotes coletivos para animais sem cadastro individual. As quantidades não devem repetir os animais cadastrados por brinco.",
      initial: { farm_id: farmInitial, phase: "crescimento", category: "Garrote", entry_date: today(), origin: "purchased", gender: "Misto" },
      fields: [farmField, { name: "batch_code", label: "Código do lote", required: true, maxLength: 50 }, { name: "name", label: "Nome" }, { name: "phase", label: "Fase", type: "select", required: true, options: options(phases) }, { name: "category", label: "Categoria", type: "select", required: true, options: options(categories) }, { name: "quantity", label: "Quantidade de animais", type: "number", required: true, min: "1", step: "1" }, { name: "gender", label: "Sexo", type: "select", required: true, options: options({ M: "Machos", F: "Fêmeas", Misto: "Misto" }) }, { name: "origin", label: "Origem", type: "select", required: true, options: options({ purchased: "Comprado", born: "Nascido na fazenda", donated: "Doado" }) }, { name: "breed_name_input", label: "Raça" }, { name: "entry_date", label: "Entrada", type: "date", required: true, max: today() }, positive("avg_weight_kg", "Peso médio por animal (kg)", false), ...(manager ? [positive("purchase_value", "Valor total da compra (R$)", false)] : []), notes], save: values => cattleService.create("batches", payload(values)),
    });
  }
  function weighing(row: CattleAnimal | CattleBatch, batch = false) {
    setForm({ title: `Pesagem · ${batch ? (row as CattleBatch).batch_code : (row as CattleAnimal).identifier}`, description: batch ? "Informe o peso médio por animal do lote." : "A pesagem será adicionada ao histórico do animal.", initial: { weighing_date: today() }, fields: [positive("weight_kg", batch ? "Peso médio (kg/animal)" : "Peso (kg)"), { name: "weighing_date", label: "Data da pesagem", type: "date", required: true, max: today() }, notes], save: values => cattleService.action(batch ? "batches" : "animals", row.id, "register-weight", values) });
  }
  function mating(animal: CattleAnimal) {
    setForm({ title: `Cobertura · ${animal.identifier}`, initial: { mating_date: today(), mating_type: "natural" }, fields: [{ name: "mating_date", label: "Data da cobertura", type: "date", required: true, max: today() }, { name: "mating_type", label: "Método", type: "select", required: true, options: options({ natural: "Monta natural", ai: "Inseminação artificial", iatf: "IATF" }) }, { name: "sire_info", label: "Touro / identificação do sêmen", required: true }, notes], save: values => cattleService.action("animals", animal.id, "register-mating", values) });
  }
  function diagnosis(animal: CattleAnimal) {
    setForm({ title: `Diagnóstico de gestação · ${animal.identifier}`, initial: { diagnosis_date: today() }, fields: [{ name: "diagnosis_date", label: "Data do diagnóstico", type: "date", required: true, max: today() }, { name: "result", label: "Resultado", type: "select", required: true, options: options({ positive: "Positivo", negative: "Negativo" }) }], save: values => cattleService.action("animals", animal.id, "diagnose-pregnancy", values) });
  }
  function birth(animal: CattleAnimal) {
    setForm({ title: `Registrar parto · ${animal.identifier}`, description: "Para nascimento vivo, informe o brinco do bezerro. O cadastro será criado e vinculado à mãe.", initial: { date: today(), outcome: "alive", calf_gender: "F" }, fields: [{ ...dayField, max: today() }, { name: "outcome", label: "Resultado", type: "select", required: true, options: options({ alive: "Nascido vivo", stillborn: "Natimorto" }) }, { name: "calf_identifier", label: "Brinco do bezerro (nascido vivo)", maxLength: 50 }, { name: "calf_gender", label: "Sexo do bezerro", type: "select", options: options({ F: "Fêmea", M: "Macho" }) }, positive("weight_kg", "Peso ao nascer (kg)", false), notes], save: values => cattleService.action("animals", animal.id, "record-birth", payload(values)) });
  }
  function event(animal: CattleAnimal) {
    const kinds: Record<string, string> = { death: "Morte" };
    if (animal.reproductive_status === "gestante") kinds.abortion = "Perda gestacional / aborto";
    if (animal.category === "Bezerro") kinds.weaning = "Desmame";
    if (animal.gender === "M" && !animal.is_castrated) kinds.castration = "Castração";
    if (animal.gender === "F" && animal.is_lactating) kinds.dry_off = "Secagem";
    if (animal.gender === "F" && ["Vaca", "Matriz"].includes(animal.category) && !animal.is_lactating) kinds.start_lactation = "Iniciar lactação";
    setForm({ title: `Manejo · ${animal.identifier}`, description: "O desmame pode incluir peso e grupo de destino do bezerro; ele preserva a lactação da mãe. A secagem encerra a lactação sem interromper a gestação. Morte retira o animal do rebanho ativo.", initial: { date: today() }, fields: [{ name: "kind", label: "Manejo", type: "select", required: true, options: options(kinds) }, { ...dayField, max: today() }, ...(animal.category === "Bezerro" ? [positive("weight_kg", "Peso ao desmame (kg, apenas para desmame)", false), { name: "destination_group", label: "Grupo de manejo de destino (apenas desmame)", maxLength: 100 } satisfies CattleField] : []), { ...notes, required: true }], save: values => cattleService.action("animals", animal.id, "record-event", payload(values)) });
  }
  async function vaccination(animal: CattleAnimal) {
    setPreparing(true);
    try {
      const vaccines = (await cattleService.stockItems()).filter(item => ["vacina", "medicamento_vacina"].includes(item.categoria));
      setForm({ title: `Vacinação · ${animal.identifier}`, description: "Selecione a vacina do estoque para registrar o consumo. Para aplicações externas, informe o nome.", initial: { application_date: today(), dose_type: "primeira" }, fields: [{ name: "vaccine_item_id", label: "Vacina do estoque", type: "select", options: vaccines.map(item => ({ value: item.id, label: `${item.nome.slice(0, 30)}${item.nome.length > 30 ? "..." : ""} · ${number(item.estoque_atual)} ${item.unidade_medida}` })) }, { name: "vaccine_name", label: "Nome da vacina (aplicação externa)" }, { name: "application_date", label: "Data da aplicação", type: "date", required: true, max: today() }, { name: "dose_type", label: "Tipo de dose", type: "select", required: true, options: options({ unica: "Dose única", primeira: "1ª dose", segunda: "2ª dose", terceira: "3ª dose", reforco: "Reforço" }) }, positive("dosage_ml", "Dose aplicada (mL)", false), notes], save: values => cattleService.action("animals", animal.id, "register-vaccination", payload(values)) });
    } catch (error) { setError(cattleError(error)); } finally { setPreparing(false); }
  }
  function health(animal: CattleAnimal) {
    setForm({ title: `Registro sanitário · ${animal.identifier}`, initial: { application_date: today(), treatment_type: "exam" }, fields: [{ name: "treatment_type", label: "Tipo", type: "select", required: true, options: options({ medication: "Medicação", exam: "Exame", surgery: "Cirurgia", other: "Outro" }) }, { name: "description", label: "Descrição / resultado", type: "textarea", required: true }, { name: "application_date", label: "Data", type: "date", required: true, max: today() }, { name: "veterinary", label: "Veterinário responsável" }, notes], save: values => clinicalService.createHealthRecord({ ...values, animal: animal.id, farm: animal.farm }) });
  }
  function newMilk() {
    setForm({ title: "Registrar ordenha", description: "Informe o brinco de uma fêmea bovina cadastrada na fazenda selecionada.", initial: { farm_id: farmInitial, date: today(), session: "morning", discarded_liters: "0" }, fields: [farmField, { name: "identifier", label: "Brinco da vaca", required: true, maxLength: 50 }, { ...dayField, max: today() }, { name: "session", label: "Turno", type: "select", required: true, options: options(sessions) }, positive("liters", "Produção total (litros)"), { name: "discarded_liters", label: "Leite descartado (litros)", type: "number", min: "0", step: "0.01", required: true }, { name: "discard_reason", label: "Motivo do descarte (obrigatório se houver descarte)", maxLength: 200 }, notes], save: async values => { const animal = await resolveAnimal(values); return cattleService.create("milk", { animal: animal.id, date: values.date, session: values.session, liters: values.liters, discarded_liters: values.discarded_liters, discard_reason: values.discard_reason || "", notes: values.notes || "" }); } });
  }
  async function newFeed() {
    setPreparing(true);
    try {
      const items = (await cattleService.stockItems()).filter(item => item.categoria === "racao" && item.unidade_medida === "kg" && ["", "bovino", "multiplo"].includes(item.especie_animal || ""));
      setForm({ title: "Registrar alimentação", description: "Informe um lote coletivo ou o brinco de um animal. A quantidade é o total consumido no período, com baixa no estoque.", initial: { farm_id: farmInitial, destination: "batch", data_inicio: today(), data_fim: today() }, fields: [farmField, { name: "destination", label: "Destino", type: "select", required: true, options: options({ batch: "Lote coletivo", animal: "Animal por brinco" }) }, { name: "identifier", label: "Código do lote ou brinco", required: true, maxLength: 50 }, { name: "item_estoque", label: "Ração em estoque (kg)", type: "select", required: true, options: items.map(item => ({ value: item.id, label: `${item.nome.slice(0, 30)}${item.nome.length > 30 ? "..." : ""} · ${number(item.estoque_atual)} kg` })) }, { name: "data_inicio", label: "Início do período", type: "date", required: true, max: today() }, { name: "data_fim", label: "Fim do período", type: "date", required: true, max: today() }, positive("quantidade", "Quantidade total consumida (kg)"), notes], save: async values => {
        let target: Record<string, unknown>;
        if (values.destination === "animal") target = { animais: [(await resolveAnimal(values)).id] };
        else {
          const data = await cattleService.list<CattleBatch>("batches", { batch_code: values.identifier.trim(), farm: values.farm_id, status: "active" });
          if (data.results.length !== 1) throw { response: { data: { detail: "Lote ativo não encontrado nesta fazenda." } } };
          target = { lote_animal: data.results[0].id };
        }
        return cattleService.create("feed", { ...target, item_estoque: values.item_estoque, data_inicio: values.data_inicio, data_fim: values.data_fim, quantidade: values.quantidade, tipo_registro: "total_periodo", observacao: values.notes || "" });
      } });
    } catch (error) { setError(cattleError(error)); } finally { setPreparing(false); }
  }
  async function exportCsv(resource: "animals" | "batches" | "milk") {
    setPreparing(true);
    try {
      const filters: Record<string, string> = farm ? { farm } : {};
      if (["animals", "batches"].includes(resource) && status) filters.status = status;
      if (resource === "animals" && category) filters.category = category;
      if (resource === "animals" && withdrawal) filters.withdrawal = withdrawal;
      if (search) filters.search = search;
      if (view === "reproduction") filters.gender = "F";
      const records = await cattleService.all<CattleAnimal & CattleBatch & CattleMilk>(resource, filters);
      const columns: [string, string][] = resource === "animals" ? [["identifier", "Brinco"], ["farm_name", "Fazenda"], ["category", "Categoria"], ["gender", "Sexo"], ["status", "Situação"], ["current_weight_kg", "Peso (kg)"], ["is_castrated", "Castrado"], ["is_lactating", "Em lactação"], ["management_group", "Grupo de manejo"], ["milk_withdrawal_until", "Carência leite até"], ["meat_withdrawal_until", "Carência abate até"]] : resource === "batches" ? [["batch_code", "Lote"], ["farm_name", "Fazenda"], ["category", "Categoria"], ["phase", "Fase"], ["quantity", "Cabeças"], ["avg_weight_kg", "Peso médio (kg)"]] : [["identifier", "Vaca"], ["farm_name", "Fazenda"], ["date", "Data"], ["session", "Turno"], ["liters", "Produção (L)"], ["discarded_liters", "Descarte (L)"], ["discard_reason", "Motivo do descarte"]];
      const escape = (value: unknown) => { let text = String(value ?? ""); if (/^[\s]*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; };
      const csv = [columns.map(([, label]) => escape(label)).join(";"), ...records.map(record => columns.map(([key]) => escape((record as unknown as Record<string, unknown>)[key])).join(";"))].join("\r\n");
      const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `bovinos-${resource}-${today()}.csv`; link.click(); URL.revokeObjectURL(url);
    } catch (error) { setError(cattleError(error)); } finally { setPreparing(false); }
  }
  function editMilk(row: CattleMilk) {
    setForm({ title: `Corrigir ordenha · ${row.identifier}`, initial: { date: row.date, session: row.session, liters: row.liters, discarded_liters: row.discarded_liters, discard_reason: row.discard_reason || "", notes: row.notes || "" }, fields: [{ ...dayField, max: today() }, { name: "session", label: "Turno", type: "select", required: true, options: options(sessions) }, positive("liters", "Produção total (litros)"), { name: "discarded_liters", label: "Descarte (litros)", type: "number", min: "0", step: "0.01", required: true }, { name: "discard_reason", label: "Motivo do descarte", maxLength: 200 }, notes], save: values => cattleService.update("milk", row.id, values) });
  }
  function newPasture() {
    setForm({ title: "Cadastrar pasto / piquete", initial: { farm_id: farmInitial }, fields: [farmField, { name: "name", label: "Nome do pasto", required: true }, positive("area_ha", "Área (ha)"), positive("max_stocking_ua_ha", "Lotação máxima (UA/ha, 1 UA = 450 kg)", false), notes], save: values => cattleService.create("pastures", { farm: values.farm_id, name: values.name, area_ha: values.area_ha, max_stocking_ua_ha: values.max_stocking_ua_ha || null, notes: values.notes || "" }) });
  }
  function editPasture(pasture: CattlePasture) {
    setForm({ title: `Editar pasto · ${pasture.name}`, initial: { name: pasture.name, area_ha: pasture.area_ha, max_stocking_ua_ha: pasture.max_stocking_ua_ha || "", notes: pasture.notes || "" }, fields: [{ name: "name", label: "Nome do pasto", required: true }, positive("area_ha", "Área (ha)"), positive("max_stocking_ua_ha", "Lotação máxima (UA/ha, 1 UA = 450 kg)", false), notes], save: values => cattleService.update("pastures", pasture.id, { ...values, max_stocking_ua_ha: values.max_stocking_ua_ha || null }) });
  }
  function grazing(pasture: CattlePasture) {
    setForm({ title: `Entrada no pasto · ${pasture.name}`, description: `Informe o código de um lote ativo da fazenda ${pasture.farm_name}.`, initial: { entry_date: today() }, fields: [{ name: "batch_code", label: "Código do lote", required: true, maxLength: 50 }, { name: "entry_date", label: "Entrada no pasto", type: "date", required: true, max: today() }, notes], save: async values => { const data = await cattleService.list<CattleBatch>("batches", { farm: pasture.farm, batch_code: values.batch_code.trim(), status: "active" }); if (data.results.length !== 1) throw { response: { data: { detail: "Lote ativo não encontrado nesta fazenda." } } }; return cattleService.create("grazings", { pasture: pasture.id, batch: data.results[0].id, entry_date: values.entry_date, notes: values.notes || "" }); } });
  }
  function closeGrazing(row: CattleGrazing) {
    setForm({ title: `Saída do pasto · ${row.batch_code}`, initial: { exit_date: today() }, fields: [{ name: "exit_date", label: "Data de saída", type: "date", min: row.entry_date, max: today(), required: true }], save: values => cattleService.action("grazings", row.id, "close", values) });
  }
  function changePhase(batch: CattleBatch) {
    setForm({ title: `Alterar fase · ${batch.batch_code}`, initial: { date: today() }, fields: [{ name: "phase", label: "Nova fase", type: "select", required: true, options: options(phases).filter(option => option.value !== batch.phase) }, { ...dayField, min: batch.entry_date, max: today() }, notes], save: values => cattleService.action("batches", batch.id, "change-phase", values) });
  }
  function sell(batch: CattleBatch) {
    setForm({ title: `Venda · ${batch.batch_code}`, description: `${batch.quantity} animais disponíveis. Informe o peso vivo total dos animais vendidos. A receita será registrada em aberto no financeiro; confirme o recebimento para movimentar o caixa.`, initial: { date: today(), due_date: today(), mode: "whole" }, fields: [{ name: "mode", label: "Tipo de venda", type: "select", required: true, options: options({ whole: "Lote inteiro", partial: "Parte do lote" }) }, { name: "quantity", label: "Quantidade (venda parcial)", type: "number", min: "1", max: String(batch.quantity), step: "1" }, positive("weight_kg", "Peso vivo total vendido (kg)"), positive("price_per_kg", "Preço por kg (R$)"), { ...dayField, min: batch.entry_date, max: today() }, { name: "buyer", label: "Comprador", required: true }, { name: "due_date", label: "Vencimento do recebimento", type: "date", required: true, min: today() }, notes], submitLabel: "Registrar venda e receita", save: values => cattleService.action("batches", batch.id, "register-sale", payload(values)) });
  }
  const activeModules = modules.filter(module => manager || !["sales", "reports", "management"].includes(module.id));
  const activeGroup = navigationGroups.find(group => group.ids.includes(view === "grazings" ? "pastures" : view));
  const currentModule = modules.find(module => module.id === (view === "grazings" ? "pastures" : view));
  const title = view === "grazings" ? "Ocupação dos pastos" : modules.find(module => module.id === view)?.label;
  const newAction = view === "animals" ? () => newAnimal() : view === "batches" ? newBatch : view === "milk" ? newMilk : view === "feeding" ? newFeed : view === "pastures" && manager ? newPasture : null;
  const metrics = overview ? [
    ["Animais ativos (cabeças)", number(overview.total_head)], ["Identificados por brinco", number(overview.identified_animals)], ["Lotes ativos", number(overview.active_batches)],
    ["Fêmeas gestantes identificadas", number(overview.pregnant_females)], ["Fêmeas em lactação identificadas", number(overview.lactating_females)], ["Peso médio dos identificados (kg)", number(overview.average_identified_weight)],
    ["Leite produzido no mês (L)", number(overview.milk_produced_month)], ["Leite aproveitável no mês (L)", number(overview.milk_usable_month)], ["Área de pastagens (ha)", number(overview.pasture_area_ha)],
  ] : [];
  const metricAppearance = [
    { icon: CattleIcon, tone: "rose" }, { icon: Tags, tone: "blue" }, { icon: ClipboardList, tone: "amber" },
    { icon: Baby, tone: "purple" }, { icon: Milk, tone: "pink" }, { icon: Scale, tone: "blue" },
    { icon: Milk, tone: "cyan" }, { icon: Milk, tone: "emerald" }, { icon: MapPin, tone: "emerald" },
  ];
  const animalsTable = ["animals", "weights", "reproduction", "health"].includes(view);
  return <div className={styles.page}>
    {view !== "overview" && <nav className={styles.breadcrumb} aria-label="Caminho da página"><Link href={root}><Icon iconNode={cowHead} size={16} /> Bovinos</Link><ChevronRight size={14} aria-hidden="true" /><span>{title}</span></nav>}
    <header className={styles.header}>
      <div className={styles.brand}><div className={homeStyles.titleIcon} aria-hidden="true"><Icon iconNode={cowHead} size={30} /></div><div><h1>{view === "overview" ? "Bovinos" : title}</h1><p>{view === "overview" ? "Gerencie todas as operações da bovinocultura de corte e leite" : currentModule?.description}</p></div></div>
      <div className={styles.headerActions}>
        {view !== "management" && <label className={styles.farmFilter}><span>Fazenda</span><select aria-label="Filtrar por fazenda" className="form-select form-select-sm" value={farm} onChange={event => { setFarm(event.target.value); setPage(1); }}><option value="">Todas as fazendas</option>{farms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <button className="btn btn-outline-secondary btn-sm" onClick={() => setRefresh(value => value + 1)} disabled={loading}><RefreshCw size={15} className="me-1" aria-hidden="true" /> Atualizar</button>
      </div>
    </header>
    {view !== "overview" && <div className={styles.navigation}>
      <nav className={styles.nav} aria-label="Áreas da bovinocultura"><Link href={root}><ArrowLeft size={15} /> Visão geral</Link>{navigationGroups.map(group => {
        const first = activeModules.find(module => group.ids.includes(module.id));
        return first ? <Link key={group.id} href={first.href} data-active={activeGroup?.id === group.id}>{group.label}</Link> : null;
      })}</nav>
      {activeGroup && <nav className={styles.contextNav} aria-label={activeGroup.label}>{activeModules.filter(module => activeGroup.ids.includes(module.id)).map(module => <Link key={module.id} href={module.href} aria-current={currentModule?.id === module.id ? "page" : undefined}><module.icon size={17} aria-hidden="true" />{module.label}</Link>)}</nav>}
    </div>}
    {success && <div role="status" className="alert alert-success py-2">{success}</div>}
    {error && <div role="alert" className="alert alert-danger">{error} <button className="btn btn-sm btn-outline-danger" onClick={() => setRefresh(value => value + 1)}>Tentar novamente</button></div>}
    {loading && !overview ? <div className={styles.empty} role="status">Carregando dados do rebanho...</div> : !error && <>
      {(["overview", "reports", "milk"].includes(view)) && <section className={homeStyles.summaryPanel} aria-labelledby="cattle-summary-title">
        <div className={homeStyles.sectionHeading}><div><span>{view === "milk" ? "Produção leiteira" : "Visão geral do rebanho"}</span><h2 id="cattle-summary-title">{view === "milk" ? "Resumo da produção de leite" : "Resumo da Bovinocultura"}</h2></div><small className={styles.summaryScope}>{farm ? farms.find(item => item.id === farm)?.name : "Todas as fazendas"}</small></div>
        <div className={homeStyles.metricsGrid} aria-busy={loading}>{metrics.map(([label, value], index) => {
          if (view === "milk" && !label.startsWith("Leite") && !label.startsWith("Fêmeas em lactação")) return null;
          const appearance = metricAppearance[index];
          return <article className={`${homeStyles.metricCard} ${styles.overviewMetric}`} data-tone={appearance.tone} key={label}><div className={homeStyles.metricIcon} aria-hidden="true"><appearance.icon size={27} strokeWidth={1.9} /></div><div><strong>{value}</strong><span>{label}</span></div></article>;
        })}</div>
      </section>}
      {view === "management" ? (manager ? <CattleManagementWorkspace farms={farms} canWrite={canWrite} onChanged={() => setRefresh(value => value + 1)} /> : <p role="alert">Manejos coletivos exigem gerente ou administrador.</p>) : ["overview", "reports"].includes(view) ? <>
        {view === "overview" && <section aria-labelledby="cattle-modules-title" className={styles.operations}>
          <div className={homeStyles.modulesHeading}><div><span>Operações</span><h2 id="cattle-modules-title">O que você deseja acessar?</h2></div><p>Escolha uma área para continuar a gestão do rebanho.</p></div>
          <div className={homeStyles.moduleGrid}>{activeModules.filter(module => module.id !== "overview").map(module => <Link className={homeStyles.moduleCard} data-tone={moduleTones[module.id]} href={module.href} key={module.id}><div className={homeStyles.moduleIcon} aria-hidden="true"><module.icon size={29} /></div><div className={homeStyles.moduleCopy}><h3>{module.label}</h3><p>{module.description}</p></div><span className={homeStyles.moduleAction}>Acessar <ChevronRight size={19} aria-hidden="true" /></span></Link>)}</div>
        </section>}
        <div className={styles.insightGrid}><section className={styles.panel}><div className={styles.sectionTitle}><ChartNoAxesCombined size={20} aria-hidden="true" /><div><span>Inventário</span><h2>Composição do rebanho ativo</h2></div></div>{overview?.categories.length ? overview.categories.map(item => <div className={styles.category} key={item.category}><span>{item.category}</span><progress value={item.quantity} max={overview.total_head} aria-label={item.category} /><strong>{number(item.quantity)}</strong></div>) : <p className={styles.muted}>Nenhum animal ativo cadastrado. Comece pelo cadastro individual ou pelos lotes.</p>}</section>
        {overview?.agenda.length ? <section className={styles.panel}><div className={styles.sectionTitle}><Baby size={20} aria-hidden="true" /><div><span>Próximas atividades</span><h2>Agenda do rebanho</h2></div></div>{overview.agenda.map((event, index) => <div className={styles.event} key={`${event.kind}-${index}`}><time>{date(event.date)}{event.date < today() ? " · Data passada — conferir" : ""}</time><strong>{event.title}</strong></div>)}</section> : <section className={styles.panel}><div className={styles.sectionTitle}><Baby size={20} aria-hidden="true" /><div><span>Próximas atividades</span><h2>Agenda do rebanho</h2></div></div><p className={styles.empty}>Nenhum parto ou procedimento previsto para os filtros selecionados.</p></section>}</div>
        {view === "reports" && manager && <section className={styles.panel}><h2>Exportar registros bovinos</h2><div className={styles.actions}>{(["animals", "batches", "milk"] as const).map(resource => <button key={resource} disabled={preparing} className="btn btn-outline-success btn-sm" onClick={() => exportCsv(resource)}>{preparing ? "Preparando..." : { animals: "Animais (CSV)", batches: "Lotes (CSV)", milk: "Ordenhas (CSV)" }[resource]}</button>)}</div></section>}

      </> : <>
        {view === "animals" && canWrite && <section className={styles.registrationGrid} aria-label="Ações de cadastro">{[
          { title: "Fêmeas e matrizes", description: "Cadastre vacas e novilhas do rebanho.", icon: Baby, tone: "purple", features: ["Ciclos reprodutivos", "Partos e genealogia", "Lactação independente"], action: () => newAnimal({ gender: "F", category: "Vaca" }), button: "Cadastrar fêmea" },
          { title: "Machos e reprodutores", description: "Identificação e acompanhamento individual.", icon: CattleIcon, tone: "blue", features: ["Brinco e raça", "Pesagens individuais", "Histórico de manejos"], action: () => newAnimal({ gender: "M", category: "Touro" }), button: "Cadastrar macho" },
          { title: "Lotes coletivos", description: "Animais sem identificação individual.", icon: Tags, tone: "orange", features: ["Cria, recria e engorda", "Controle de quantidade", "Peso médio por animal"], action: newBatch, button: "Cadastrar lote" },
        ].map(card => <article className={`${homeStyles.moduleCard} ${styles.registrationCard}`} data-tone={card.tone} key={card.title}><div className={homeStyles.moduleIcon}><card.icon size={27} aria-hidden="true" /></div><h2>{card.title}</h2><p className={styles.muted}>{card.description}</p><ul>{card.features.map(feature => <li key={feature}><CheckCircle2 size={14} aria-hidden="true" />{feature}</li>)}</ul><button className="btn btn-outline-success btn-sm" onClick={card.action}>{card.button}</button></article>)}</section>}
        <section className={`${styles.panel} ${styles.listPanel}`} aria-busy={loading}>
        <div className={styles.listHeading}><div className={styles.sectionTitle}>{currentModule && <currentModule.icon size={22} aria-hidden="true" />}<div><span>{view === "grazings" ? "Histórico de ocupação" : "Registros do rebanho"}</span><h2>{title}</h2><p>{currentModule?.description}</p></div></div><span className={styles.countBadge}>{number(count)} registros</span></div>
        <div className={styles.toolbar}><div className={styles.filters}>
          <label className={styles.searchField}><Search size={17} aria-hidden="true" /><input aria-label="Buscar registros" className="form-control form-control-sm" placeholder={view === "milk" ? "Buscar por brinco" : "Buscar registros..."} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
          {(resource === "animals" || resource === "batches") && <select aria-label="Situação" className="form-select form-select-sm" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>{Object.entries({ "": "Todas as situações", active: "Ativos", sold: "Vendidos", dead: "Mortos", finished: "Encerrados" }).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>}
          {resource === "animals" && <select aria-label="Categoria" className="form-select form-select-sm" value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}><option value="">Todas as categorias</option>{categories.map(value => <option key={value}>{value}</option>)}</select>}
          {resource === "animals" && <select aria-label="Filtrar carências" className="form-select form-select-sm" value={withdrawal} onChange={event => { setWithdrawal(event.target.value); setPage(1); }}><option value="">Todas as carências</option><option value="milk">Em carência de leite</option><option value="meat">Em carência de abate</option></select>}
        </div><div className={styles.actions}>{manager && ["animals", "batches", "milk"].includes(view) && <button disabled={preparing} className="btn btn-outline-secondary btn-sm" onClick={() => exportCsv(resource as "animals" | "batches" | "milk")}>Exportar filtro (CSV)</button>}{view === "pastures" && <Link className="btn btn-outline-secondary btn-sm" href={`${root}/pastos/ocupacoes`}>Ver ocupações</Link>}{newAction && canWrite && <button className="btn btn-success btn-sm" disabled={preparing} onClick={newAction}><Plus size={15} aria-hidden="true" /> {({ animals: "Cadastrar animal", batches: "Cadastrar lote", milk: "Registrar ordenha", feeding: "Registrar consumo", pastures: "Cadastrar pasto" } as Partial<Record<CattleView, string>>)[view] || "Novo registro"}</button>}</div></div>
        {view === "feeding" && manager && <p><Link href={`${root}/racao/producao`}>Fábrica de ração</Link> · <Link href={`${root}/racao/gerenciar-formulas`}>Gerenciar fórmulas</Link></p>}
        {view === "feeding" && <Table columns={["Período", "Destino", "Ração", "Consumo", ...(manager ? ["Custo total"] : [])]}>{(rows as CattleFeed[]).map(row => <tr key={row.id}><td>{date(row.data_inicio)}<small>até {date(row.data_fim)}</small></td><td>{row.lote_codigo || row.animais_identificadores.join(", ")}</td><td>{row.item_nome}</td><td>{number(row.quantidade)} kg</td>{manager && <td>{Number(row.custo_total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>}</tr>)}</Table>}
        {view === "pastures" && <p className={styles.muted}>Lotação atual dos lotes coletivos em ocupação, usando seus pesos médios. 1 UA = 450 kg. Animais sem peso impedem o cálculo da capacidade.</p>}
        {view === "batches" && <p className={styles.muted}>Lotes coletivos de animais sem identificação individual. Para registrar uma pesagem, informe o peso médio por animal.</p>}
        {animalsTable && <Table columns={["Brinco / fazenda", "Categoria / raça", "Sexo", view === "reproduction" ? "Fase reprodutiva" : "Peso atual", "Ações"]}>{(rows as CattleAnimal[]).map(animal => <tr key={animal.id}><td><strong>{animal.identifier}</strong><small>{animal.farm_name}</small>{animal.management_group && <small>Grupo: {animal.management_group}</small>}{animal.is_castrated && <small>Castrado</small>}{animal.is_lactating && <small>Em lactação</small>}{animal.milk_withdrawal_until && animal.milk_withdrawal_until >= today() && <small className="text-danger">Carência leite até {date(animal.milk_withdrawal_until)}</small>}{animal.meat_withdrawal_until && animal.meat_withdrawal_until >= today() && <small className="text-danger">Carência abate até {date(animal.meat_withdrawal_until)}</small>}</td><td>{animal.category || "—"}<small>{animal.breed_name || "Raça não informada"}</small></td><td>{animal.gender === "F" ? "Fêmea" : "Macho"}</td><td>{view === "reproduction" ? <span className={styles.status}>{statuses[animal.reproductive_status] || animal.reproductive_status}</span> : `${number(animal.current_weight_kg)} kg`}</td><td><div className={styles.actions}>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => openHistory(animal)}>Ficha / histórico</button>
          {canWrite && animal.status === "active" && <>
            {view === "animals" && manager && <button className="btn btn-outline-secondary btn-sm" onClick={() => editAnimal(animal)}>Editar</button>}
            {["animals", "weights"].includes(view) && <button className="btn btn-outline-success btn-sm" onClick={() => weighing(animal)}>Pesar</button>}
            {view === "health" && <><button className="btn btn-outline-success btn-sm" onClick={() => vaccination(animal)}>Vacinar</button><button className="btn btn-outline-secondary btn-sm" onClick={() => health(animal)}>Exame / tratamento</button></>}
            {view === "reproduction" && <>{animal.reproductive_status === "coberta" ? <button className="btn btn-outline-success btn-sm" onClick={() => diagnosis(animal)}>Diagnóstico</button> : animal.reproductive_status === "gestante" ? <button className="btn btn-outline-success btn-sm" onClick={() => birth(animal)}>Parto</button> : <button className="btn btn-outline-success btn-sm" onClick={() => mating(animal)}>Cobertura / IA</button>}</>}
            {view === "animals" && manager && <button className="btn btn-outline-secondary btn-sm" onClick={() => event(animal)}>Manejo / baixa</button>}
          </>}
        </div></td></tr>)}</Table>}
        {(view === "batches" || view === "sales") && <Table columns={["Lote / fazenda", "Categoria / fase", "Cabeças", "Peso médio", "Ações"]}>{(rows as CattleBatch[]).map(batch => <tr key={batch.id}><td><strong>{batch.batch_code}</strong><small>{batch.farm_name}</small></td><td>{batch.category}<small>{phases[batch.phase] || batch.phase}</small></td><td>{number(batch.quantity)}</td><td>{number(batch.avg_weight_kg)} kg</td><td><div className={styles.actions}>{batch.status === "active" && canWrite && <>{view === "batches" && <button className="btn btn-outline-success btn-sm" onClick={() => weighing(batch, true)}>Pesar lote</button>}{manager && <>{view === "batches" && <button className="btn btn-outline-secondary btn-sm" onClick={() => changePhase(batch)}>Alterar fase</button>}<button className="btn btn-outline-secondary btn-sm" onClick={() => sell(batch)}>Vender</button></>}</>}</div></td></tr>)}</Table>}
        {view === "milk" && <Table columns={["Data / turno", "Vaca / fazenda", "Produção", "Descarte", "Aproveitável", ...(manager ? ["Ações"] : [])]}>{(rows as CattleMilk[]).map(row => <tr key={row.id}><td>{date(row.date)}<small>{sessions[row.session]}</small></td><td><strong>{row.identifier}</strong><small>{row.farm_name}</small></td><td>{number(row.liters)} L</td><td>{number(row.discarded_liters)} L<small>{row.discard_reason}</small></td><td>{number(Number(row.liters) - Number(row.discarded_liters))} L</td>{manager && <td><button className="btn btn-outline-secondary btn-sm" onClick={() => editMilk(row)}>Corrigir</button></td>}</tr>)}</Table>}
        {view === "pastures" && <Table columns={["Pasto / piquete", "Fazenda", "Área", "Lotação / capacidade", "Ações"]}>{(rows as CattlePasture[]).map(row => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.notes}</small></td><td>{row.farm_name}</td><td>{number(row.area_ha)} ha</td><td>{number(row.occupancy.heads)} cabeças<small>{row.occupancy.stocking_ua_ha === null ? "Peso insuficiente para calcular UA/ha" : `${number(row.occupancy.stocking_ua_ha)} UA/ha`}</small><small className={Number(row.occupancy.capacity_percent) > 100 ? "text-danger" : ""}>{row.occupancy.capacity_percent === null ? "Capacidade não calculada" : `${number(row.occupancy.capacity_percent)}% da capacidade`}</small></td><td>{canWrite && manager && <div className={styles.actions}><button className="btn btn-outline-success btn-sm" onClick={() => grazing(row)}>Entrada de lote</button><button className="btn btn-outline-secondary btn-sm" onClick={() => editPasture(row)}>Editar capacidade</button></div>}</td></tr>)}</Table>}
        {view === "grazings" && <Table columns={["Pasto", "Lote", "Cabeças atuais", "Entrada", "Saída", "Ações"]}>{(rows as CattleGrazing[]).map(row => <tr key={row.id}><td>{row.pasture_name}</td><td>{row.batch_code}</td><td>{number(row.quantity)}</td><td>{date(row.entry_date)}</td><td>{row.exit_date ? date(row.exit_date) : "Em ocupação"}</td><td>{!row.exit_date && canWrite && manager && <button className="btn btn-outline-secondary btn-sm" onClick={() => closeGrazing(row)}>Registrar saída</button>}</td></tr>)}</Table>}
        {!rows.length && <div className={styles.empty}>Nenhum registro encontrado para os filtros selecionados.</div>}
        <div className={styles.pagination}><span>{number(count)} registros · página {page}</span><button className="btn btn-outline-secondary btn-sm" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</button><button className="btn btn-outline-secondary btn-sm" disabled={page * 30 >= count} onClick={() => setPage(value => value + 1)}>Próxima</button></div>
      </section></>}
      {view === "sales" && manager && <section className={styles.panel}><h2>Últimas vendas registradas</h2><Table columns={["Data", "Lote", "Cabeças", "Comprador", "Receita"]}>{sales.map(sale => <tr key={sale.id}><td>{date(sale.date)}</td><td>{sale.batch_code}</td><td>{number(sale.quantity)}</td><td>{sale.buyer}</td><td>{Number(sale.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td></tr>)}</Table>{!sales.length && <p className={styles.empty}>Nenhuma venda registrada.</p>}</section>}
    </>}
    {form && <CattleForm spec={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); setSuccess("Registro salvo com sucesso."); setRefresh(value => value + 1); }} />}
    {historyAnimal && <Modal isOpen onClose={() => setHistoryAnimal(null)} maxWidth={styles.formDialog} title={`Ficha do bovino · ${historyAnimal.identifier}`} description={`${historyAnimal.category || "Bovino"} · ${historyAnimal.farm_name}`}><div className={styles.form}>
      <div className={styles.metrics}><article className={styles.metric}><span>Peso atual</span><strong>{number(historyAnimal.current_weight_kg)} kg</strong></article><article className={styles.metric}><span>Nascimento</span><strong style={{ fontSize: "1rem" }}>{date(historyAnimal.birth_date)}</strong></article></div>
      <p className={styles.muted}>Raça: {historyAnimal.breed_name || "Não informada"} · Sexo: {historyAnimal.gender === "F" ? "Fêmea" : "Macho"} · Entrada: {date(historyAnimal.entry_date)}</p><p className={styles.muted}>Pai: {historyAnimal.sire_identifier || historyAnimal.sire_name || "Não informado"} · Mãe: {historyAnimal.dam_identifier || historyAnimal.dam_name || "Não informada"}</p><hr />
      {historyLoading ? <p role="status">Carregando histórico...</p> : historyError ? <p role="alert" className="text-danger">{historyError}</p> : <>
        {(() => { const weights = history.filter(event => event.type === "weight" && event.date && event.details?.weight_kg !== undefined).sort((a, b) => (b.date || "").localeCompare(a.date || "")); if (weights.length < 2) return null; const previous = weights.find(event => event.date !== weights[0].date); if (!previous) return null; const days = (Date.parse(weights[0].date!) - Date.parse(previous.date!)) / 86400000; return days > 0 ? <p className={styles.muted}>Ganho médio diário entre as duas últimas pesagens: <strong>{number((weights[0].details!.weight_kg! - previous.details!.weight_kg!) / days)} kg/dia</strong> ({days} dias).</p> : null; })()}
        {history.map((event, index) => <article className={styles.event} key={`${event.type}-${event.date}-${index}`}><time>{date(event.date)}</time><strong>{event.title}</strong><p>{event.subtitle}</p></article>)}{!history.length && <p className={styles.empty}>Nenhum manejo registrado para este animal.</p>}
      </>}
    </div></Modal>}
  </div>;
}
