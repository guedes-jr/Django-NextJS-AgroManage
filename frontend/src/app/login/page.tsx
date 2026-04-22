"use client";

import "./login.css";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sprout,
  Mail,
  Lock,
  User,
  ArrowRight,
  Eye,
  EyeOff,
} from "lucide-react";
import { apiClient } from "@/services/api";

type View = "login" | "register" | "forgot";

const titles: Record<View, { title: string; subtitle: string }> = {
  login: {
    title: "Bem-vindo de volta",
    subtitle: "Acesse sua fazenda digital",
  },
  register: {
    title: "Crie sua conta",
    subtitle: "Comece a gerenciar sua produção hoje",
  },
  forgot: {
    title: "Recuperar senha",
    subtitle: "Enviaremos um link de redefinição",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("login");
  const [showPwd, setShowPwd] = useState(false);
  const [showPwdConfirm, setShowPwdConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    password_confirm: "",
  });

  const goTo = (next: View) => {
    setView(next);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (view === "login") {
        const { data } = await apiClient.post("/auth/login/", {
          email: formData.email,
          password: formData.password,
        });
        localStorage.setItem("access_token", data.access);
        localStorage.setItem("refresh_token", data.refresh);
        localStorage.setItem("user", JSON.stringify(data.user));
        router.push("/home");
      } else if (view === "register") {
        await apiClient.post("/auth/register/", {
          email: formData.email,
          password: formData.password,
          password_confirm: formData.password_confirm,
          full_name: formData.name,
        });
        alert("Conta criada! Você será redirecionado para o login.");
        goTo("login");
      } else if (view === "forgot") {
        await apiClient.post("/auth/password-recovery/", {
          email: formData.email,
        });
        alert("Link enviado para seu email!");
        goTo("login");
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: { detail?: unknown; message?: string } } } };
      const respData = error.response?.data?.error;
      let msg = respData?.message || "Erro ao processar requisição.";
      
      if (respData?.detail) {
        const d = respData.detail as Record<string, unknown[]>;
        const keys = Object.keys(d);
        if (keys.length > 0) {
          const firstArr = d[keys[0]];
          if (Array.isArray(firstArr) && firstArr.length > 0) {
            msg = String(firstArr[0]);
          }
        }
      }
      
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Hero Section */}
        <div className="login-hero d-none d-lg-block">
          <img
            src="/farm-hero.jpg"
            alt="Fazenda"
            className="login-hero-img"
          />
          <div className="login-hero-overlay" />
          <div className="login-hero-content">
            <div className="d-flex align-items-center gap-2 mb-4">
              <img
                src="/logo_primary.png"
                alt="Gestão Agro Logo"
                style={{ width: '150px', objectFit: 'contain', filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.4))' }}
              />
              <h1 className="mb-0" style={{ fontSize: '3rem', fontWeight: '900', letterSpacing: '-0.04em' }}>
                <span className="logo-text-gestao">Gestão</span>{' '}
                <span className="logo-text-agro">Agro</span>
              </h1>
            </div>

            <div className="hero-text">
              <h1 className="text-white mb-3 fs-2 fw-bold">
                Sua fazenda <span className="text-gradient-gold">inteligente</span>
              </h1>
              <p className="text-white mb-5 fs-6" style={{ maxWidth: '420px', lineHeight: '1.6' }}>
                Controle rebanho, estoque e finanças em uma plataforma moderna,
                feita para o produtor brasileiro.
              </p>

              <div className="d-flex gap-4 pt-2">
                {[
                  { n: "+12k", l: "Produtores" },
                  { n: "98%", l: "Satisfação" },
                  { n: "24/7", l: "Suporte" },
                ].map((s) => (
                  <div key={s.l}>
                    <div className="text-white fw-bold fs-3">{s.n}</div>
                    <div className="text-white small fw-medium">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-white small mb-0 fw-medium opacity-75">
              © {new Date().getFullYear()} Gestão Agro
            </p>
          </div>
        </div>

        {/* Form Section */}
        <div className="login-form-container">
          <div className="login-form-wrapper">
            {/* Auth Tabs */}
            <div className="auth-tabs">
              <button
                type="button"
                className={`auth-tab ${view === 'login' ? 'active' : ''}`}
                onClick={() => goTo('login')}
              >
                Entrar
              </button>
              <button
                type="button"
                className={`auth-tab ${view === 'register' ? 'active' : ''}`}
                onClick={() => goTo('register')}
              >
                Cadastro
              </button>
            </div>

            <div className="view-transition" key={view}>
              <div className="text-center mb-5">
                <h2 className="fw-bold text-dark mb-2" style={{ fontSize: '1.75rem', letterSpacing: '-0.02em' }}>
                  {titles[view].title}
                </h2>
                <p className="text-muted fs-6">{titles[view].subtitle}</p>
              </div>

              {error && (
                <div className="alert alert-danger border-0 shadow-sm py-2 px-3 mb-4 small rounded-4" role="alert">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="d-flex flex-column gap-4">
                  {view === "register" && (
                    <div className="login-input-group">
                      <label>Nome completo</label>
                      <div className="login-input-wrapper">
                        <input
                          type="text"
                          className="login-input login-input-icon-left"
                          placeholder="João da Silva"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                        />
                        <User className="login-input-icon" size={20} />
                      </div>
                    </div>
                  )}

              <div className="login-input-group">
                <label>E-mail</label>
                <div className="login-input-wrapper">
                  <input
                    type="email"
                    className="login-input login-input-icon-left"
                    placeholder="voce@fazenda.com.br"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                  <Mail className="login-input-icon" size={20} />
                </div>
              </div>

              {view !== "forgot" && (
                <div className={view === "register" ? "d-flex gap-3" : ""}>
                  <div className={`login-input-group ${view === "register" ? "flex-grow-1" : ""}`}>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <label className="mb-0">Senha</label>
                    </div>
                    <div className="login-input-wrapper">
                      <input
                        type={showPwd ? "text" : "password"}
                        className="login-input login-input-icon-left"
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                      />
                      <Lock className="login-input-icon" size={20} />
                      <button
                        type="button"
                        className="login-input-toggle"
                        onClick={() => setShowPwd(!showPwd)}
                      >
                        {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {view === "register" && (
                    <div className="login-input-group flex-grow-1">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <label className="mb-0">Confirmar senha</label>
                      </div>
                      <div className="login-input-wrapper">
                        <input
                          type={showPwdConfirm ? "text" : "password"}
                          className="login-input login-input-icon-left"
                          placeholder="••••••••"
                          value={formData.password_confirm}
                          onChange={(e) => setFormData({ ...formData, password_confirm: e.target.value })}
                          required
                        />
                        <Lock className="login-input-icon" size={20} />
                        <button
                          type="button"
                          className="login-input-toggle"
                          onClick={() => setShowPwdConfirm(!showPwdConfirm)}
                        >
                          {showPwdConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                      {formData.password.length > 0 && formData.password_confirm.length > 0 && formData.password !== formData.password_confirm && (
                        <div className="text-danger small mt-1">As senhas não conferem.</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {view === "login" && (
                <div className="d-flex justify-content-between align-items-center">
                  <label className="d-flex align-items-center gap-2 text-muted small cursor-pointer mb-0">
                    <input type="checkbox" className="form-check-input rounded-1" id="remember" style={{ width: '18px', height: '18px' }} />
                    Lembrar meus dados
                  </label>
                  <button
                    type="button"
                    className="btn-link-agro small"
                    onClick={() => goTo("forgot")}
                  >
                    Esqueci a senha
                  </button>
                </div>
              )}

              <button
                type="submit"
                className="btn-login"
                disabled={loading}
              >
                {loading ? (
                  <span className="spinner-border spinner-border-sm" />
                ) : (
                  <>
                    <span>
                      {view === "login" && "Entrar na plataforma"}
                      {view === "register" && "Criar minha conta"}
                      {view === "forgot" && "Enviar link de acesso"}
                    </span>
                    <ArrowRight size={20} />
                  </>
                )}
              </button>

              {view === "forgot" && (
                <div className="text-center">
                  <button
                    type="button"
                    className="btn-link-agro small"
                    onClick={() => goTo("login")}
                  >
                    ← Voltar para o login
                  </button>
                </div>
              )}
            </div>
          </form>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}