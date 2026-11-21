"use client";

import { useEffect, useState } from "react";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { apiClient } from "@/services/api";
import { ACCESS_CHANGED_EVENT, type SegmentFeatures } from "@/services/organizationAccess";
import { useOrganizationLocale, type TranslationKey } from "@/lib/locale";

interface FeaturesResponse { segments: SegmentFeatures; can_edit: boolean }

const LIVESTOCK = new Set(["bovinos", "suinos"]);
const ORDER = ["plantacoes", "bovinos", "suinos", "area-veterinario"];

/** Configurações › Recursos dos segmentos: one switch per optional feature of each segment. */
export default function SegmentFeaturesPanel() {
  const { t } = useOrganizationLocale();
  const [data, setData] = useState<FeaturesResponse | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    apiClient.get<FeaturesResponse>("/organizations/segment-features/", { signal: controller.signal })
      .then(response => { setData(response.data); setError(""); })
      .catch(() => { if (!controller.signal.aborted) setError(t("features.error")); });
    return () => controller.abort();
  }, [t]);

  const toggle = async (segment: string, feature: string, value: boolean) => {
    const key = `${segment}.${feature}`;
    setSaving(key);
    setStatus("");
    try {
      const response = await apiClient.put<FeaturesResponse>("/organizations/segment-features/", { segments: { [segment]: { [feature]: value } } });
      setData(response.data);
      setStatus(t("features.saved"));
      window.dispatchEvent(new Event(ACCESS_CHANGED_EVENT));
    } catch {
      setStatus(t("features.saveError"));
    } finally {
      setSaving("");
    }
  };

  const description = (segment: string, feature: string) => {
    const scope = LIVESTOCK.has(segment) ? "livestock" : segment;
    return t(`features.${feature}.${scope}` as TranslationKey);
  };

  return (
    <div className="fade-in">
      <div className="section-header mb-4">
        <h2 className="fw-bold h5 mb-1 d-flex align-items-center gap-2"><SlidersHorizontal size={20} aria-hidden="true" /> {t("features.title")}</h2>
        <p className="small text-muted-foreground mb-0">{t("features.description")}</p>
      </div>
      {error && <div role="alert" className="alert alert-danger">{error}</div>}
      {!data && !error && <p className="small text-muted-foreground"><Loader2 size={16} className="animate-spin me-2" aria-hidden="true" />{t("features.loading")}</p>}
      {data && !data.can_edit && <p className="small text-muted-foreground">{t("features.adminOnly")}</p>}
      {status && <p role="status" className="small text-muted-foreground">{status}</p>}
      {data && ORDER.filter(segment => data.segments[segment]).map(segment => (
        <section key={segment} className="dashboard-card p-4 mb-3">
          <h3 className="fw-bold small mb-3">{t(`features.segment.${segment}` as TranslationKey)}</h3>
          <div className="d-grid gap-3">
            {Object.entries(data.segments[segment]).map(([feature, value]) => {
              const id = `feature-${segment}-${feature}`;
              return (
                <div key={feature} className="d-flex justify-content-between align-items-start gap-3">
                  <label htmlFor={id} className="mb-0" style={{ minWidth: 0 }}>
                    <span className="d-block fw-semibold small">{t(`features.${feature}` as TranslationKey)}</span>
                    <span className="d-block extra-small text-muted-foreground">{description(segment, feature)}</span>
                  </label>
                  <div className="form-check form-switch m-0 d-flex align-items-center gap-2 flex-shrink-0">
                    <span className="extra-small text-muted-foreground" aria-hidden="true">{value ? t("features.on") : t("features.off")}</span>
                    <input id={id} className="form-check-input m-0" type="checkbox" role="switch" checked={value}
                      disabled={!data.can_edit || saving === `${segment}.${feature}`}
                      onChange={event => void toggle(segment, feature, event.target.checked)} style={{ width: 40, height: 22 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
