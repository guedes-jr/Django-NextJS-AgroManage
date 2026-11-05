"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, Loader2, Bell, Package, Beef, Receipt, FileText, MessageCircle } from "lucide-react";
import notificationService, { NotificationPreference } from "@/services/notificationService";
import pushService from "@/services/pushNotificationService";
import { useOrganizationLocale } from "@/lib/locale";

interface Props {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export default function NotificationPreferences({ onSuccess, onError }: Props) {
  const { t } = useOrganizationLocale();
  const [preferences, setPreferences] = useState<NotificationPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchPreferences = useCallback(async () => {
    try {
      const data = await notificationService.getPreferences();
      setPreferences(data);
    } catch (err) {
      console.error("Error fetching preferences:", err);
      onError?.(t("notificationPreferences.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [onError, t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchPreferences(), 0);
    return () => window.clearTimeout(timeout);
  }, [fetchPreferences]);

  const handleSave = async () => {
    if (!preferences) return;
    setSaving(true);
    try {
      await notificationService.updatePreferences(preferences);
      if (preferences.push_notifications) await pushService.requestPermission();
      onSuccess?.(t("notificationPreferences.saveSuccess"));
    } catch (err) {
      console.error("Error saving preferences:", err);
      onError?.(t("notificationPreferences.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center py-4">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    );
  }

  if (!preferences) return null;

  return (
    <div className="notification-preferences">
      <div className="dashboard-card p-4 mb-4">
        <label className="form-check"><input type="checkbox" className="form-check-input" checked={preferences.marketing_alerts} onChange={event => setPreferences({ ...preferences, marketing_alerts: event.target.checked })} />{t("notificationPreferences.marketing")}</label>
        <p className="small text-muted mt-2 mb-0">{t("notificationPreferences.marketingNote")}</p>
      </div>
      <div className="dashboard-card p-4 border-dashed mb-4">
        <div className="d-flex align-items-center gap-3 mb-3">
          <div className="icon-box bg-primary/10 text-primary rounded-xl p-2">
            <Bell size={20} />
          </div>
          <div>
            <h4 className="fw-bold small mb-1">{t("notificationPreferences.emailTitle")}</h4>
            <p className="extra-small text-muted-foreground mb-0">{t("notificationPreferences.emailDescription")}</p>
          </div>
        </div>
        <div className="form-check form-switch">
          <input
            className="form-check-input"
            type="checkbox"
            id="email_notifications"
            checked={preferences.email_notifications}
            onChange={e => setPreferences({...preferences, email_notifications: e.target.checked})}
          />
          <label className="form-check-label small" htmlFor="email_notifications">
            {t("notificationPreferences.emailEnable")}
          </label>
        </div>
        <div className="form-check form-switch mt-3 pt-3 border-top">
          <input className="form-check-input" type="checkbox" id="push_notifications" checked={preferences.push_notifications} onChange={e => setPreferences({...preferences, push_notifications:e.target.checked})}/>
          <label className="form-check-label small" htmlFor="push_notifications"><strong>{t("notificationPreferences.browserTitle")}</strong><span className="d-block text-muted extra-small">{t("notificationPreferences.browserDescription")}</span></label>
        </div>
      </div>

      <div className="dashboard-card p-4 border-dashed mb-4">
        <div className="d-flex align-items-center gap-3 mb-3">
          <div className="icon-box bg-success/10 text-success rounded-xl p-2">
            <MessageCircle size={20} />
          </div>
          <div>
            <h4 className="fw-bold small mb-1">{t("notificationPreferences.whatsappTitle")}</h4>
            <p className="extra-small text-muted-foreground mb-0">{t("notificationPreferences.whatsappDescription")}</p>
          </div>
        </div>
        <div className="form-check form-switch">
          <input className="form-check-input" type="checkbox" id="whatsapp_reproductive_alerts" checked={preferences.whatsapp_reproductive_alerts} onChange={e => setPreferences({...preferences, whatsapp_reproductive_alerts: e.target.checked})}/>
          <label className="form-check-label small" htmlFor="whatsapp_reproductive_alerts">{t("notificationPreferences.whatsappEnable")}</label>
        </div>
      </div>

      <div className="dashboard-card p-4 border-dashed mb-4">
        <div className="d-flex align-items-center gap-3 mb-3">
          <div className="icon-box bg-success/10 text-success rounded-xl p-2">
            <Package size={20} />
          </div>
          <div>
            <h4 className="fw-bold small mb-1">{t("notificationPreferences.stockTitle")}</h4>
            <p className="extra-small text-muted-foreground mb-0">{t("notificationPreferences.stockDescription")}</p>
          </div>
        </div>
        <div className="form-check form-switch">
          <input
            className="form-check-input"
            type="checkbox"
            id="stock_alerts"
            checked={preferences.stock_alerts}
            onChange={e => setPreferences({...preferences, stock_alerts: e.target.checked})}
          />
          <label className="form-check-label small" htmlFor="stock_alerts">
            {t("notificationPreferences.stockEnable")}
          </label>
        </div>
      </div>

      <div className="dashboard-card p-4 border-dashed mb-4">
        <div className="d-flex align-items-center gap-3 mb-3">
          <div className="icon-box bg-warning/10 text-warning rounded-xl p-2">
            <Beef size={20} />
          </div>
          <div>
            <h4 className="fw-bold small mb-1">{t("notificationPreferences.animalTitle")}</h4>
            <p className="extra-small text-muted-foreground mb-0">{t("notificationPreferences.animalDescription")}</p>
          </div>
        </div>
        <div className="form-check form-switch">
          <input
            className="form-check-input"
            type="checkbox"
            id="animal_alerts"
            checked={preferences.animal_alerts}
            onChange={e => setPreferences({...preferences, animal_alerts: e.target.checked})}
          />
          <label className="form-check-label small" htmlFor="animal_alerts">
            {t("notificationPreferences.animalEnable")}
          </label>
        </div>
      </div>

      <div className="dashboard-card p-4 border-dashed mb-4">
        <div className="d-flex align-items-center gap-3 mb-3">
          <div className="icon-box bg-info/10 text-info rounded-xl p-2">
            <Receipt size={20} />
          </div>
          <div>
            <h4 className="fw-bold small mb-1">{t("notificationPreferences.financeTitle")}</h4>
            <p className="extra-small text-muted-foreground mb-0">{t("notificationPreferences.financeDescription")}</p>
          </div>
        </div>
        <div className="form-check form-switch">
          <input
            className="form-check-input"
            type="checkbox"
            id="financial_alerts"
            checked={preferences.financial_alerts}
            onChange={e => setPreferences({...preferences, financial_alerts: e.target.checked})}
          />
          <label className="form-check-label small" htmlFor="financial_alerts">
            {t("notificationPreferences.financeEnable")}
          </label>
        </div>
      </div>

      <div className="dashboard-card p-4 border-dashed mb-4">
        <div className="d-flex align-items-center gap-3 mb-3">
          <div className="icon-box bg-secondary/10 text-secondary rounded-xl p-2">
            <FileText size={20} />
          </div>
          <div>
            <h4 className="fw-bold small mb-1">{t("notificationPreferences.reportTitle")}</h4>
            <p className="extra-small text-muted-foreground mb-0">{t("notificationPreferences.reportDescription")}</p>
          </div>
        </div>
        <div className="form-check form-switch">
          <input
            className="form-check-input"
            type="checkbox"
            id="report_alerts"
            checked={preferences.report_alerts}
            onChange={e => setPreferences({...preferences, report_alerts: e.target.checked})}
          />
          <label className="form-check-label small" htmlFor="report_alerts">
            {t("notificationPreferences.reportEnable")}
          </label>
        </div>
      </div>

      <div className="dashboard-card p-4 border-dashed mb-4">
        <div className="mb-3">
          <label className="form-label small fw-bold">{t("notificationPreferences.frequency")}</label>
          <select
            className="form-control-custom"
            value={preferences.frequency}
            onChange={e => setPreferences({...preferences, frequency: e.target.value})}
          >
            <option value="instant">{t("notificationPreferences.instant")}</option>
            <option value="daily">{t("notificationPreferences.daily")}</option>
            <option value="weekly">{t("notificationPreferences.weekly")}</option>
          </select>
          <p className="extra-small text-muted-foreground mt-1">
            {preferences.frequency === "instant" && t("notificationPreferences.instantDescription")}
            {preferences.frequency === "daily" && t("notificationPreferences.dailyDescription")}
            {preferences.frequency === "weekly" && t("notificationPreferences.weeklyDescription")}
          </p>
        </div>
      </div>

      <div className="d-flex justify-content-end mt-4">
        <button 
          onClick={handleSave}
          disabled={saving}
          className="btn-primary-elegant px-4 py-2 d-flex align-items-center gap-2"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {t("notificationPreferences.save")}
        </button>
      </div>
    </div>
  );
}
