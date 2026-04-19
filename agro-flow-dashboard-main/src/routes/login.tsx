import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import {
  Sprout,
  Mail,
  Lock,
  User,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logo from "@/assets/logo.png";
import farmHero from "@/assets/farm-hero.jpg";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Acessar — Gestão Agro" },
      {
        name: "description",
        content:
          "Sistema de Gerenciamento Agropecuário e Agrícola. Faça login, cadastre-se ou recupere sua senha.",
      },
    ],
  }),
  component: AuthPage,
});

type View = "login" | "register" | "forgot";

const views: View[] = ["login", "register", "forgot"];

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

function AuthPage() {
  const [view, setView] = useState<View>("login");
  const [direction, setDirection] = useState(1);
  const [showPwd, setShowPwd] = useState(false);
  const navigate = useNavigate();

  const goTo = (next: View) => {
    const currIdx = views.indexOf(view);
    const nextIdx = views.indexOf(next);
    setDirection(nextIdx > currIdx ? 1 : -1);
    setView(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (view === "forgot") {
      goTo("login");
      return;
    }
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen w-full bg-background lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Hero side */}
      <div className="relative hidden overflow-hidden lg:block">
        <img
          src={farmHero}
          alt="Fazenda ao entardecer"
          className="absolute inset-0 h-full w-full object-cover"
          width={1280}
          height={1600}
        />
        <div className="absolute inset-0 bg-gradient-hero" />
        <div className="relative z-10 flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-md">
              <Sprout className="h-6 w-6" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Gestão Agro</span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-lg space-y-6"
          >
            <img
              src={logo}
              alt="Logo Gestão Agro"
              className="h-40 w-40 drop-shadow-2xl"
            />
            <h1 className="text-5xl font-bold leading-tight tracking-tight">
              Sua fazenda <span className="text-gradient-gold">inteligente</span>
            </h1>
            <p className="text-lg text-white/90">
              Controle rebanho, lavoura, estoque e finanças em uma plataforma moderna,
              feita para o produtor brasileiro.
            </p>
            <div className="flex gap-6 pt-4">
              {[
                { n: "+12k", l: "Produtores" },
                { n: "98%", l: "Satisfação" },
                { n: "24/7", l: "Suporte" },
              ].map((s) => (
                <div key={s.l}>
                  <div className="text-3xl font-bold">{s.n}</div>
                  <div className="text-sm text-white/75">{s.l}</div>
                </div>
              ))}
            </div>
          </motion.div>

          <p className="text-sm text-white/70">
            © {new Date().getFullYear()} Gestão Agro · Sistema de Gerenciamento Agropecuário
          </p>
        </div>
      </div>

      {/* Form side — carousel */}
      <div className="relative flex min-h-screen items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Tabs */}
          <div className="mb-8 flex items-center justify-center gap-1 rounded-full bg-muted p-1 text-sm font-medium">
            {(
              [
                { v: "login" as View, label: "Entrar" },
                { v: "register" as View, label: "Cadastrar" },
                { v: "forgot" as View, label: "Recuperar" },
              ]
            ).map((t) => (
              <button
                key={t.v}
                onClick={() => goTo(t.v)}
                className={`relative flex-1 rounded-full px-4 py-2 transition-colors ${
                  view === t.v
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {view === t.v && (
                  <motion.div
                    layoutId="auth-tab"
                    className="absolute inset-0 rounded-full bg-gradient-primary shadow-soft"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="relative overflow-hidden" style={{ perspective: 1200 }}>
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={view}
                custom={direction}
                initial={{ opacity: 0, x: direction * 60, rotateY: direction * 8 }}
                animate={{ opacity: 1, x: 0, rotateY: 0 }}
                exit={{ opacity: 0, x: -direction * 60, rotateY: -direction * 8 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="mb-6">
                  <h2 className="text-3xl font-bold tracking-tight">{titles[view].title}</h2>
                  <p className="mt-1 text-muted-foreground">{titles[view].subtitle}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {view === "register" && (
                    <Field
                      icon={<User className="h-4 w-4" />}
                      label="Nome completo"
                      id="name"
                      placeholder="João da Silva"
                    />
                  )}

                  <Field
                    icon={<Mail className="h-4 w-4" />}
                    label="E-mail"
                    id="email"
                    type="email"
                    placeholder="voce@fazenda.com.br"
                  />

                  {view !== "forgot" && (
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-sm font-medium">
                        Senha
                      </Label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="password"
                          type={showPwd ? "text" : "password"}
                          placeholder="••••••••"
                          className="h-11 pl-10 pr-10"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPwd((s) => !s)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {view === "login" && (
                    <div className="flex items-center justify-between text-sm">
                      <label className="flex items-center gap-2 text-muted-foreground">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                        Lembrar-me
                      </label>
                      <button
                        type="button"
                        onClick={() => goTo("forgot")}
                        className="font-medium text-primary hover:underline"
                      >
                        Esqueci a senha
                      </button>
                    </div>
                  )}

                  {view === "forgot" && (
                    <div className="rounded-lg border border-accent/40 bg-accent/30 p-3 text-sm text-accent-foreground">
                      <KeyRound className="mr-2 inline h-4 w-4" />
                      Enviaremos um link seguro para o e-mail cadastrado.
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="h-11 w-full bg-gradient-primary text-base font-semibold shadow-soft transition-all hover:shadow-elegant"
                  >
                    {view === "login" && "Entrar"}
                    {view === "register" && "Criar conta"}
                    {view === "forgot" && "Enviar link"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>

                  {view === "forgot" && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => goTo("login")}
                      className="w-full"
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao login
                    </Button>
                  )}

                  {view !== "forgot" && (
                    <p className="pt-2 text-center text-sm text-muted-foreground">
                      {view === "login" ? "Novo por aqui?" : "Já tem conta?"}{" "}
                      <button
                        type="button"
                        onClick={() => goTo(view === "login" ? "register" : "login")}
                        className="font-semibold text-primary hover:underline"
                      >
                        {view === "login" ? "Cadastre-se" : "Entrar"}
                      </button>
                    </p>
                  )}
                </form>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  id,
  type = "text",
  placeholder,
}: {
  icon: React.ReactNode;
  label: string;
  id: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
        <Input id={id} type={type} placeholder={placeholder} className="h-11 pl-10" required />
      </div>
    </div>
  );
}
