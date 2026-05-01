"use client";

import { useState } from "react";
import { Loader2, Lock, ShieldAlert } from "lucide-react";
import { apiClient } from "@/services/api";

interface ForcePasswordModalProps {
  onSuccess: () => void;
}

export function ForcePasswordModal({ onSuccess }: ForcePasswordModalProps) {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== passwordConfirm) {
      setError("As senhas não conferem.");
      return;
    }
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiClient.post("/auth/force-change-password/", {
        new_password: password,
        new_password_confirm: passwordConfirm,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Erro ao alterar a senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{ background: "rgba(0, 0, 0, 0.7)", zIndex: 9999, backdropFilter: "blur(5px)" }}
    >
      <div className="dashboard-card p-4 p-md-5" style={{ maxWidth: "450px", width: "90%" }}>
        <div className="text-center mb-4">
          <div className="icon-box bg-warning/10 text-warning rounded-circle mx-auto mb-3 d-flex align-items-center justify-content-center" style={{ width: "64px", height: "64px" }}>
            <ShieldAlert size={32} />
          </div>
          <h2 className="fw-black h4 mb-2">Ação Obrigatória</h2>
          
          <div className="alert alert-warning border-warning/20 small py-3 px-3 rounded-xl mt-4 text-start d-flex align-items-start gap-3 shadow-sm">
            <ShieldAlert size={20} className="text-warning flex-shrink-0 mt-1" />
            <p className="mb-0 text-dark-emphasis" style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>
              <strong>Por motivos de segurança</strong>, você precisa alterar a senha gerada pelo administrador no seu primeiro acesso antes de continuar. Isso garante que apenas você tenha acesso a essa conta.
            </p>
          </div>
        </div>

        {error && (
          <div className="alert alert-danger border-0 small py-2 px-3 rounded-xl mb-4 shadow-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="login-input-group mb-4">
            <label className="login-label fw-bold small">Nova Senha <span className="text-danger">*</span></label>
            <div className="login-input-wrapper">
              <input
                type="password"
                className="login-input login-input-icon-left bg-transparent text-foreground"
                placeholder="Mínimo de 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <Lock className="login-input-icon text-muted-foreground" size={15} />
            </div>
          </div>

          <div className="login-input-group mb-5">
            <label className="login-label fw-bold small">Confirmar Nova Senha <span className="text-danger">*</span></label>
            <div className="login-input-wrapper">
              <input
                type="password"
                className="login-input login-input-icon-left bg-transparent text-foreground"
                placeholder="Repita a senha"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                minLength={8}
              />
              <Lock className="login-input-icon text-muted-foreground" size={15} />
            </div>
          </div>

          <button 
            type="submit"
            className="btn-primary-elegant w-100 py-3 d-flex align-items-center justify-content-center gap-2 rounded-xl fw-bold shadow-lg"
            disabled={loading}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
            Atualizar Senha e Continuar
          </button>
        </form>
      </div>
    </div>
  );
}
