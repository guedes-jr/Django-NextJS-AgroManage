"use client";
import { usePublicLocale } from "@/lib/publicLocale";

import WhatsAppContactOptions from "@/components/auth/WhatsAppContactOptions";

import "./login.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Script from "next/script";
import {
  Mail, Lock, User, LogIn, Eye, EyeOff, Sprout, ShieldCheck,
  ChartNoAxesCombined, Layers, FileText, CheckCircle2,
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

interface LoginResponse {
  access: string;
  refresh: string;
  user: {
    is_platform_staff?: boolean;
    affiliate_portal_only?: boolean;
    theme?: unknown;
    [key: string]: unknown;
  };
}

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdentityApi {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
      }) => void;
      renderButton: (
        parent: HTMLElement,
        options: Record<string, string | number>,
      ) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityApi;
  }
}

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


export default function LoginPage() {
  return <LoginContent />;
}

function LoginContent() {
  const { language, t } = usePublicLocale();
const titles: Record<View, { title: string; subtitle: string }> = {
  login: {
    title: t("login.accessTitle"),
    subtitle: t("workspace.accessYourDigitalFarmAndKeepManagingWhatMattersMost"),
  },
  register: {
    title: t("workspace.createYourAccount"),
    subtitle: t("workspace.startManagingYourProductionToday"),
  },
  forgot: {
    title: t("workspace.recoverPassword"),
    subtitle: t("workspace.weWillSendAResetLink"),
  },
};

  const router = useRouter();
  const { showToast } = useToast();
  const { setTheme } = useTheme();
  const [view, setView] = useState<View>("login");
  const [showPwd, setShowPwd] = useState(false);
  const [showPwdConfirm, setShowPwdConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [googleReady, setGoogleReady] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);
  const affiliateTrackingRef = useRef<Promise<void> | null>(null);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const formContainerRef = useRef<HTMLElement | null>(null);
  const formContentRef = useRef<HTMLDivElement | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    phone_is_whatsapp: false,
    receive_system_alerts: false,
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

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("view") === "register" || searchParams.get("ref")) return;

    const platformAccess = localStorage.getItem("platform_access_token");
    const access = localStorage.getItem("access_token");
    if (!platformAccess && !access) return;

    if (platformAccess) {
      router.replace("/platform");
      return;
    }

    let isAffiliatePortalOnly = false;
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        isAffiliatePortalOnly = Boolean(JSON.parse(storedUser).affiliate_portal_only);
      } catch {
        // usuário inválido no storage; segue para o login.
      }
    }
    router.replace(isAffiliatePortalOnly ? "/afiliados/painel" : "/home");
  }, [router]);

  useEffect(() => {
    if (view !== "login" || !formContentRef.current) return;
    const content = formContentRef.current;
    let active = true;
    const observer = new ResizeObserver(() => {
      if (active) heroRef.current?.style.setProperty("--login-matched-height", `${content.getBoundingClientRect().height}px`);
    });
    observer.observe(content);
    return () => { active = false; observer.disconnect(); };
  }, [view]);

  const goTo = (next: View) => {
    if (loading || next === view) return;
    setView(next);
    setError("");
    formContainerRef.current?.scrollTo({ top: 0, behavior: "auto" });
  };

  const completeLogin = useCallback(async (data: LoginResponse) => {
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
      if (isTheme(data.user?.theme)) setTheme(data.user.theme);
      router.replace("/home");
    }
  }, [router, setTheme]);

  const handleGoogleCredential = useCallback(async (response: GoogleCredentialResponse) => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiClient.post<LoginResponse>("/auth/google/", {
        credential: response.credential,
      });
      await completeLogin(data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: Record<string, unknown> } };
      setError(apiErrorMessage(axiosErr.response?.data) ?? t("workspace.couldNotSignInWithGoogle"));
    } finally {
      setLoading(false);
    }
  }, [completeLogin, t]);

  useEffect(() => {
    const target = googleButtonRef.current;
    if (!googleReady || view !== "login" || !googleClientId || !target || !window.google) return;

    target.replaceChildren();
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: (response) => void handleGoogleCredential(response),
    });
    window.google.accounts.id.renderButton(target, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "signin_with",
      locale: language,
      width: Math.min(400, Math.max(240, Math.floor(target.getBoundingClientRect().width))),
    });
  }, [googleClientId, googleReady, handleGoogleCredential, view, language]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (view === "login") {
        const { data } = await apiClient.post<LoginResponse>("/auth/login/", {
          email: formData.email,
          password: formData.password,
        });
        await completeLogin(data);
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
          phone: formData.phone,
          phone_is_whatsapp: formData.phone_is_whatsapp,
          receive_system_alerts: formData.receive_system_alerts,
          referral_token: getAttributionToken(),
        });
        // Uma nova pessoa usando o mesmo navegador precisa de um novo visitante.
        clearAffiliateTracking();
        showToast(t("workspace.accountCreatedYouWillBeRedirectedToSignIn"), "success", 15000);
        setTimeout(() => goTo("login"), 2000);
      } else if (view === "forgot") {
        await apiClient.post("/auth/password-recovery/", {
          email: formData.email,
        });
        showToast(t("workspace.linkSentToYourEmail"), "success", 15000);
        setTimeout(() => goTo("login"), 2000);
      }
    } catch (err: unknown) {
      // DRF retorna erros como: { non_field_errors: [...] } ou { campo: [...] }
      // Nunca dentro de data.error — precisamos ler data diretamente.
      const axiosErr = err as {
        response?: { data?: Record<string, unknown> };
      };
      setError(apiErrorMessage(axiosErr.response?.data) ?? t("workspace.couldNotProcessTheRequest"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={`login-page login-view-${view}`}>
      <div className="login-landscape" aria-hidden="true" />
      <svg className="login-wave login-wave-top" viewBox="0 0 1440 140" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="login-top-lime" x2="1" y2=".4"><stop stopColor="#289900"/><stop offset=".48" stopColor="#CAFF00"/><stop offset="1" stopColor="#E9FF54"/></linearGradient></defs><path d="M0 0H980C520 14 260 27 0 140Z" fill="url(#login-top-lime)"/><path d="M0 128C280 15 560 15 980 0" fill="none" stroke="#EDFF9A" strokeWidth="3"/></svg>
      <svg className="login-wave login-wave-bottom" viewBox="0 0 1440 150" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="login-bottom-lime" x2="1" y2=".3"><stop stopColor="#47AA00"/><stop offset=".5" stopColor="#C6F900"/><stop offset="1" stopColor="#7BC300"/></linearGradient></defs><path d="M0 70C580 240 1040-54 1440 12V150H0Z" fill="url(#login-bottom-lime)"/><path d="M0 94C580 260 1040-16 1440 56V150H0Z" fill="#003E27"/><path d="M0 70C580 240 1040-54 1440 12" fill="none" stroke="#DCFF68" strokeWidth="4"/></svg>
      <svg className="login-mobile-backdrop" viewBox="0 0 1000 1600" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="mobile-auth-lime" x2="1" y2=".4"><stop stopColor="#239700"/><stop offset=".32" stopColor="#c4ff00"/><stop offset=".52" stopColor="#f1ff75"/><stop offset="1" stopColor="#348800"/></linearGradient><linearGradient id="mobile-auth-deep" x2="1" y2="1"><stop stopColor="#087429"/><stop offset="1" stopColor="#002d20"/></linearGradient><radialGradient id="mobile-auth-glow" cx=".1" cy=".91" r=".8"><stop stopColor="#39d200" stopOpacity=".3"/><stop offset="1" stopColor="#005333" stopOpacity="0"/></radialGradient></defs>
        <path d="M0 0H480C300 44 96 40 0 210Z" fill="url(#mobile-auth-deep)"/>
        <path d="M0 0H310C178 32 65 94 0 190Z" fill="url(#mobile-auth-lime)"/>
        <path d="M0 188C65 95 175 32 310 0" stroke="#f1ff8b" strokeWidth="3" fill="none"/>
        <path d="M0 1463C350 1655 650 1390 1000 1390V1600H0Z" fill="url(#mobile-auth-deep)"/>
        <path d="M0 1447C320 1640 695 1340 1000 1378V1468C715 1322 370 1700 0 1576Z" fill="url(#mobile-auth-lime)"/>
        <path d="M0 1447C320 1640 695 1340 1000 1378" stroke="#edff86" strokeWidth="4" fill="none"/>
        <path d="M0 1488C330 1686 700 1412 1000 1468V1530C670 1410 300 1710 0 1598Z" fill="#003c23" fillOpacity=".72"/>
      </svg>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => { if (window.google?.accounts.id) setGoogleReady(true); else setGoogleFailed(true); }}
        onError={() => setGoogleFailed(true)}
      />
      <div className="login-card">
        <section ref={heroRef} className="login-hero" aria-label={t("workspace.discoverFazendaMais")}>
          <div className="login-hero-content">
            <header className="login-brand" aria-label="Fazenda Mais">
              <Image src="/logo_agro_leaf.png" alt="" width={96} height={96} className="login-brand-mark" priority />
              <div className="login-brand-wordmark"><div className="login-brand-name">Fazenda<span aria-hidden="true">+</span></div><svg className="login-brand-swoosh" viewBox="0 0 300 24" aria-hidden="true"><defs><linearGradient id="login-brand-lime"><stop stopColor="#2C9900"/><stop offset="1" stopColor="#DFFF00"/></linearGradient></defs><path d="M0 19Q145-15 300 19Q145 0 5 24Z" fill="url(#login-brand-lime)"/></svg></div>
            </header>
            <div className="hero-copy">
              <h1>{t("login.heroLead")} <strong>{t("login.heroAccent")}</strong></h1>
              <p>{t("login.heroDescription")}</p>
              <div className="login-hero-details"><p>{t("login.heroDetails")}</p><ul><li><CheckCircle2 size={15} aria-hidden="true"/>{t("workspace.secureData")}</li><li><CheckCircle2 size={15} aria-hidden="true"/>{t("workspace.integratedManagement")}</li><li><CheckCircle2 size={15} aria-hidden="true"/>{t("workspace.accessFromAnywhere")}</li></ul></div>
            </div>
            <div className="feature-cards">
              {[{icon:Sprout,title:t("login.production")},{icon:Layers,title:t("sidebar.inventory")},{icon:ChartNoAxesCombined,title:t("sidebar.finance")}].map(({icon:Icon,title}) => <div className="feature-card" key={title}><Icon size={32} aria-hidden="true"/><strong>{title}</strong></div>)}
            </div>
          </div>
        </section>

        <section ref={formContainerRef} className="login-form-container">
          <div className="login-form-wrapper">
            <div ref={formContentRef} className="login-form-content">
            <div className="view-transition" key={view}>
              <div className="login-heading"><h2>{titles[view].title}</h2>{view === "forgot" && <p>{titles[view].subtitle}</p>}</div>
              {error && <div className="login-error" role="alert">{error}</div>}
              <form onSubmit={handleSubmit} className="login-form">
                <div className="login-fields">
                  {view === "register" && (
                    <div className="login-input-group">
                      <label htmlFor="name"><User size={18} aria-hidden="true"/>{t("users.name")}</label>
                      <div className="login-input-wrapper">
                        <input id="name" type="text" className="login-input" placeholder="João da Silva" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                      </div>
                    </div>
                  )}
                  <div className="login-input-group">
                    <label htmlFor="email"><Mail size={18} aria-hidden="true"/>{t("profile.email")}</label>
                    <div className="login-input-wrapper">
                      <input id="email" type="email" className="login-input login-input-icon-right" placeholder="voce@exemplo.com" autoComplete="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
                      <Mail className="login-input-icon" size={20} />
                    </div>
                  </div>
                  {view === "register" && <>
                    <div className="login-input-group">
                      <label htmlFor="contact-phone">{t("users.phone")}</label>
                      <input id="contact-phone" type="tel" autoComplete="tel" maxLength={30} className="login-input" placeholder="(00) 00000-0000" required={formData.phone_is_whatsapp} value={formData.phone} onChange={event => setFormData({ ...formData, phone: event.target.value })} />
                    </div>
                    <WhatsAppContactOptions value={formData} disabled={loading} onChange={value => setFormData({ ...formData, ...value })} />
                  </>}
                  {view !== "forgot" && (
                    <div className={view === "register" ? "register-passwords" : ""}>
                      <div className="login-input-group">
                        <label htmlFor="password"><Lock size={18} aria-hidden="true"/>{t("settings.member.password")}</label>
                        <div className="login-input-wrapper">
                          <input id="password" type={showPwd ? "text" : "password"} className="login-input login-input-password" autoComplete={view === "login" ? "current-password" : "new-password"} placeholder={t("workspace.yourPassword")} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required />
                          <button type="button" className="login-input-toggle" onClick={() => setShowPwd(!showPwd)} aria-label={showPwd ? t("workspace.hidePassword") : t("workspace.showPassword")}>{showPwd ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                        </div>
                      </div>
                      {view === "register" && (
                        <div className="login-input-group">
                          <label htmlFor="password-confirm"><Lock size={18} aria-hidden="true"/>{t("settings.member.confirmPassword")}</label>
                          <div className="login-input-wrapper">
                            <input id="password-confirm" type={showPwdConfirm ? "text" : "password"} className="login-input login-input-password" autoComplete="new-password" placeholder={t("workspace.confirmYourPassword")} value={formData.password_confirm} onChange={(e) => setFormData({ ...formData, password_confirm: e.target.value })} required />
                            <button type="button" className="login-input-toggle" onClick={() => setShowPwdConfirm(!showPwdConfirm)} aria-label={showPwdConfirm ? t("workspace.hideConfirmation") : t("workspace.showConfirmation")}>{showPwdConfirm ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                          </div>
                          {formData.password && formData.password_confirm && formData.password !== formData.password_confirm && <div className="password-error">{t("settings.member.passwordsDiffer")}</div>}
                        </div>
                      )}
                    </div>
                  )}
                  {view === "login" && (
                    <div className="login-options">
                      <label className="remember-label"><input type="checkbox" id="remember" />{t("workspace.rememberMyDetails")}</label>
                      <button type="button" className="btn-link-agro" onClick={() => goTo("forgot")}>{t("workspace.forgotPassword")}</button>
                    </div>
                  )}
                </div>
                <div className="login-submit-row">
                <button type="submit" className="btn-login" disabled={loading} aria-busy={loading}>
                  {loading ? <><span className="spinner-border spinner-border-sm" aria-hidden="true"/><span role="status">{t("affiliate.loading")}</span></> : <><LogIn size={23} aria-hidden="true"/><span>{view === "login" ? t("login") : view === "register" ? t("workspace.createMyAccount") : t("workspace.sendAccessLink")}</span></>}
                </button>
                </div>
                {view !== "login" && <div className="login-back login-signup"><span aria-hidden="true"/><p>{view === "register" && <>{t("login.hasAccount")} </>}<button type="button" disabled={loading} onClick={() => goTo("login")}>{t("login")}</button></p><span aria-hidden="true"/></div>}
              </form>
            </div>
            {view === "login" && <>
              <div className="login-google"><div className="login-divider"><span>{t("workspace.or")}</span></div><div ref={googleButtonRef} className={`google-login-slot${loading ? " is-loading" : ""}${!googleReady || !googleClientId || googleFailed ? " is-pending" : ""}`} aria-label={t("workspace.signInWithGoogle")}/>{(!googleClientId || !googleReady || googleFailed) && <><button type="button" className="login-google-fallback" disabled aria-label={t("workspace.signInWithGoogle")}><span aria-hidden="true">G</span>{t("workspace.signInWithGoogle")}</button><p className="login-google-hint">{t(!googleClientId || googleFailed ? "login.googleUnavailable" : "login.googleLoading")}</p></>}</div>
              <div className="login-signup"><span aria-hidden="true"/><p>{t("login.noAccount")} <button type="button" disabled={loading} onClick={() => goTo("register")}>{t("login.register")}</button></p><span aria-hidden="true"/></div>
            </>}
            </div>
          </div>
        </section>
      </div>
      <footer className="login-page-footer">
            <div className="login-legal"><a href="/termos"><FileText size={19} aria-hidden="true"/>{t("public.termsOfUse")}</a><span aria-hidden="true"/><a href="/privacidade"><ShieldCheck size={20} aria-hidden="true"/>{t("privacy")}</a></div>
            <p className="login-copyright">© {new Date().getFullYear()} Fazenda Mais. {t("copyright")}</p>
      </footer>
    </main>
  );
}
