"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { organizationInvitations, getOrganizationErrorMessage, type InvitationPreview } from "@/services/organizationInvitations";

export default function AcceptInvitationPage() {
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    // Keep the secret out of query strings, server logs and referrers.
    const invitationToken = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    let active = true;
    if (!invitationToken) {
      queueMicrotask(() => { if (active) { setError("Abra o link completo recebido por e-mail para aceitar o convite."); setLoading(false); } });
      return () => { active = false; };
    }
    organizationInvitations.inspect(invitationToken).then(result => {
      if (active) { setToken(invitationToken); setPreview(result); }
    }).catch(reason => {
      if (active) setError(getOrganizationErrorMessage(reason, "Não foi possível verificar o convite. Solicite um novo link à equipe da plataforma."));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) { setError("As senhas não coincidem."); return; }
    setSaving(true);
    setError("");
    try {
      await organizationInvitations.accept(token, password, confirmation);
      setAccepted(true);
      setToken("");
      setPassword("");
      setConfirmation("");
      window.history.replaceState(null, "", window.location.pathname);
    } catch (reason) {
      setError(getOrganizationErrorMessage(reason, "Não foi possível ativar o acesso. Tente novamente."));
    } finally { setSaving(false); }
  };

  return <main className="min-vh-100 d-flex align-items-center justify-content-center p-3 bg-light">
    <section className="card shadow-sm border-0 p-4 w-100" style={{ maxWidth: 480 }}>
      <p className="text-success fw-semibold">Fazenda Mais</p>
      <h1 className="h3">{accepted ? "Seu acesso está pronto" : "Ative seu acesso"}</h1>
      {loading ? <p role="status">Verificando convite…</p> : accepted ? <><p>Sua senha foi definida. Entre para administrar sua organização.</p><Link className="btn btn-success" href="/login">Ir para o login</Link></> : <>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {preview && <form onSubmit={submit}>
          <p>Olá, {preview.full_name}. Você será o administrador responsável por <strong>{preview.organization_name}</strong>.</p>
          <p className="text-muted">{preview.email}</p>
          <p className="small text-muted">Convite válido até {new Date(preview.expires_at).toLocaleString("pt-BR")}.</p>
          <label className="form-label" htmlFor="invitation-password">Defina sua senha</label>
          <input className="form-control mb-2" id="invitation-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} disabled={saving}/>
          <p className="small text-muted">Use pelo menos 8 caracteres. Evite senhas comuns, apenas números ou semelhantes aos seus dados.</p>
          <label className="form-label" htmlFor="invitation-confirmation">Confirme a senha</label>
          <input className="form-control mb-3" id="invitation-confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={saving}/>
          <button className="btn btn-success w-100" disabled={saving}>{saving ? "Ativando…" : "Definir senha e ativar acesso"}</button>
        </form>}
        {!preview && <Link href="/login">Voltar ao login</Link>}
      </>}
    </section>
  </main>;
}
