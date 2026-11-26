"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { getOrganizationErrorMessage } from "@/services/organizationInvitations";
import { platformService } from "@/services/platformApi";

type Preview = Awaited<ReturnType<typeof platformService.organizationDeletion>>;

/** Permanent deletion: owner only, archived organization, typed slug and reason. */
export function OrganizationDeleteForm({ organizationId, name, onCancel }: { organizationId: string; name: string; onCancel: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    platformService.organizationDeletion(organizationId)
      .then(result => { if (active) setPreview(result); })
      .catch(cause => { if (active) setError(getOrganizationErrorMessage(cause, "Não foi possível verificar a exclusão.")); });
    return () => { active = false; };
  }, [organizationId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!preview || confirmation.trim() !== preview.confirmation) return;
    setBusy(true);
    try {
      await platformService.deleteOrganization(organizationId, { confirmation: confirmation.trim(), reason: reason.trim() });
      showToast(`${name} foi excluída definitivamente.`, "success");
      router.replace("/platform/organizations");
    } catch (cause) {
      setError(getOrganizationErrorMessage(cause, "Não foi possível excluir a organização."));
      setBusy(false);
    }
  };

  return <form className="platform-card platform-form-card platform-danger-zone mb-3" onSubmit={submit} aria-label="Excluir organização definitivamente">
    <h2><Trash2 size={18} aria-hidden="true"/> Excluir {name} definitivamente</h2>
    <p>Apaga a organização, todas as fazendas, registros, arquivos de exportação e as contas dos usuários dela. <strong>Não pode ser desfeito.</strong> Exporte os dados antes, se precisar guardá-los. A auditoria da plataforma mantém o registro da exclusão.</p>
    {error && <div className="alert alert-danger py-2 small" role="alert">{error}</div>}
    {!preview && !error && <p role="status">Verificando…</p>}
    {preview && <>
      <dl className="platform-kv mb-3">
        <div><dt>Usuários</dt><dd className="tabular-nums">{preview.counts.users}</dd></div>
        <div><dt>Fazendas</dt><dd className="tabular-nums">{preview.counts.farms}</dd></div>
        <div><dt>Faturas sem pagamento</dt><dd className="tabular-nums">{preview.counts.invoices}</dd></div>
      </dl>
      {preview.blockers.length > 0 ? <div className="alert alert-warning small mb-0" role="status"><strong>Ainda não é possível excluir:</strong><ul className="mb-0 mt-1">{preview.blockers.map(item => <li key={item}>{item}</li>)}</ul></div> : <div className="row g-3">
        <div className="col-md-6"><label className="form-label" htmlFor="delete-confirmation">Digite <code>{preview.confirmation}</code> para confirmar</label><input id="delete-confirmation" className="form-control" autoComplete="off" value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)}/></div>
        <div className="col-md-6"><label className="form-label" htmlFor="delete-reason">Motivo (fica na auditoria)</label><input id="delete-reason" className="form-control" maxLength={1000} required value={reason} disabled={busy} onChange={event => setReason(event.target.value)}/></div>
      </div>}
    </>}
    <div className="platform-form-footer">
      <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={busy}>Cancelar</button>
      <button className="btn btn-danger" disabled={busy || !preview?.can_delete || confirmation.trim() !== preview?.confirmation || !reason.trim()}>{busy ? "Excluindo…" : "Excluir definitivamente"}</button>
    </div>
  </form>;
}
