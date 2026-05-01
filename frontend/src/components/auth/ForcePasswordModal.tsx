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
          <div className="icon-box bg-warning/10 text-warning rounded-circle mx-auto mb-3" style={{ width: "64px", height: "64px" }}>
            <ShieldAlert size={32} />
          </div>
          <h2 className="fw-black h4 mb-2">Ação Obrigatória</h2>
          <p className="text-muted-foreground small">
            Por motivos de segurança, você precisa alterar sua senha no primeiro acesso antes de continuar.
          </p>
        </div>

        {error && (
          <div className="alert alert-danger border-0 small py-2 px-3 rounded-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label small fw-bold">Nova Senha</label>
            <div className="input-group-custom">
              <Lock size={18} className="input-icon" />
              <input
                type="password"
                className="form-control-custom"
                placeholder="Mínimo de 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="form-label small fw-bold">Confirmar Nova Senha</label>
            <div className="input-group-custom">
              <Lock size={18} className="input-icon" />
              <input
                type="password"
                className="form-control-custom"
                placeholder="Repita a senha"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                minLength={8}
              />
            </div>
          </div>

          <button 
            type="submit"
            className="btn-primary-elegant w-100 py-2 d-flex align-items-center justify-content-center gap-2"
            disabled={loading}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
            Atualizar Senha
          </button>
        </form>
      </div>
    </div>
  );
}
