"use client";

import "./login.css";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  Eye,
  EyeOff,
  PiggyBank,
  Bird,
  Beef,
  Sprout,
  ShieldCheck,
  ChartNoAxesCombined,
  Cloud,
  Smartphone,
} from "lucide-react";
import { apiClient } from "@/services/api";
import { clearPlatformSession, platformService, PLATFORM_STAFF, setPlatformSession } from "@/services/platformApi";
import { useToast } from "@/components/ui/Toast";
import { useTheme } from "@/components/theme/ThemeProvider";
import { isTheme } from "@/lib/theme";
import {
  clearAffiliateTracking,
  getAttributionToken,
  trackAffiliateReferral,
} from "@/services/affiliateTracking";

type View = "login" | "register" | "forgot";

const apiErrorMessage = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = apiErrorMessage(item);
      if (message) return message;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;

  const payload = value as Record<string, unknown>;
  for (const key of ["detail", "non_field_errors", "error", "message"]) {
    const message = apiErrorMessage(payload[key]);
    if (message) return message;
  }
  for (const item of Object.values(payload)) {
    const message = apiErrorMessage(item);
    if (message) return message;
  }
  return null;
};

const titles: Record<View, { title: string; subtitle: string }> = {
  login: {
    title: "Bem-vindo de volta!",
    subtitle: "Acesse sua fazenda digital e continue gerindo o que realmente importa.",
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
  const { showToast } = useToast();
  const { setTheme } = useTheme();
  const [view, setView] = useState<View>("login");
  const [showPwd, setShowPwd] = useState(false);
  const [showPwdConfirm, setShowPwdConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const affiliateTrackingRef = useRef<Promise<void> | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    password_confirm: "",
  });

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const affiliateCode = searchParams.get("ref")?.trim();
    const requestedView = searchParams.get("view");
    if (affiliateCode || requestedView === "register") {
      queueMicrotask(() => setView("register"));
    }
    if (!affiliateCode) return;

    affiliateTrackingRef.current = trackAffiliateReferral(affiliateCode, searchParams);
    void affiliateTrackingRef.current.catch(() => {
      // A falha será exibida se o usuário enviar o formulário de afiliado.
    });
  }, []);

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
        if (data.user?.is_platform_staff === true) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          localStorage.removeItem("user");
          setPlatformSession(data.access, data.refresh);
          const staff = await platformService.me();
          localStorage.setItem(PLATFORM_STAFF, JSON.stringify(staff));
          router.replace("/platform");
        } else if (data.user?.affiliate_portal_only === true) {
          clearPlatformSession();
          localStorage.setItem("access_token", data.access);
          localStorage.setItem("refresh_token", data.refresh);
          localStorage.setItem("affiliate_user", JSON.stringify(data.user));
          localStorage.setItem("user", JSON.stringify(data.user));
          router.replace("/afiliados/painel");
        } else {
          clearPlatformSession();
          localStorage.setItem("access_token", data.access);
          localStorage.setItem("refresh_token", data.refresh);
          localStorage.setItem("user", JSON.stringify(data.user));
          if (isTheme(data.user?.theme)) {
            setTheme(data.user.theme);
          }
          router.replace("/home");
        }
      } else if (view === "register") {
        // O tracking iniciado ao abrir o link pode ainda estar em andamento quando
        // o formulário é enviado. Aguarde-o para não cadastrar sem a atribuição.
        if (!affiliateTrackingRef.current) {
          const searchParams = new URLSearchParams(window.location.search);
          const affiliateCode = searchParams.get("ref")?.trim();
          if (affiliateCode) {
            affiliateTrackingRef.current = trackAffiliateReferral(affiliateCode, searchParams);
          }
        }
        if (affiliateTrackingRef.current) {
          await affiliateTrackingRef.current;
        }
        await apiClient.post("/auth/register/", {
          email: formData.email,
          password: formData.password,
          password_confirm: formData.password_confirm,
          full_name: formData.name,
          referral_token: getAttributionToken(),
        });
        // Uma nova pessoa usando o mesmo navegador precisa de um novo visitante.
        clearAffiliateTracking();
        showToast("Conta criada! Você será redirecionado para o login. 🎉", "success", 15000);
        setTimeout(() => goTo("login"), 2000);
      } else if (view === "forgot") {
        await apiClient.post("/auth/password-recovery/", {
          email: formData.email,
        });
        showToast("Link enviado para seu email! 📧", "success", 15000);
        setTimeout(() => goTo("login"), 2000);
      }
    } catch (err: unknown) {
      // DRF retorna erros como: { non_field_errors: [...] } ou { campo: [...] }
      // Nunca dentro de data.error — precisamos ler data diretamente.
      const axiosErr = err as {
        response?: { data?: Record<string, unknown> };
      };
      setError(apiErrorMessage(axiosErr.response?.data) ?? "Erro ao processar requisição.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-card">
        <section className="login-hero" aria-label="Conheça a Fazenda Mais">
          <div className="login-hero-shade" />
          <div className="login-hero-content">
            <header className="login-brand">
              <Image src="/logo_primary.png" alt="" width={116} height={116} className="login-brand-mark" priority />
              <div><div className="login-brand-name">Fazenda<span>+</span></div><div className="login-brand-tagline">TECNOLOGIA QUE TRANSFORMA GESTÃO EM RESULTADOS</div></div>
            </header>
            <div className="hero-copy">
              <span className="hero-copy-line" />
              <h1>Sua fazenda<br /><strong>mais eficiente</strong><br />com tecnologia.</h1>
              <p>Controle seu rebanho, sua plantação e toda a sua produção em uma única plataforma, com <b>mais segurança, produtividade e resultados.</b></p>
            </div>
            <div className="hero-slogan">Do campo<br />para um futuro<br />melhor!<span /></div>
            <div className="hero-bottom">
              <div className="feature-cards">
                {[
                  { icon: PiggyBank, title: "Suínos", text: "Mais controle e produtividade", className: "pigs" },
                  { icon: Bird, title: "Aves", text: "Gestão completa do seu plantel", className: "birds" },
                  { icon: Beef, title: "Bovinos", text: "Do pasto ao resultado", className: "cattle" },
                  { icon: Sprout, title: "Plantações", text: "Planejamento para melhores safras", className: "crops" },
                ].map(({ icon: Icon, title, text, className }) => (
                  <div className={`feature-card ${className}`} key={title}>
                    <div className="feature-card-image" />
                    <div className="feature-card-content"><Icon size={27} /><strong>{title}</strong><span>{text}</span></div>
                  </div>
                ))}
              </div>
              <div className="hero-benefits">
                <span><ShieldCheck />Dados seguros</span><span><ChartNoAxesCombined />Gestão integrada</span>
                <span><Cloud />Acesso em qualquer lugar</span><span><Smartphone />No campo e na cidade</span>
              </div>
            </div>
          </div>
        </section>

        <section className="login-form-container">
          <div className="login-form-wrapper">
            <div className="auth-tabs">
              <button type="button" className={`auth-tab ${view === "login" ? "active" : ""}`} onClick={() => goTo("login")}>Entrar</button>
              <button type="button" className={`auth-tab ${view === "register" ? "active" : ""}`} onClick={() => goTo("register")}>Cadastro</button>
            </div>
            <div className="view-transition" key={view}>
              <div className="login-heading"><h2>{titles[view].title}</h2><p>{titles[view].subtitle}</p></div>
              {error && <div className="login-error" role="alert">{error}</div>}
              <form onSubmit={handleSubmit} className="login-form">
                <div className="login-fields">
                  {view === "register" && (
                    <div className="login-input-group">
                      <label htmlFor="name">Nome completo</label>
                      <div className="login-input-wrapper">
                        <input id="name" type="text" className="login-input login-input-icon-left" placeholder="João da Silva" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                        <User className="login-input-icon" size={20} />
                      </div>
                    </div>
                  )}
                  <div className="login-input-group">
                    <label htmlFor="email">E-mail</label>
                    <div className="login-input-wrapper">
                      <input id="email" type="email" className="login-input login-input-icon-left" placeholder="voce@fazenda.com.br" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
                      <Mail className="login-input-icon" size={20} />
                    </div>
                  </div>
                  {view !== "forgot" && (
                    <div className={view === "register" ? "register-passwords" : ""}>
                      <div className="login-input-group">
                        <label htmlFor="password">Senha</label>
                        <div className="login-input-wrapper">
                          <input id="password" type={showPwd ? "text" : "password"} className="login-input login-input-icon-left login-input-password" placeholder="Sua senha" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required />
                          <Lock className="login-input-icon" size={20} />
                          <button type="button" className="login-input-toggle" onClick={() => setShowPwd(!showPwd)} aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}>{showPwd ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                        </div>
                      </div>
                      {view === "register" && (
                        <div className="login-input-group">
                          <label htmlFor="password-confirm">Confirmar senha</label>
                          <div className="login-input-wrapper">
                            <input id="password-confirm" type={showPwdConfirm ? "text" : "password"} className="login-input login-input-icon-left login-input-password" placeholder="Confirme sua senha" value={formData.password_confirm} onChange={(e) => setFormData({ ...formData, password_confirm: e.target.value })} required />
                            <Lock className="login-input-icon" size={20} />
                            <button type="button" className="login-input-toggle" onClick={() => setShowPwdConfirm(!showPwdConfirm)} aria-label={showPwdConfirm ? "Ocultar confirmação" : "Mostrar confirmação"}>{showPwdConfirm ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                          </div>
                          {formData.password && formData.password_confirm && formData.password !== formData.password_confirm && <div className="password-error">As senhas não conferem.</div>}
                        </div>
                      )}
                    </div>
                  )}
                  {view === "login" && (
                    <div className="login-options">
                      <label className="remember-label"><input type="checkbox" id="remember" />Lembrar meus dados</label>
                      <button type="button" className="btn-link-agro" onClick={() => goTo("forgot")}>Esqueci a senha?</button>
                    </div>
                  )}
                </div>
                <button type="submit" className="btn-login" disabled={loading}>
                  {loading ? <span className="spinner-border spinner-border-sm" /> : <><span>{view === "login" ? "Entrar na plataforma" : view === "register" ? "Criar minha conta" : "Enviar link de acesso"}</span><ArrowRight size={21} /></>}
                </button>
                {view === "forgot" && <div className="login-back"><button type="button" className="btn-link-agro" onClick={() => goTo("login")}>← Voltar para o login</button></div>}
              </form>
            </div>
            {view === "login" && (
              <>
                <div className="login-divider"><span>ou</span></div>
                <button type="button" className="google-login"><span className="google-g">G</span>Entrar com Google</button>
                <p className="login-security"><Lock size={16} />Seus dados estão protegidos e são 100% seguros.</p>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
