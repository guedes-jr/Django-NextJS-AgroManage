"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  DollarSign,
  History,
  Plus,
  Save,
  UserRound,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { cropService } from "@/services/cropService";

type Plantation = {
  id: string;
  name?: string;
  crop_name?: string;
  field_name?: string;
  farm_name?: string;
};

type LaborWorker = {
  id: string;
  name: string;
  worker_type: "employee" | "provider";
  worker_type_display?: string;
  document?: string;
  phone?: string;
};

type LaborRecord = {
  id: string;
  activity_type: string;
  activity_type_display?: string;
  worker_name?: string;
  activity_date: string;
  daily_quantity: string | number;
  daily_rate: string | number;
  total_amount: string | number;
  notes?: string;
};

type LaborForm = {
  activity_type: string;
  worker: string;
  payment_method: "daily";
  activity_date: string;
  daily_quantity: string;
  daily_rate: string;
  notes: string;
};

type WorkerForm = {
  name: string;
  worker_type: "employee" | "provider";
  document: string;
  phone: string;
  notes: string;
};

const activityOptions = [
  { value: "land_preparation", label: "Preparo de terra" },
  { value: "planting", label: "Plantio" },
  { value: "fertilization", label: "Adubação" },
  { value: "fertigation", label: "Fertirrigação" },
  { value: "pesticide_application", label: "Aplicação de Defensivos" },
  { value: "irrigation", label: "Irrigação" },
  { value: "harvest", label: "Colheita" },
  { value: "other", label: "Outro" },
];

const today = () => new Date().toISOString().split("T")[0];

const currency = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

const decimalValue = (value: string | number | null | undefined) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;

  const trimmed = String(value).trim();
  const hasComma = trimmed.includes(",");
  const hasDot = trimmed.includes(".");
  const normalized = hasComma
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : hasDot && /^\d{1,3}(\.\d{3})+$/.test(trimmed)
      ? trimmed.replace(/\./g, "")
      : trimmed;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const recordDailyQuantity = (record: LaborRecord) => decimalValue(record.daily_quantity);
const recordDailyRate = (record: LaborRecord) => decimalValue(record.daily_rate);
const recordTotal = (record: LaborRecord) => recordDailyQuantity(record) * recordDailyRate(record);

const formatDate = (value: string) => {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
};

const extractArray = <T,>(data: unknown): T[] => {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && "results" in data) {
    const results = (data as { results?: unknown }).results;
    return Array.isArray(results) ? (results as T[]) : [];
  }
  return [];
};

