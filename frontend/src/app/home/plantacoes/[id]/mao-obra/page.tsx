"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Calendar,
  CalendarDays,
  DollarSign,
  History,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { cropService } from "@/services/cropService";
import { useOrganizationLocale } from "@/lib/locale";

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



const today = () => new Date().toISOString().split("T")[0];

const currency = (value: number, language: string) =>
  value.toLocaleString(language, {
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

const formatDate = (value: string, language: string) => {
  if (!value) return "-";
  return new Date(`${value}T12:00:00`).toLocaleDateString(language);
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
  const { language, t } = useOrganizationLocale();
const activityOptions = [
  { value: "land_preparation", label: t("plantations.labor.landPreparation") },
  { value: "planting", label: t("plantations.preparation.operation.planting") },
  { value: "fertilization", label: t("plantations.history.module.adubacao") },
  { value: "fertigation", label: t("plantations.agronomist.category.fertirrigacao") },
  { value: "pesticide_application", label: t("workspace.pesticideApplication") },
  { value: "irrigation", label: t("plantations.history.module.irrigacao") },
  { value: "harvest", label: t("plantations.history.module.colheita") },
  { value: "other", label: t("reproduction.other") },
];
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

  // Edit / Delete states
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<LaborRecord | null>(null);
  const [editForm, setEditForm] = useState({
    activity_type: "pesticide_application",
    activity_date: "",
    daily_quantity: "",
    daily_rate: "",
    notes: "",
  });
  const [editSaving, setEditSaving] = useState(false);

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
        setError(t("plantations.labor.loadFailed"));
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, t]);

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
    if (!form.activity_type) return t("plantations.labor.selectActivityType");
    if (!form.worker) return t("plantations.labor.selectWorker");
    if (!form.activity_date) return t("plantations.labor.dateRequired");
    if (decimalValue(form.daily_quantity) <= 0) return t("plantations.labor.dailyQuantity");
    if (decimalValue(form.daily_rate) <= 0) return t("plantations.labor.rateRequired");
    if (form.notes.length > 300) return t("plantations.labor.notesTooLong");
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
      setError(t("plantations.labor.createFailed"));
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
      setError(t("plantations.labor.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const openEditRecord = (record: LaborRecord) => {
    setEditingRecord(record);
    setEditForm({
      activity_type: record.activity_type,
      activity_date: record.activity_date,
      daily_quantity: String(record.daily_quantity),
      daily_rate: String(record.daily_rate),
      notes: record.notes ?? "",
    });
  };

  const closeEditRecord = () => setEditingRecord(null);

  const handleEditSubmit = async () => {
    if (!editingRecord || editSaving) return;
    try {
      setEditSaving(true);
      await cropService.updateLaborRecord(editingRecord.id, {
        activity_type: editForm.activity_type,
        activity_date: editForm.activity_date,
        daily_quantity: decimalValue(editForm.daily_quantity),
        daily_rate: decimalValue(editForm.daily_rate),
        notes: editForm.notes,
      });
      const response = await cropService.listLaborRecords({ plantation: id });
      setLaborRecords(extractArray<LaborRecord>(response.data));
      closeEditRecord();
    } catch {
      setError(t("plantations.labor.editFailed"));
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!confirm(t("plantations.labor.removeConfirm"))) return;
    try {
      setDeletingId(recordId);
      await cropService.deleteLaborRecord(recordId);
      setLaborRecords((prev) => prev.filter((r) => r.id !== recordId));
    } catch {
      setError(t("plantations.labor.deleteFailed"));
    } finally {
      setDeletingId(null);
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
    return <div className="p-4 text-muted">{t("plantations.notFound")}</div>;
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
              {t("plantations.labor.title")}
            </h1>
            <p className="text-muted-foreground mb-0">
              {t("plantations.labor.description")}
            </p>
          </div>
        </div>


      </div>

      {error && (
        <div className="alert alert-danger py-2 px-3 mb-3" role="alert">
          {error}
        </div>
      )}

      <div className="dashboard-card p-4 mb-3">
        <h2 className="fw-black text-foreground mb-4" style={{ fontSize: "1.2rem" }}>
          {t("plantations.labor.register")}
        </h2>

        <div className="row g-4 align-items-end mb-4">
          <div className="col-12 col-lg-6">
            <label className="form-label fw-bold text-foreground">
              {t("plantations.labor.activityType")} <span className="text-danger">*</span>
            </label>
            <select
              className="form-select"
              value={form.activity_type}
              onChange={(event) => updateForm({ activity_type: event.target.value })}
              style={{ height: 50, borderRadius: 10 }}
            >
              {activityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(`plantations.labor.${option.value === "land_preparation" ? "landPreparation" : option.value === "planting" ? "planting" : option.value === "fertilization" ? "fertilization" : option.value === "fertigation" ? "fertigation" : option.value === "pesticide_application" ? "pesticide" : option.value === "irrigation" ? "irrigation" : option.value === "harvest" ? "harvest" : "other"}` as "plantations.labor.other")}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-lg-5">
            <label className="form-label fw-bold text-foreground">
              {t("plantations.labor.worker")} / {t("plantations.labor.provider")} <span className="text-danger">*</span>
            </label>
            <select
              className="form-select"
              value={form.worker}
              onChange={(event) => updateForm({ worker: event.target.value })}
              style={{ height: 50, borderRadius: 10 }}
            >
              <option value="">{t("plantations.harvest.select")}</option>
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
              {t("plantations.labor.register")}
            </button>
          </div>
        </div>

        <div className="mb-4">
          <div className="form-label fw-bold text-foreground mb-2">{t("plantations.labor.paymentMethod")}</div>
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
              <span className="d-block fw-black text-foreground">{t("plantations.labor.perDay")}</span>
              <span className="d-block text-muted-foreground small">
                {t("plantations.labor.paymentDescription")}
              </span>
            </span>
          </label>
        </div>

        <div className="row g-4 mb-4">
          <div className="col-12 col-md-4">
            <label className="form-label fw-bold text-foreground">
              {t("plantations.labor.activityDate")} <span className="text-danger">*</span>
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
              {t("plantations.labor.dailyCount")} <span className="text-danger">*</span>
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
                {t("plantations.labor.dailyUnits")}
              </span>
            </div>
          </div>

          <div className="col-12 col-md-4">
            <label className="form-label fw-bold text-foreground">
              {t("plantations.labor.dailyRate")} <span className="text-danger">*</span>
            </label>
            <input
              className="form-control"
              inputMode="decimal"
              value={form.daily_rate}
              onChange={(event) => updateForm({ daily_rate: event.target.value })}
              placeholder="150.00"
              style={{ height: 50, borderRadius: 10 }}
            />
          </div>
        </div>

        <div>
          <label className="form-label fw-bold text-foreground">{t("plantations.notes")}</label>
          <div className="position-relative">
            <textarea
              className="form-control"
              rows={4}
              maxLength={300}
              value={form.notes}
              onChange={(event) => updateForm({ notes: event.target.value })}
              placeholder={t("plantations.labor.detailsPlaceholder")}
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
          {t("plantations.labor.summary")}
        </h3>

        <div className="row g-3">
          <div className="col-12 col-md-6 col-xl-3">
            <SummaryCard
              icon={<Calendar size={26} />}
              color="oklch(0.5 0.16 145)"
              label={t("plantations.labor.activityDate")}
              value={formatDate(form.activity_date, language)}
            />
          </div>
          <div className="col-12 col-md-6 col-xl-3">
            <SummaryCard
              icon={<CalendarDays size={26} />}
              color="oklch(0.58 0.16 245)"
              label={t("plantations.labor.dailyCount")}
              value={`${decimalValue(form.daily_quantity) || 0} ${t("plantations.labor.dailyPlural")}`}
            />
          </div>
          <div className="col-12 col-md-6 col-xl-3">
            <SummaryCard
              icon={<DollarSign size={26} />}
              color="oklch(0.7 0.18 70)"
              label={t("plantations.labor.dailyRateColumn")}
              value={currency(decimalValue(form.daily_rate), language)}
            />
          </div>
          <div className="col-12 col-md-6 col-xl-3">
            <SummaryCard
              icon={<DollarSign size={26} />}
              color="oklch(0.5 0.16 145)"
              label={t("plantations.labor.total")}
              value={currency(total, language)}
            />
          </div>
        </div>
      </div>

      <div className="dashboard-card p-4 mb-4">
        <div className="d-flex align-items-start justify-content-between gap-2 mb-3 flex-wrap">
          <div>
            <h3 className="fw-black text-foreground mb-1" style={{ fontSize: "1.05rem" }}>
              <History size={18} className="me-2" /> {t("plantations.harvest.recentHistory")}
            </h3>
            <p className="text-muted-foreground small mb-0">{t("plantations.labor.historyDescription")}</p>
          </div>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => router.push(`/home/plantacoes/${id}/historico`)}>
            {t("plantations.harvest.viewHistory")}
          </button>
        </div>

        {laborRecords.length === 0 ? (
          <p className="text-muted-foreground small mb-0">{t("plantations.labor.noRecent")}</p>
        ) : (
          <div className="d-flex flex-column gap-2">
            {laborRecords.slice(0, 4).map((record) => (
              <div key={record.id} className="border rounded p-3 d-flex align-items-center justify-content-between gap-3 flex-wrap">
                <div>
                  <div className="fw-semibold">{record.activity_type_display || t("plantations.labor.activity")}</div>
                  <div className="text-muted-foreground small">{formatDate(record.activity_date, language)} • {record.worker_name || t("plantations.labor.worker")}</div>
                </div>
                <div className="text-end">
                  <div className="fw-bold">{currency(recordTotal(record), language)}</div>
                  <div className="text-muted-foreground small">
                    {recordDailyQuantity(record).toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t("plantations.labor.dailyUnits")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dashboard-card p-4 mb-4">
        <h3 className="fw-black text-foreground mb-3" style={{ fontSize: "1.05rem" }}>
          {t("plantations.labor.historyTitle")}
        </h3>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0 agro-table">
            <thead>
              <tr>
                <th>{t("plantations.operation.date")}</th>
                <th>{t("plantations.labor.activity")}</th>
                <th>{t("plantations.labor.worker")}</th>
                <th>{t("plantations.labor.dailyCount")}</th>
                <th>{t("plantations.labor.dailyRateColumn")}</th>
                <th>{t("plantations.labor.total")}</th>
                <th>{t("plantations.notes")}</th>
                <th className="text-center" style={{ width: 90 }}>{t("plantations.operation.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {laborRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-muted-foreground py-4">
                    Nenhum lançamento de mão de obra registrado ainda.
                  </td>
                </tr>
              ) : (
                <>
                  {laborRecords.map((record) => (
                    <tr key={record.id}>
                      <td>{formatDate(record.activity_date, language)}</td>
                      <td>{record.activity_type_display || t(`plantations.labor.${record.activity_type === "land_preparation" ? "landPreparation" : record.activity_type === "planting" ? "planting" : record.activity_type === "fertilization" ? "fertilization" : record.activity_type === "fertigation" ? "fertigation" : record.activity_type === "pesticide_application" ? "pesticide" : record.activity_type === "irrigation" ? "irrigation" : record.activity_type === "harvest" ? "harvest" : "other"}` as "plantations.labor.other")}</td>
                      <td>{record.worker_name || "-"}</td>
                      <td>{recordDailyQuantity(record).toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td>{currency(recordDailyRate(record), language)}</td>
                      <td className="fw-bold">{currency(recordTotal(record), language)}</td>
                      <td className="text-muted-foreground small">{record.notes || "-"}</td>
                      <td className="text-center">
                        <div className="d-flex gap-1 justify-content-center">
                          <button
                            type="button"
                            title={t("plantations.edit")}
                            aria-label={t("plantations.edit")}
                            className="btn btn-sm d-flex align-items-center justify-content-center"
                            style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid var(--bs-primary)", color: "var(--bs-primary)", backgroundColor: "transparent", padding: 0 }}
                            onClick={() => openEditRecord(record)}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            title={t("plantations.operation.removeRecord")}
                            aria-label={t("plantations.operation.removeRecord")}
                            className="btn btn-sm d-flex align-items-center justify-content-center"
                            style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid var(--bs-danger)", color: "var(--bs-danger)", backgroundColor: "transparent", padding: 0, opacity: deletingId === record.id ? 0.5 : 1 }}
                            disabled={deletingId === record.id}
                            onClick={() => handleDeleteRecord(record.id)}
                          >
                            {deletingId === record.id
                              ? <span className="spinner-border spinner-border-sm" style={{ width: 11, height: 11 }} />
                              : <Trash2 size={13} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="table-light">
                    <td colSpan={5} className="text-end fw-bold">{t("plantations.labor.totalGeneral")}:</td>
                    <td className="fw-black text-primary" style={{ fontSize: "1.05rem" }}>
                      {currency(laborRecords.reduce((acc, record) => acc + recordTotal(record), 0), language)}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </>
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

          {t("cattle.form.cancel")}
        </button>
        <button
          type="button"
          className="btn btn-success d-flex align-items-center justify-content-center gap-2 px-5"
          disabled={saving}
          onClick={handleSubmit}
          style={{ height: 48, borderRadius: 10, fontWeight: 800, minWidth: 210 }}
        >
          <Save size={18} />
          {saving ? t("plantations.labor.saving") : t("plantations.labor.save")}
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
                {t("plantations.labor.registerWorker")}
              </h4>
              <button
                type="button"
                className="btn btn-link text-muted-foreground p-1"
                onClick={() => setShowWorkerForm(false)}
                aria-label={t("plantations.harvest.closeBuyerForm")}
              >
                <X size={22} />
              </button>
            </div>

            <form className="row g-3" onSubmit={handleSaveWorker}>
              <div className="col-12">
                <label className="form-label fw-bold text-foreground">
                  {t("plantations.labor.workerName")} <span className="text-danger">*</span>
                </label>
                <input
                  className="form-control"
                  required
                  value={workerForm.name}
                  onChange={(event) => updateWorkerForm({ name: event.target.value })}
                  placeholder={t("plantations.labor.namePlaceholder")}
                  style={{ height: 46, borderRadius: 10 }}
                />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label fw-bold text-foreground">{t("plantations.labor.workerType")}</label>
                <select
                  className="form-select"
                  value={workerForm.worker_type}
                  onChange={(event) =>
                    updateWorkerForm({ worker_type: event.target.value as WorkerForm["worker_type"] })
                  }
                  style={{ height: 46, borderRadius: 10 }}
                >
                  <option value="employee">{t("plantations.labor.employee")}</option>
                  <option value="provider">{t("plantations.labor.provider")}</option>
                </select>
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label fw-bold text-foreground">{t("plantations.labor.document")}</label>
                <input
                  className="form-control"
                  value={workerForm.document}
                  onChange={(event) => updateWorkerForm({ document: event.target.value })}
                  placeholder={t("plantations.labor.taxId")}
                  style={{ height: 46, borderRadius: 10 }}
                />
              </div>

              <div className="col-12">
                <label className="form-label fw-bold text-foreground">{t("plantations.labor.phone")}</label>
                <input
                  className="form-control"
                  value={workerForm.phone}
                  onChange={(event) => updateWorkerForm({ phone: event.target.value })}
                  placeholder="(00) 00000-0000"
                  style={{ height: 46, borderRadius: 10 }}
                />
              </div>

              <div className="col-12">
                <label className="form-label fw-bold text-foreground">{t("plantations.notes")}</label>
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
                  {t("plantations.cancel")}
                </button>
                <button
                  type="submit"
                  className="btn btn-success px-4"
                  disabled={savingWorker || !workerForm.name.trim()}
                  style={{ borderRadius: 10, fontWeight: 800 }}
                >
                  {savingWorker ? t("plantations.harvest.registering") : t("plantations.labor.register")}
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

      {/* Edit Record Modal */}
      {editingRecord && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ zIndex: 1050, backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeEditRecord(); }}
        >
          <div
            className="bg-white rounded-4 shadow-lg p-4"
            style={{ width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto" }}
          >
            <div className="d-flex align-items-center justify-content-between mb-4">
              <h5 className="fw-black mb-0 d-flex align-items-center gap-2" style={{ fontSize: "1.05rem" }}>
                <Pencil size={17} className="text-primary" />
                Editar registro de mão de obra
              </h5>
              <button type="button" className="btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-center" style={{ width: 32, height: 32, borderRadius: 8, padding: 0 }} onClick={closeEditRecord}>
                <X size={16} />
              </button>
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold small mb-1">{t("plantations.labor.activityType")}</label>
              <select
                className="form-select"
                style={{ borderRadius: 10, height: 42 }}
                value={editForm.activity_type}
                onChange={(e) => setEditForm((p) => ({ ...p, activity_type: e.target.value }))}
              >
                {activityOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold small mb-1">{t("plantations.labor.activityDate")}</label>
              <input
                type="date"
                className="form-control"
                style={{ borderRadius: 10, height: 42 }}
                value={editForm.activity_date}
                onChange={(e) => setEditForm((p) => ({ ...p, activity_date: e.target.value }))}
              />
            </div>

            <div className="row g-3 mb-3">
              <div className="col-6">
                <label className="form-label fw-semibold small mb-1">{t("plantations.labor.dailyCount")}</label>
                <input
                  type="number" step="0.01" min="0"
                  className="form-control"
                  style={{ borderRadius: 10, height: 42 }}
                  value={editForm.daily_quantity}
                  onChange={(e) => setEditForm((p) => ({ ...p, daily_quantity: e.target.value }))}
                />
              </div>
              <div className="col-6">
                <label className="form-label fw-semibold small mb-1">{t("plantations.labor.dailyRate")}</label>
                <input
                  type="number" step="0.01" min="0"
                  className="form-control"
                  style={{ borderRadius: 10, height: 42 }}
                  value={editForm.daily_rate}
                  onChange={(e) => setEditForm((p) => ({ ...p, daily_rate: e.target.value }))}
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="form-label fw-semibold small mb-1">{t("plantations.notes")}</label>
              <textarea
                className="form-control"
                rows={3}
                maxLength={300}
                style={{ borderRadius: 10, resize: "none" }}
                value={editForm.notes}
                onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>

            <div className="d-flex gap-2 justify-content-end">
              <button type="button" className="btn btn-outline-secondary" style={{ borderRadius: 10 }} onClick={closeEditRecord} disabled={editSaving}>

                {t("cattle.form.cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary d-flex align-items-center gap-2"
                style={{ borderRadius: 10 }}
                onClick={handleEditSubmit}
                disabled={editSaving}
              >
                {editSaving
                  ? <><span className="spinner-border spinner-border-sm" style={{ width: 14, height: 14 }} /> {t("plantations.saving")}</>
                  : <><Save size={14} /> {t("plantations.labor.saveChanges")}</>}
              </button>
            </div>
          </div>
        </div>
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
