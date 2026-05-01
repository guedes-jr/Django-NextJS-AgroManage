"use client";

import { useState, useEffect } from "react";
import { Save, Loader2, Bell, Package, Beef, Receipt, FileText } from "lucide-react";
import notificationService, { NotificationPreference } from "@/services/notificationService";

interface Props {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export default function NotificationPreferences({ onSuccess, onError }: Props) {
  const [preferences, setPreferences] = useState<NotificationPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchPreferences = async () => {
    try {
      const data = await notificationService.getPreferences();
      setPreferences(data);
    } catch (err) {
      console.error("Error fetching preferences:", err);
      onError?.("Erro ao carregar preferências");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreferences();
  }, []);

  const handleSave = async () => {
    if (!preferences) return;
    setSaving(true);
    try {
      await notificationService.updatePreferences(preferences);
      onSuccess?.("Preferências salvas!");
    } catch (err) {
      console.error("Error saving preferences:", err);
      onError?.("Erro ao salvar preferências");
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
      <div className="dashboard-card p-4 border-dashed mb-4">
        <div className="d-flex align-items-center gap-3 mb-3">
          <div className="icon-box bg-primary/10 text-primary rounded-xl p-2">
            <Bell size={20} />
          </div>
          <div>
            <h4 className="fw-bold small mb-1">Notificações por Email</h4>
            <p className="extra-small text-muted-foreground mb-0">Receba alertas e relatórios no seu email</p>
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
            Ativar notificações por email
          </label>
        </div>
      </div>

      <div className="dashboard-card p-4 border-dashed mb-4">
        <div className="d-flex align-items-center gap-3 mb-3">
          <div className="icon-box bg-success/10 text-success rounded-xl p-2">
            <Package size={20} />
          </div>
          <div>
            <h4 className="fw-bold small mb-1">Alertas de Estoque</h4>
            <p className="extra-small text-muted-foreground mb-0">Notificações sobre estoque baixo e validade</p>
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
            Ativar alertas de estoque
          </label>
        </div>
      </div>

      <div className="dashboard-card p-4 border-dashed mb-4">
        <div className="d-flex align-items-center gap-3 mb-3">
          <div className="icon-box bg-warning/10 text-warning rounded-xl p-2">
            <Beef size={20} />
          </div>
          <div>
            <h4 className="fw-bold small mb-1">Alertas de Animais</h4>
            <p className="extra-small text-muted-foreground mb-0">Notificações sobre lotes, vaccinações e saúde</p>
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
            Ativar alertas de animais
          </label>
        </div>
      </div>

      <div className="dashboard-card p-4 border-dashed mb-4">
        <div className="d-flex align-items-center gap-3 mb-3">
          <div className="icon-box bg-info/10 text-info rounded-xl p-2">
            <Receipt size={20} />
          </div>
          <div>
            <h4 className="fw-bold small mb-1">Alertas Financeiros</h4>
            <p className="extra-small text-muted-foreground mb-0">Notificações sobre faturas e pagamentos</p>
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
            Ativar alertas financeiros
          </label>
        </div>
      </div>

      <div className="dashboard-card p-4 border-dashed mb-4">
        <div className="d-flex align-items-center gap-3 mb-3">
          <div className="icon-box bg-secondary/10 text-secondary rounded-xl p-2">
            <FileText size={20} />
          </div>
          <div>
            <h4 className="fw-bold small mb-1">Alertas de Relatórios</h4>
            <p className="extra-small text-muted-foreground mb-0">Notificações sobre novos relatórios disponíveis</p>
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
            Ativar alertas de relatórios
          </label>
        </div>
      </div>

      <div className="dashboard-card p-4 border-dashed mb-4">
        <div className="mb-3">
          <label className="form-label small fw-bold">Frequência de Notificações</label>
          <select
            className="form-control-custom"
            value={preferences.frequency}
            onChange={e => setPreferences({...preferences, frequency: e.target.value})}
          >
            <option value="instant">Instantâneo</option>
            <option value="daily">Resumo Diário</option>
            <option value="weekly">Resumo Semanal</option>
          </select>
          <p className="extra-small text-muted-foreground mt-1">
            {preferences.frequency === "instant" && "Receba notificações imediatamente"}
            {preferences.frequency === "daily" && "Receba um resumo diário das notificações"}
            {preferences.frequency === "weekly" && "Receba um resumo semanal das notificações"}
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
          Salvar Preferências
        </button>
      </div>
    </div>
  );
}