"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";

import { platformService } from "@/services/platformApi";

function errorMessage(error: unknown) {
  const data = (error as { response?: { data?: Record<string, unknown> } }).response?.data;
  if (!data) return "Não foi possível entrar. Verifique a conexão.";
  for (const value of Object.values(data)) {
    if (Array.isArray(value) && value.length) return String(value[0]);
    if (typeof value === "string") return value;
  }
  return "Credenciais inválidas ou acesso não autorizado.";
}

export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await platformService.login(email, password);
      router.replace("/platform");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="platform-login">
      <section className="platform-login-hero">
        <div className="d-flex align-items-center gap-3"><div className="platform-brand-mark"><ShieldCheck /></div><div><div className="fw-bold fs-5">AgroManage</div><div className="text-white-50">Central da Plataforma</div></div></div>
        <div><h1 className="display-5 fw-bold mb-3">Controle seguro da sua operação SaaS.</h1><p className="lead text-white-50" style={{maxWidth:580}}>Organizações, usuários, indicadores e operações administrativas em um ambiente separado do painel dos clientes.</p></div>
        <div className="small text-white-50">Acesso exclusivo e auditado para a equipe interna.</div>
      </section>
      <section className="platform-login-form">
        <div className="platform-login-card">
          <div className="platform-icon mb-4"><LockKeyhole size={22} /></div>
          <h2 className="fw-bold mb-2">Acesso administrativo</h2>
          <p className="text-muted mb-4">Entre com sua conta interna da plataforma.</p>
          {error && <div className="alert alert-danger py-2 small">{error}</div>}
          <form onSubmit={submit} className="d-flex flex-column gap-3">
            <div><label className="form-label fw-semibold small">E-mail</label><input className="form-control form-control-lg" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" /></div>
            <div><label className="form-label fw-semibold small">Senha</label><div className="input-group"><input className="form-control form-control-lg" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /><button type="button" className="btn btn-outline-secondary" onClick={() => setShowPassword((value) => !value)} aria-label="Mostrar senha">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
            <button className="btn btn-success btn-lg mt-2" disabled={loading}>{loading ? <span className="spinner-border spinner-border-sm" /> : "Entrar na plataforma"}</button>
          </form>
        </div>
      </section>
    </div>
  );
}
