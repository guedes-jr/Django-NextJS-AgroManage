"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Building2, KeyRound, Mail, Phone, Shield, UserRoundCheck } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { platformService } from "@/services/platformApi";
import type { PlatformUser } from "@/types/platform";

export default function PlatformUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    let active = true;
    platformService.user(id)
      .then((result) => { if (active) setUser(result); })
      .catch(() => { if (active) showToast("Não foi possível carregar o usuário.", "error"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, showToast]);

  const run = async (action: "status" | "sessions") => {
    if (!user) return;
    const message = action === "sessions" ? "encerrar todas as sessões" : user.is_active ? "bloquear este usuário" : "reativar este usuário";
    if (!window.confirm(`Deseja realmente ${message}?`)) return;
    setProcessing(true);
    try {
      if (action === "sessions") await platformService.revokeUserSessions(user.id);
      else if (user.is_active) await platformService.blockUser(user.id);
      else await platformService.activateUser(user.id);
      showToast(action === "sessions" ? "Sessões encerradas com sucesso." : `Usuário ${user.is_active ? "bloqueado" : "reativado"}.`, "success");
      setUser(await platformService.user(id));
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      showToast(status === 403 ? "Seu papel não permite esta operação." : "Não foi possível concluir a operação.", "error");
    } finally { setProcessing(false); }
  };

  if (loading) return <div className="py-5 text-center"><div className="spinner-border text-success" /></div>;
  if (!user) return <div className="alert alert-danger">Usuário não encontrado.</div>;

  return <>
    <Link href="/platform/users" className="text-decoration-none text-muted d-inline-flex align-items-center gap-2 mb-3"><ArrowLeft size={16}/> Voltar aos usuários</Link>
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4"><div><div className="d-flex gap-2 mb-2"><span className={`platform-status ${user.is_active ? "active" : "suspended"}`}>{user.is_active ? "Ativo" : "Bloqueado"}</span><span className="badge text-bg-dark">{user.role_display}</span></div><h1 className="h2 fw-bold mb-1">{user.full_name}</h1><p className="text-muted mb-0">Conta criada em {new Date(user.created_at).toLocaleDateString("pt-BR")}</p></div><div className="d-flex flex-wrap gap-2"><button className="btn btn-outline-secondary d-flex align-items-center gap-2" onClick={() => run("sessions")} disabled={processing}><KeyRound size={16}/>Encerrar sessões</button><button className={`btn ${user.is_active ? "btn-outline-danger" : "btn-success"}`} onClick={() => run("status")} disabled={processing}>{user.is_active ? "Bloquear usuário" : "Reativar usuário"}</button></div></div>
    <div className="row g-3"><div className="col-lg-7"><div className="platform-card p-4 h-100"><h2 className="h5 fw-bold mb-4">Identificação e vínculo</h2><div className="d-flex flex-column gap-4"><div className="d-flex gap-3"><div className="platform-icon"><Mail size={18}/></div><div><div className="platform-label">E-mail</div><div>{user.email}</div></div></div><div className="d-flex gap-3"><div className="platform-icon"><Phone size={18}/></div><div><div className="platform-label">Telefone</div><div>{user.phone || "Não informado"}</div></div></div><div className="d-flex gap-3"><div className="platform-icon"><Building2 size={18}/></div><div><div className="platform-label">Organização</div><div>{user.organization_name || "Sem organização"}</div></div></div><div className="d-flex gap-3"><div className="platform-icon"><Shield size={18}/></div><div><div className="platform-label">Papel</div><div>{user.role_display}</div></div></div></div></div></div><div className="col-lg-5"><div className="platform-card p-4 h-100"><h2 className="h5 fw-bold mb-4">Segurança</h2><div className="d-flex align-items-center gap-3 mb-4"><div className="platform-icon"><UserRoundCheck size={19}/></div><div><div className="platform-label">Último login</div><div>{user.last_login ? new Date(user.last_login).toLocaleString("pt-BR") : "Nunca acessou"}</div></div></div><div className="border-top pt-3"><div className="platform-label mb-1">Troca obrigatória de senha</div><div>{user.force_password_change ? "Pendente" : "Não"}</div></div></div></div></div>
  </>;
}
