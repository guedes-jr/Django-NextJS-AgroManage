"use client";
import { usePublicLocale } from "@/lib/publicLocale";

import WhatsAppContactOptions from "@/components/auth/WhatsAppContactOptions";

import "./login.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Script from "next/script";
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
    title: t("workspace.welcomeBack"),
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
  const affiliateTrackingRef = useRef<Promise<void> | null>(null);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
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

  const goTo = (next: View) => {
    setView(next);
    setError("");
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
    <main className="login-page">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setGoogleReady(true)}
      />
      <div className="login-card">
        <section className="login-hero" aria-label={t("workspace.discoverFazendaMais")}>
          <div className="login-hero-shade" />
          <div className="login-hero-content">
            <header className="login-brand">
              <Image src="/logo_agro_leaf.png" alt="" width={116} height={116} className="login-brand-mark" priority />
              <div><div className="login-brand-name">{t("dairy.home.farm")}<span>+</span></div><div className="login-brand-tagline">{t("workspace.technologyThatTurnsManagementIntoResults")}</div></div>
            </header>
            <div className="hero-copy">
              <span className="hero-copy-line" />
              <h1>{t("workspace.yourFarm")}<br /><strong>{t("workspace.moreEfficient")}</strong><br />{t("workspace.withTechnology")}</h1>
              <p>{t("workspace.manageYourHerdCropsAndAllProductionInOnePlatform")} <b>{t("workspace.moreSecurityProductivityAndResults")}</b></p>
            </div>
            <div className="hero-slogan">{t("workspace.fromTheField")}<br />{t("workspace.toABetter")}<br />{t("workspace.future")}<span /></div>
            <div className="hero-bottom">
              <div className="feature-cards">
                {[
                  { icon: PiggyBank, title: t("reproduction.speciesSwine"), text: t("workspace.moreControlAndProductivity"), className: "pigs" },
                  { icon: Bird, title: t("reproduction.speciesPoultry"), text: t("workspace.completeHerdManagement"), className: "birds" },
                  { icon: Beef, title: t("reproduction.speciesCattle"), text: t("workspace.fromPastureToResults"), className: "cattle" },
                  { icon: Sprout, title: t("users.crops"), text: t("workspace.planningForBetterHarvests"), className: "crops" },
                ].map(({ icon: Icon, title, text, className }) => (
                  <div className={`feature-card ${className}`} key={title}>
                    <div className="feature-card-image" />
                    <div className="feature-card-content"><Icon size={27} /><strong>{title}</strong><span>{text}</span></div>
                  </div>
                ))}
              </div>
              <div className="hero-benefits">
                <span><ShieldCheck />{t("workspace.secureData")}</span><span><ChartNoAxesCombined />{t("workspace.integratedManagement")}</span>
                <span><Cloud />{t("workspace.accessFromAnywhere")}</span><span><Smartphone />{t("workspace.inTheFieldAndInTheCity")}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="login-form-container">
          <div className="login-form-wrapper">
            <div className="auth-tabs">
              <button type="button" className={`auth-tab ${view === "login" ? "active" : ""}`} onClick={() => goTo("login")}>{t("reproduction.enter")}</button>
              <button type="button" className={`auth-tab ${view === "register" ? "active" : ""}`} onClick={() => goTo("register")}>{t("swine.home.module.registry")}</button>
            </div>
            <div className="view-transition" key={view}>
              <div className="login-heading"><h2>{titles[view].title}</h2><p>{titles[view].subtitle}</p></div>
              {error && <div className="login-error" role="alert">{error}</div>}
              <form onSubmit={handleSubmit} className="login-form">
                <div className="login-fields">
                  {view === "register" && (
                    <div className="login-input-group">
                      <label htmlFor="name">{t("users.name")}</label>
                      <div className="login-input-wrapper">
                        <input id="name" type="text" className="login-input login-input-icon-left" placeholder="João da Silva" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                        <User className="login-input-icon" size={20} />
                      </div>
                    </div>
                  )}
                  <div className="login-input-group">
                    <label htmlFor="email">{t("profile.email")}</label>
                    <div className="login-input-wrapper">
                      <input id="email" type="email" className="login-input login-input-icon-left" placeholder="voce@fazenda.com.br" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
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
                        <label htmlFor="password">{t("settings.member.password")}</label>
                        <div className="login-input-wrapper">
                          <input id="password" type={showPwd ? "text" : "password"} className="login-input login-input-icon-left login-input-password" placeholder={t("workspace.yourPassword")} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required />
                          <Lock className="login-input-icon" size={20} />
                          <button type="button" className="login-input-toggle" onClick={() => setShowPwd(!showPwd)} aria-label={showPwd ? t("workspace.hidePassword") : t("workspace.showPassword")}>{showPwd ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                        </div>
                      </div>
                      {view === "register" && (
                        <div className="login-input-group">
                          <label htmlFor="password-confirm">{t("settings.member.confirmPassword")}</label>
                          <div className="login-input-wrapper">
                            <input id="password-confirm" type={showPwdConfirm ? "text" : "password"} className="login-input login-input-icon-left login-input-password" placeholder={t("workspace.confirmYourPassword")} value={formData.password_confirm} onChange={(e) => setFormData({ ...formData, password_confirm: e.target.value })} required />
                            <Lock className="login-input-icon" size={20} />
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
                <button type="submit" className="btn-login" disabled={loading}>
                  {loading ? <span className="spinner-border spinner-border-sm" /> : <><span>{view === "login" ? t("workspace.signInToThePlatform") : view === "register" ? t("workspace.createMyAccount") : t("workspace.sendAccessLink")}</span><ArrowRight size={21} /></>}
                </button>
                {view === "forgot" && <div className="login-back"><button type="button" className="btn-link-agro" onClick={() => goTo("login")}>{t("workspace.backToSignIn")}</button></div>}
              </form>
            </div>
            {view === "login" && (
              <>
                <div className="login-divider"><span>{t("workspace.or")}</span></div>
                {googleClientId ? (
                  <div
                    ref={googleButtonRef}
                    className={`google-login-slot${loading ? " is-loading" : ""}`}
                    aria-label={t("workspace.signInWithGoogle")}
                  />
                ) : (
                  <button type="button" className="google-login" disabled title="Configure NEXT_PUBLIC_GOOGLE_CLIENT_ID">
                    <span className="google-g">G</span>{t("workspace.signInWithGoogle")}
                  </button>
                )}
                <p className="login-security"><Lock size={16} />{t("workspace.yourDataIsProtectedAndFullySecure")}</p>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
