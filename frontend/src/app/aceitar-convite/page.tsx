"use client";
import { usePublicLocale } from "@/lib/publicLocale";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { organizationInvitations, getOrganizationErrorMessage, type InvitationPreview } from "@/services/organizationInvitations";

export default function AcceptInvitationPage() {
  const { language, t } = usePublicLocale();
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
      queueMicrotask(() => { if (active) { setError(t("workspace.openTheCompleteLinkReceivedByEmailToAcceptThe")); setLoading(false); } });
      return () => { active = false; };
    }
    organizationInvitations.inspect(invitationToken).then(result => {
      if (active) { setToken(invitationToken); setPreview(result); }
    }).catch(reason => {
      if (active) setError(getOrganizationErrorMessage(reason, t("workspace.couldNotVerifyTheInvitationRequestANewLinkFrom")));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [t]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) { setError(t("workspace.passwordsDoNotMatch")); return; }
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
      setError(getOrganizationErrorMessage(reason, t("workspace.couldNotActivateAccessTryAgain")));
    } finally { setSaving(false); }
  };

  return <main className="min-vh-100 d-flex align-items-center justify-content-center p-3 bg-light">
    <section className="card shadow-sm border-0 p-4 w-100" style={{ maxWidth: 480 }}>
      <p className="text-success fw-semibold">Fazenda Mais</p>
      <h1 className="h3">{accepted ? t("workspace.yourAccessIsReady") : t("workspace.activateYourAccess")}</h1>
      {loading ? <p role="status">{t("workspace.checkingInvitation")}</p> : accepted ? <><p>{t("workspace.yourPasswordHasBeenSetSignInToManageYour")}</p><Link className="btn btn-success" href="/login">{t("workspace.goToSignIn")}</Link></> : <>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {preview && <form onSubmit={submit}>
          <p>{t("workspace.hello")} {preview.full_name}{t("workspace.youWillBeTheAdministratorResponsibleFor")} <strong>{preview.organization_name}</strong>.</p>
          <p className="text-muted">{preview.email}</p>
          <p className="small text-muted">{t("workspace.invitationValidUntil")} {new Date(preview.expires_at).toLocaleString(language)}.</p>
          <label className="form-label" htmlFor="invitation-password">{t("workspace.setYourPassword")}</label>
          <input className="form-control mb-2" id="invitation-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} disabled={saving}/>
          <p className="small text-muted">{t("workspace.useAtLeast8CharactersAvoidCommonPasswordsNumbersOnly")}</p>
          <label className="form-label" htmlFor="invitation-confirmation">{t("users.confirmPassword")}</label>
          <input className="form-control mb-3" id="invitation-confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={saving}/>
          <button className="btn btn-success w-100" disabled={saving}>{saving ? t("workspace.activating") : t("workspace.setPasswordAndActivateAccess")}</button>
        </form>}
        {!preview && <Link href="/login">{t("workspace.backToSignInLabel")}</Link>}
      </>}
    </section>
  </main>;
}