export default function MaoObraPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [plantation, setPlantation] = useState<Plantation | null>(null);
  const [workers, setWorkers] = useState<LaborWorker[]>([]);
  const [laborRecords, setLaborRecords] = useState<LaborRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingWorker, setSavingWorker] = useState(false);
  const [showWorkerForm, setShowWorkerForm] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState<LaborForm>({
    activity_type: "pesticide_application",
    worker: "",
    payment_method: "daily",
    activity_date: today(),
    daily_quantity: "1",
    daily_rate: "",
    notes: "",
  });

  const [workerForm, setWorkerForm] = useState<WorkerForm>({
    name: "",
    worker_type: "employee",
    document: "",
    phone: "",
    notes: "",
  });

  useEffect(() => {
    if (!id) return;

    let active = true;

    Promise.all([
      cropService.get(id),
      cropService.listLaborWorkers({ is_active: true }),
      cropService.listLaborRecords({ plantation: id }),
    ])
      .then(([plantationRes, workersRes, recordsRes]) => {
        if (!active) return;
        setError("");
        setPlantation(plantationRes.data);
        setWorkers(extractArray<LaborWorker>(workersRes.data));
        setLaborRecords(extractArray<LaborRecord>(recordsRes.data));
      })
      .catch(() => {
        if (!active) return;
        setError("Não foi possível carregar os dados de mão de obra.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  const total = useMemo(() => {
    return decimalValue(form.daily_quantity) * decimalValue(form.daily_rate);
  }, [form.daily_quantity, form.daily_rate]);

  const selectedWorker = workers.find((worker) => worker.id === form.worker);

  const updateForm = (patch: Partial<LaborForm>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const updateWorkerForm = (patch: Partial<WorkerForm>) => {
    setWorkerForm((current) => ({ ...current, ...patch }));
  };

  const validateForm = () => {
    if (!form.activity_type) return "Selecione o tipo de atividade.";
    if (!form.worker) return "Selecione um funcionário ou prestador.";
    if (!form.activity_date) return "Informe a data da atividade.";
    if (decimalValue(form.daily_quantity) <= 0) return "A quantidade de diárias deve ser maior que zero.";
    if (decimalValue(form.daily_rate) <= 0) return "O valor da diária deve ser maior que zero.";
    if (form.notes.length > 300) return "As observações devem ter no máximo 300 caracteres.";
    return "";
  };

  const handleSaveWorker = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workerForm.name.trim() || savingWorker) return;

    try {
      setSavingWorker(true);
      const response = await cropService.createLaborWorker({
        name: workerForm.name.trim(),
        worker_type: workerForm.worker_type,
        document: workerForm.document.trim(),
        phone: workerForm.phone.trim(),
        notes: workerForm.notes.trim(),
        is_active: true,
      });
      const newWorker = response.data as LaborWorker;
      setWorkers((current) => [newWorker, ...current]);
      updateForm({ worker: newWorker.id });
      setWorkerForm({
        name: "",
        worker_type: "employee",
        document: "",
        phone: "",
        notes: "",
      });
      setShowWorkerForm(false);
    } catch {
      setError("Não foi possível cadastrar o trabalhador.");
    } finally {
      setSavingWorker(false);
    }
  };

  const handleSubmit = async () => {
    if (saving || !id) return;

    const validation = validateForm();
    if (validation) {
      setError(validation);
      return;
    }

    try {
      setSaving(true);
      setError("");
      await cropService.createLaborRecord({
        plantation: id,
        worker: form.worker,
        activity_type: form.activity_type,
        payment_method: form.payment_method,
        activity_date: form.activity_date,
        daily_quantity: decimalValue(form.daily_quantity),
        daily_rate: decimalValue(form.daily_rate),
        notes: form.notes.trim(),
      });
      const response = await cropService.listLaborRecords({ plantation: id });
      setLaborRecords(extractArray<LaborRecord>(response.data));
      setForm({
        activity_type: form.activity_type,
        worker: form.worker,
        payment_method: "daily",
        activity_date: today(),
        daily_quantity: "1",
        daily_rate: "",
        notes: "",
      });
    } catch {
      setError("Erro ao salvar o lançamento. Verifique os dados e tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <Skeleton height="56px" width="420px" className="mb-4" />
        <Skeleton height="420px" className="mb-3" />
        <Skeleton height="130px" />
      </div>
    );
  }

  if (!plantation) {
    return <div className="p-4 text-muted">Plantação não encontrada.</div>;
  }

  return (
    <div className="pb-4">
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
        <div className="d-flex align-items-start gap-3">
          <div
            className="d-flex align-items-center justify-content-center flex-shrink-0"
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "color-mix(in srgb, var(--primary), transparent 90%)",
              color: "var(--primary)",
            }}
          >
            <UserRound size={30} />
          </div>
          <div>
            <h1 className="fw-black text-foreground mb-1" style={{ fontSize: "1.75rem" }}>
              Mão de Obra
            </h1>
            <p className="text-muted-foreground mb-0">
              Registre os funcionários ou prestadores de serviço que trabalharam na lavoura.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-outline-secondary d-flex align-items-center gap-2 px-3"
          style={{ height: 46, borderRadius: 10, fontWeight: 700 }}
          onClick={() => router.push(`/home/plantacoes/${id}`)}
        >
          <ArrowLeft size={18} />
          Voltar para o passo a passo
        </button>
      </div>

      {error && (
        <div className="alert alert-danger py-2 px-3 mb-3" role="alert">
          {error}
        </div>
      )}

      <div className="dashboard-card p-4 mb-3">
        <h2 className="fw-black text-foreground mb-4" style={{ fontSize: "1.2rem" }}>
          Registrar mão de obra
        </h2>

        <div className="row g-4 align-items-end mb-4">
          <div className="col-12 col-lg-6">
            <label className="form-label fw-bold text-foreground">
              Tipo de atividade <span className="text-danger">*</span>
            </label>
            <select
              className="form-select"
              value={form.activity_type}
              onChange={(event) => updateForm({ activity_type: event.target.value })}
              style={{ height: 50, borderRadius: 10 }}
            >
              {activityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-lg-5">
            <label className="form-label fw-bold text-foreground">
              Funcionário / Prestador <span className="text-danger">*</span>
            </label>
            <select
              className="form-select"
              value={form.worker}
              onChange={(event) => updateForm({ worker: event.target.value })}
              style={{ height: 50, borderRadius: 10 }}
            >
              <option value="">Selecione</option>
              {workers.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-lg-1">
            <button
              type="button"
              className="btn btn-outline-success d-flex align-items-center justify-content-center gap-2 w-100"
              onClick={() => setShowWorkerForm(true)}
              style={{ height: 50, minWidth: 132, borderRadius: 10, fontWeight: 800 }}
            >
              <Plus size={20} />
              Cadastrar
            </button>
          </div>
        </div>

        <div className="mb-4">
          <div className="form-label fw-bold text-foreground mb-2">Forma de pagamento</div>
          <label
            className="d-flex align-items-center gap-3 p-3"
            htmlFor="daily-payment"
            style={{
              maxWidth: 700,
              border: "1px solid color-mix(in srgb, var(--primary), transparent 70%)",
              borderRadius: 10,
              background: "linear-gradient(90deg, color-mix(in srgb, var(--primary), transparent 95%), white)",
              cursor: "pointer",
            }}
          >
            <input
              id="daily-payment"
              className="form-check-input m-0"
              type="radio"
              checked={form.payment_method === "daily"}
              onChange={() => updateForm({ payment_method: "daily" })}
            />
            <CalendarDays size={34} className="text-muted-foreground" />
            <span>
              <span className="d-block fw-black text-foreground">Por diária</span>
              <span className="d-block text-muted-foreground small">
                Pagamento de acordo com a quantidade de diárias trabalhadas
              </span>
            </span>
          </label>
        </div>

        <div className="row g-4 mb-4">
          <div className="col-12 col-md-4">
            <label className="form-label fw-bold text-foreground">
              Data da atividade <span className="text-danger">*</span>
            </label>
            <input
              className="form-control"
              type="date"
              value={form.activity_date}
              onChange={(event) => updateForm({ activity_date: event.target.value })}
              style={{ height: 50, borderRadius: 10 }}
            />
          </div>

          <div className="col-12 col-md-4">
            <label className="form-label fw-bold text-foreground">
              Quantidade de diárias <span className="text-danger">*</span>
            </label>
            <div className="input-group">
              <input
                className="form-control"
                type="number"
                min="0"
                step="0.01"
                value={form.daily_quantity}
                onChange={(event) => updateForm({ daily_quantity: event.target.value })}
                style={{ height: 50, borderRadius: "10px 0 0 10px" }}
              />
              <span className="input-group-text bg-white text-muted-foreground" style={{ borderRadius: "0 10px 10px 0" }}>
                diária(s)
              </span>
            </div>
          </div>

          <div className="col-12 col-md-4">
            <label className="form-label fw-bold text-foreground">
              Valor da diária (R$) <span className="text-danger">*</span>
            </label>
            <input
              className="form-control"
              inputMode="decimal"
              value={form.daily_rate}
              onChange={(event) => updateForm({ daily_rate: event.target.value })}
              placeholder="150,00"
              style={{ height: 50, borderRadius: 10 }}
            />
          </div>
        </div>

        <div>
          <label className="form-label fw-bold text-foreground">Observações</label>
          <div className="position-relative">
            <textarea
              className="form-control"
              rows={4}
              maxLength={300}
              value={form.notes}
              onChange={(event) => updateForm({ notes: event.target.value })}
              placeholder="Descreva detalhes da atividade executada, local, equipe, equipamentos utilizados, etc."
              style={{ borderRadius: 10, resize: "none", paddingBottom: 32 }}
            />
            <span
              className="position-absolute text-muted-foreground small"
              style={{ right: 14, bottom: 12 }}
            >
              {form.notes.length}/300
            </span>
          </div>
        </div>
      </div>

      <div
        className="dashboard-card p-3 mb-4"
        style={{
          background: "linear-gradient(90deg, color-mix(in srgb, var(--primary), transparent 96%), white)",
        }}
      >
        <h3 className="fw-black text-foreground mb-3" style={{ fontSize: "0.95rem" }}>
          Resumo do lançamento
        </h3>

        <div className="row g-3">
          <div className="col-12 col-md-6 col-xl-3">
            <SummaryCard
              icon={<Calendar size={26} />}
              color="oklch(0.5 0.16 145)"
              label="Data da atividade"
              value={formatDate(form.activity_date)}
            />
          </div>
          <div className="col-12 col-md-6 col-xl-3">
            <SummaryCard
              icon={<CalendarDays size={26} />}
              color="oklch(0.58 0.16 245)"
              label="Quantidade de diárias"
              value={`${decimalValue(form.daily_quantity) || 0} diárias`}
            />
          </div>
          <div className="col-12 col-md-6 col-xl-3">
            <SummaryCard
              icon={<DollarSign size={26} />}
              color="oklch(0.7 0.18 70)"
              label="Valor da diária"
              value={currency(decimalValue(form.daily_rate))}
            />
          </div>
          <div className="col-12 col-md-6 col-xl-3">
            <SummaryCard
              icon={<DollarSign size={26} />}
              color="oklch(0.5 0.16 145)"
              label="Valor total"
              value={currency(total)}
            />
          </div>
        </div>
      </div>

      <div className="dashboard-card p-4 mb-4">
        <div className="d-flex align-items-start justify-content-between gap-2 mb-3 flex-wrap">
          <div>
            <h3 className="fw-black text-foreground mb-1" style={{ fontSize: "1.05rem" }}>
              <History size={18} className="me-2" /> Histórico recente
            </h3>
            <p className="text-muted-foreground small mb-0">Últimos registros de mão de obra e custos desta plantação.</p>
          </div>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => router.push(`/home/plantacoes/${id}/historico`)}>
            Ver relatório completo
          </button>
        </div>

        {laborRecords.length === 0 ? (
          <p className="text-muted-foreground small mb-0">Nenhum lançamento recente de mão de obra.</p>
        ) : (
          <div className="d-flex flex-column gap-2">
            {laborRecords.slice(0, 4).map((record) => (
              <div key={record.id} className="border rounded p-3 d-flex align-items-center justify-content-between gap-3 flex-wrap">
                <div>
                  <div className="fw-semibold">{record.activity_type_display || activityOptions.find((option) => option.value === record.activity_type)?.label || "Atividade"}</div>
                  <div className="text-muted-foreground small">{formatDate(record.activity_date)} • {record.worker_name || "Trabalhador"}</div>
                </div>
                <div className="text-end">
                  <div className="fw-bold">{currency(recordTotal(record))}</div>
                  <div className="text-muted-foreground small">
                    {recordDailyQuantity(record).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} diária(s)
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dashboard-card p-4 mb-4">
        <h3 className="fw-black text-foreground mb-3" style={{ fontSize: "1.05rem" }}>
          Histórico de mão de obra
        </h3>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0 agro-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Atividade</th>
                <th>Trabalhador</th>
                <th>Diárias</th>
                <th>Valor diária</th>
                <th>Total</th>
                <th>Observações</th>
              </tr>
            </thead>
            <tbody>
              {laborRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground py-4">
                    Nenhum lançamento de mão de obra registrado ainda.
                  </td>
                </tr>
              ) : (
                laborRecords.map((record) => (
                  <tr key={record.id}>
                    <td>{formatDate(record.activity_date)}</td>
                    <td>{record.activity_type_display || activityOptions.find((option) => option.value === record.activity_type)?.label || "-"}</td>
                    <td>{record.worker_name || "-"}</td>
                    <td>{recordDailyQuantity(record).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>{currency(recordDailyRate(record))}</td>
                    <td className="fw-bold">{currency(recordTotal(record))}</td>
                    <td className="text-muted-foreground small">{record.notes || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="d-flex flex-wrap justify-content-end gap-3">
        <button
          type="button"
          className="btn btn-outline-secondary px-5"
          onClick={() => router.push(`/home/plantacoes/${id}`)}
          style={{ height: 48, borderRadius: 10, fontWeight: 800 }}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-success d-flex align-items-center justify-content-center gap-2 px-5"
          disabled={saving}
          onClick={handleSubmit}
          style={{ height: 48, borderRadius: 10, fontWeight: 800, minWidth: 210 }}
        >
          <Save size={18} />
          {saving ? "Salvando..." : "Salvar lançamento"}
        </button>
      </div>

      {showWorkerForm && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{ background: "rgba(15, 23, 42, 0.35)", zIndex: 1050 }}
        >
          <div className="dashboard-card p-4 w-100" style={{ maxWidth: 560 }}>
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h4 className="fw-black text-foreground mb-0" style={{ fontSize: "1.1rem" }}>
                Cadastrar funcionário / prestador
              </h4>
              <button
                type="button"
                className="btn btn-link text-muted-foreground p-1"
                onClick={() => setShowWorkerForm(false)}
                aria-label="Fechar cadastro"
              >
                <X size={22} />
              </button>
            </div>

            <form className="row g-3" onSubmit={handleSaveWorker}>
              <div className="col-12">
                <label className="form-label fw-bold text-foreground">
                  Nome <span className="text-danger">*</span>
                </label>
                <input
                  className="form-control"
                  required
                  value={workerForm.name}
                  onChange={(event) => updateWorkerForm({ name: event.target.value })}
                  placeholder="Ex.: João Silva"
                  style={{ height: 46, borderRadius: 10 }}
                />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label fw-bold text-foreground">Tipo</label>
                <select
                  className="form-select"
                  value={workerForm.worker_type}
                  onChange={(event) =>
                    updateWorkerForm({ worker_type: event.target.value as WorkerForm["worker_type"] })
                  }
                  style={{ height: 46, borderRadius: 10 }}
                >
                  <option value="employee">Funcionário</option>
                  <option value="provider">Prestador</option>
                </select>
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label fw-bold text-foreground">Documento</label>
                <input
                  className="form-control"
                  value={workerForm.document}
                  onChange={(event) => updateWorkerForm({ document: event.target.value })}
                  placeholder="CPF/CNPJ"
                  style={{ height: 46, borderRadius: 10 }}
                />
              </div>

              <div className="col-12">
                <label className="form-label fw-bold text-foreground">Telefone</label>
                <input
                  className="form-control"
                  value={workerForm.phone}
                  onChange={(event) => updateWorkerForm({ phone: event.target.value })}
                  placeholder="(00) 00000-0000"
                  style={{ height: 46, borderRadius: 10 }}
                />
              </div>

              <div className="col-12">
                <label className="form-label fw-bold text-foreground">Observações</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={workerForm.notes}
                  onChange={(event) => updateWorkerForm({ notes: event.target.value })}
                  style={{ borderRadius: 10, resize: "none" }}
                />
              </div>

              <div className="col-12 d-flex justify-content-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary px-4"
                  onClick={() => setShowWorkerForm(false)}
                  style={{ borderRadius: 10, fontWeight: 700 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-success px-4"
                  disabled={savingWorker || !workerForm.name.trim()}
                  style={{ borderRadius: 10, fontWeight: 800 }}
                >
                  {savingWorker ? "Cadastrando..." : "Cadastrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedWorker && (
        <span className="visually-hidden">
          Trabalhador selecionado: {selectedWorker.name}
        </span>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  color,
  label,
  value,
}: {
  icon: React.ReactNode;
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white border h-100 p-3 d-flex align-items-center gap-3" style={{ borderRadius: 10 }}>
      <div
        className="d-flex align-items-center justify-content-center flex-shrink-0"
        style={{
          width: 46,
          height: 46,
          borderRadius: 999,
          color,
          background: `color-mix(in srgb, ${color}, transparent 88%)`,
        }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="fw-bold text-foreground small mb-1">{label}</div>
        <div className="fw-black text-foreground" style={{ fontSize: "1.15rem" }}>
          {value}
        </div>
      </div>
    </div>
  );
}
