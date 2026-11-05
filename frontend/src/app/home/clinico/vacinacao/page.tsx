"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2, ChevronRight, Syringe, Calendar, Users, Activity } from "lucide-react";
import Link from "next/link";
import { clinicalService } from "@/services/clinicalService";
import { fetchVaccines } from "@/services/livestockService";
import { DataTable } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ClinicalModal, ModalField } from "@/components/clinico/ClinicalModal";
import { type TranslationKey, useOrganizationLocale } from "@/lib/locale";

export default function VacinacaoPage() {
  const { showToast } = useToast();
  const { language, t } = useOrganizationLocale();
  const [loading, setLoading] = useState(true);
  const [vaccinations, setVaccinations] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [vaccineItems, setVaccineItems] = useState<any[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await clinicalService.getVaccinations();
      setVaccinations(res.data.results || res.data || []);
    } catch (err) {
      console.error("Erro ao carregar vacinações:", err);
      showToast(t("clinical.loadVaccinationsFailed"), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchVaccines().then(setVaccineItems).catch(() => {});
  }, []);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    return new Date(`${dateStr.split("T")[0]}T00:00:00`).toLocaleDateString(language);
  };

  const columns = [
    { key: "application_date", label: t("clinical.date"), render: (v: any) => formatDate(v) },
    { key: "vaccine_name", label: t("clinical.vaccination") },
    {
      key: "target",
      label: t("clinical.recipient"),
      render: (_: any, row: any) => {
        if (row.animal_identifier) {
          return (
            <span className="badge bg-light text-dark border px-2 py-1 rounded-pill">
              🐖 {t("clinical.animalTag")}: {row.animal_identifier}
            </span>
          );
        }
        if (row.batch_code) {
          return (
            <span className="badge bg-light text-primary border border-primary-subtle px-2 py-1 rounded-pill">
              📦 {t("clinical.batchCode")}: {row.batch_code}
            </span>
          );
        }
        return "—";
      },
    },
    {
      key: "dose_type",
      label: "Dose",
      render: (v: any) => {
        const map: Record<string, TranslationKey> = {
          unica: "clinical.singleDose",
          primeira: "clinical.firstDose",
          segunda: "clinical.secondDose",
          terceira: "clinical.thirdDose",
          reforco: "clinical.booster",
        };
        return map[v as string] ? t(map[v as string]) : v;
      },
    },
    { key: "dosage_ml", label: t("clinical.dosageMl"), render: (v: any) => (v ? `${v} ml` : "—") },
    { key: "applicator", label: t("clinical.applicationResponsible"), render: (v: any) => v || "—" },
    { key: "next_dose_date", label: t("clinical.boosterPlanned"), render: (v: any) => formatDate(v) },
  ];

  const handleCreateVaccination = async (data: any) => {
    try {
      const selectedVaccine = vaccineItems.find((v: any) => String(v.id) === String(data.vaccine_item_id));
      const payload = {
        animal_identifier: data.target_type === "animal" ? data.animal_identifier : "",
        batch_code: data.target_type === "batch" ? data.batch_code : "",
        vaccine_item_id: data.vaccine_item_id || null,
        vaccine_name: selectedVaccine?.nome || data.vaccine_name || '',
        application_date: data.application_date,
        dose_type: data.dose_type,
        dosage_ml: data.dosage_ml ? parseFloat(data.dosage_ml) : null,
        batch_number: data.batch_number,
        applicator: data.applicator,
        next_dose_date: data.next_dose_date || null,
        notes: data.notes,
      };

      await clinicalService.createVaccination(payload);
      showToast(t("clinical.vaccinationSuccess"), "success");
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.detail || t("clinical.vaccinationFailed"), "error");
    }
  };

  const modalFields: ModalField[] = [
    {
      name: "target_type",
      label: t("clinical.applyTo"),
      type: "select",
      required: true,
      colSpan: "full",
      options: [
        { value: "animal", label: t("clinical.individualAnimal") },
        { value: "batch", label: t("clinical.animalBatch") },
      ],
      initialValue: "animal",
    },
    {
      name: "animal_identifier",
      label: t("clinical.animalTag"),
      type: "text",
      required: true,
      colSpan: "half",
      showIf: (values) => values.target_type === "animal",
    },
    {
      name: "batch_code",
      label: t("clinical.batchCode"),
      type: "text",
      required: true,
      colSpan: "half",
      showIf: (values) => values.target_type === "batch",
    },
    {
      name: "vaccine_item_id",
      label: t("clinical.vaccination"),
      type: "select",
      required: true,
      colSpan: "half",
      options: (vaccineItems.length > 0
        ? vaccineItems.map((v: any) => ({
            value: String(v.id),
            label: `${v.nome}${v.estoque_atual ? ` (${t("clinical.stock")}: ${v.estoque_atual})` : ''}`,
          }))
        : [{ value: "", label: t("clinical.noVaccineStock") }]
      ),
      initialValue: vaccineItems.length > 0 ? String(vaccineItems[0].id) : "",
    },
    {
      name: "application_date",
      label: t("clinical.date"),
      type: "date",
      required: true,
      initialValue: new Date().toISOString().split("T")[0],
      colSpan: "half",
    },
    {
      name: "dose_type",
      label: t("clinical.vaccineDoseType"),
      type: "select",
      required: true,
      colSpan: "half",
      options: [
        { value: "unica", label: t("clinical.singleDose") },
        { value: "primeira", label: t("clinical.firstDose") },
        { value: "segunda", label: t("clinical.secondDose") },
        { value: "terceira", label: t("clinical.thirdDose") },
        { value: "reforco", label: t("clinical.booster") },
      ],
      initialValue: "unica",
    },
    { name: "dosage_ml", label: t("clinical.dosageMl"), type: "number", colSpan: "half" },
    { name: "batch_number", label: t("clinical.vaccineBatchNumber"), type: "text", colSpan: "half" },
    { name: "applicator", label: t("clinical.applicationResponsible"), type: "text", colSpan: "half" },
    { name: "next_dose_date", label: t("clinical.nextBoosterDate"), type: "date", colSpan: "full" },
    { name: "notes", label: t("clinical.notesShort"), type: "textarea", colSpan: "full" },
  ];

  // Dynamic statistics
  const totalApplied = vaccinations.length;
  const nextDoses = vaccinations.filter(
    (v) => v.next_dose_date && new Date(v.next_dose_date) >= new Date()
  ).length;
  const uniqueApplicators = Array.from(new Set(vaccinations.map((v) => v.applicator).filter(Boolean)))
    .length;

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <nav className="d-flex align-items-center gap-2 small" style={{ color: "var(--muted-foreground)" }}>
          <Link href="/home" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>{t("sidebar.dashboard")}</Link>
          <ChevronRight size={14} />
          <Link href="/home/clinico" className="text-decoration-none" style={{ color: "var(--muted-foreground)" }}>{t("clinical.dashboard")}</Link>
          <ChevronRight size={14} />
          <span className="fw-semibold text-foreground">{t("clinical.vaccination")}</span>
        </nav>
      </div>

      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-end gap-4 mb-4">
        <div className="d-flex align-items-center gap-3">
          <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 48, height: 48, background: "oklch(0.94 0.04 230)" }}>
            <Syringe size={24} className="text-primary" />
          </div>
          <div>
            <h1 className="fw-black mb-1" style={{ fontSize: "1.9rem", letterSpacing: "-0.03em" }}>
              {t("clinical.vaccinationTitle")}
            </h1>
            <p className="text-muted-foreground mb-0">
              {t("clinical.vaccinationDescription")}
            </p>
          </div>
        </div>
        <button
          className="btn btn-primary d-inline-flex align-items-center gap-2 fw-semibold px-4 py-2 shadow-sm rounded-pill transition-all hover-scale"
          style={{ fontSize: "0.9rem", backgroundColor: "var(--primary)", borderColor: "var(--primary)" }}
          onClick={() => setIsModalOpen(true)}
        >
          <Plus size={18} />
          {t("clinical.registerVaccine")}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="row g-4 mb-4">
        <div className="col-12 col-sm-4">
          <div className="dashboard-card p-4 shadow-sm h-100" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
            <div className="d-flex align-items-center gap-3">
              <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 40, height: 40, background: "oklch(0.94 0.04 230)" }}>
                <Activity size={20} className="text-primary" />
              </div>
              <div>
                <div className="fs-4 fw-black">{totalApplied}</div>
                <div className="text-muted-foreground small fw-semibold">{t("clinical.vaccinationsApplied")}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-4">
          <div className="dashboard-card p-4 shadow-sm h-100" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
            <div className="d-flex align-items-center gap-3">
              <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 40, height: 40, background: "oklch(0.97 0.04 80)" }}>
                <Calendar size={20} className="text-warning" />
              </div>
              <div>
                <div className="fs-4 fw-black">{nextDoses}</div>
                <div className="text-muted-foreground small fw-semibold">{t("clinical.nextBoosters")}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-4">
          <div className="dashboard-card p-4 shadow-sm h-100" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", background: "var(--card)" }}>
            <div className="d-flex align-items-center gap-3">
              <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 40, height: 40, background: "oklch(0.95 0.05 145)" }}>
                <Users size={20} className="text-success" />
              </div>
              <div>
                <div className="fs-4 fw-black">{uniqueApplicators}</div>
                <div className="text-muted-foreground small fw-semibold">{t("clinical.responsibles")}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="d-flex justify-content-center py-5">
          <Loader2 className="spin-animation text-muted" size={32} />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={vaccinations}
          emptyIcon="💉"
          emptyText={t("clinical.vaccinationEmpty")}
        />
      )}

      <ClinicalModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t("clinical.vaccinationTitleModal")}
        subtitle={t("clinical.vaccinationSubtitle")}
        fields={modalFields}
        onConfirm={handleCreateVaccination}
        confirmLabel={t("clinical.saveVaccination")}
      />
    </div>
  );
}
