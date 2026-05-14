"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Confirmar ação",
  message = "Tem certeza que deseja realizar esta ação?",
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "danger",
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
    } catch {
      // handled upstream
    } finally {
      setLoading(false);
      onClose();
    }
  }

  const accentColor = variant === "danger" ? "var(--destructive)" : "oklch(0.78 0.15 75)";

  return (
    <div
      className="repro-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="repro-modal" style={{ maxWidth: "420px" }}>
        <div className="p-4 text-center">
          <div
            className="d-flex align-items-center justify-content-center rounded-circle mx-auto mb-3"
            style={{
              width: "56px",
              height: "56px",
              background: `color-mix(in srgb, ${accentColor}, transparent 90%)`,
              color: accentColor,
            }}
          >
            <AlertTriangle size={28} />
          </div>
          <h5 className="fw-bold mb-2">{title}</h5>
          <p className="text-muted-foreground small mb-4">{message}</p>
          <div className="d-flex gap-2 justify-content-center">
            <button className="repro-btn-secondary" onClick={onClose} disabled={loading}>
              {cancelLabel}
            </button>
            <button
              className="repro-btn-primary"
              onClick={handleConfirm}
              disabled={loading}
              style={{ background: accentColor }}
            >
              {loading ? <Loader2 size={16} className="spinner" /> : null}
              {loading ? "Aguarde..." : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
