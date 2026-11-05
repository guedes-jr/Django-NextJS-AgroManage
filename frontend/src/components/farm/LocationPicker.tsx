"use client";

import { useState } from "react";
import { LocateFixed, MapPin, Undo2, X } from "lucide-react";
import { useOrganizationLocale } from "@/lib/locale";

export interface SavedLocation {
  latitude: string;
  longitude: string;
  label: string;
}

export function LocationPicker({
  latitude,
  longitude,
  lastLocation,
  onChange,
  subjectLabel = "estrutura",
}: {
  latitude?: string | null;
  longitude?: string | null;
  lastLocation: SavedLocation | null;
  onChange: (latitude: string | null, longitude: string | null) => void;
  subjectLabel?: string;
}) {
  const { t } = useOrganizationLocale();
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const hasLocation = Boolean(latitude && longitude);
  const numericLatitude = Number(latitude);
  const numericLongitude = Number(longitude);
  const mapUrl = hasLocation
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${numericLongitude - 0.008}%2C${numericLatitude - 0.005}%2C${numericLongitude + 0.008}%2C${numericLatitude + 0.005}&layer=mapnik&marker=${numericLatitude}%2C${numericLongitude}`
    : "";

  const useCurrentLocation = () => {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError(t("structure.location.unsupported"));
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        onChange(coords.latitude.toFixed(7), coords.longitude.toFixed(7));
        setLocating(false);
      },
      (error) => {
        setLocationError(error.code === error.PERMISSION_DENIED
          ? t("structure.location.permission")
          : t("structure.location.failed"));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };

  return <div>
    <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap mb-2">
      <div>
        <label className="form-label fw-semibold mb-0">{t("structure.location.heading")}</label>
        <div className="small text-muted">{t("structure.location.help")}</div>
      </div>
      {hasLocation && <button type="button" className="btn btn-sm btn-link text-danger text-decoration-none" onClick={() => onChange(null, null)}>
        <X size={15} /> {t("structure.location.remove")}
      </button>}
    </div>

    <div className="border rounded-3 overflow-hidden bg-body-tertiary">
      {hasLocation ? <iframe
        key={`${latitude}-${longitude}`}
        title={`${t("structure.location.heading")} ${subjectLabel}`}
        src={mapUrl}
        width="100%"
        height="230"
        loading="lazy"
        style={{ border: 0, display: "block" }}
      /> : <div className="d-flex flex-column align-items-center justify-content-center text-center text-muted p-4" style={{ minHeight: 180 }}>
        <MapPin size={34} className="mb-2 text-success" />
        <strong className="text-body">{t("structure.location.none")}</strong>
        <span className="small">{t("structure.location.choose")}</span>
      </div>}

      <div className="d-flex flex-wrap align-items-center gap-2 p-3 border-top bg-body">
        <button type="button" className="btn btn-success btn-sm d-inline-flex align-items-center gap-2" onClick={useCurrentLocation} disabled={locating}>
          {locating ? <span className="spinner-border spinner-border-sm" /> : <LocateFixed size={16} />}
          {locating ? t("structure.location.locating") : t("structure.location.useCurrent")}
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-2"
          disabled={!lastLocation}
          onClick={() => lastLocation && onChange(lastLocation.latitude, lastLocation.longitude)}
          title={lastLocation ? t("structure.location.last", { label: lastLocation.label }) : t("structure.location.noneSaved")}
        >
          <Undo2 size={16} /> {t("structure.location.useLast")}
        </button>
        {hasLocation && <span className="small text-muted ms-auto d-inline-flex align-items-center gap-1"><MapPin size={14} /> {t("structure.location.defined")}</span>}
      </div>
    </div>
    {locationError && <div className="text-danger small mt-2">{locationError}</div>}
    <div className="form-text">{t("structure.location.preview")}</div>
  </div>;
}
