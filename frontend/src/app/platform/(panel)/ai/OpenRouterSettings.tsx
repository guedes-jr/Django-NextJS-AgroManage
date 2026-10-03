"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { platformService } from "@/services/platformApi";
import type { PlatformAIProvider } from "@/types/platform";
import styles from "./page.module.css";

export function OpenRouterSettings({ provider, canEdit, onChange }: {
  provider: PlatformAIProvider; canEdit: boolean; onChange: (provider: PlatformAIProvider) => void;
}) {
  const [preferFree, setPreferFree] = useState(provider.prefer_free_models);
  const [allowPaid, setAllowPaid] = useState(provider.allow_paid_models);
  const [attempts, setAttempts] = useState(String(provider.max_model_attempts));
  const [tokens, setTokens] = useState(String(provider.max_output_tokens));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || saving) return;
    setSaving(true); setNotice("");
    try {
      onChange(await platformService.updateAIProvider(provider.id, {
        prefer_free_models: preferFree, allow_paid_models: allowPaid,
        max_model_attempts: Number(attempts), max_output_tokens: Number(tokens),
      }));
      setNotice("Configuração do OpenRouter salva.");
    } catch { setNotice("Não foi possível salvar. Confira os limites e tente novamente."); }
    finally { setSaving(false); }
  }
  return <form className={styles.openRouterSettings} onSubmit={save}>
    <h4>Escolha de modelos e consumo</h4>
    <fieldset disabled={!canEdit || saving}>
      <label><input type="checkbox" checked={preferFree} onChange={event => setPreferFree(event.target.checked)} />Priorizar modelos gratuitos</label>
      <small>Os modelos gratuitos serão tentados primeiro, seguindo a prioridade cadastrada.</small>
      <label><input type="checkbox" checked={allowPaid} onChange={event => setAllowPaid(event.target.checked)} />Permitir modelos pagos</label>
      <small>Desativado: as chamadas ficam limitadas a modelos gratuitos. Ative para autorizar cobranças pelo OpenRouter.</small>
      <div className={styles.openRouterLimits}>
        <label>Máximo de tentativas por pergunta<input type="number" min="1" max="10" required value={attempts} onChange={event => setAttempts(event.target.value)} /></label>
        <label>Limite de tokens de saída<input type="number" min="128" max="8192" required value={tokens} onChange={event => setTokens(event.target.value)} /></label>
      </div>
      {canEdit && <button type="submit" className={styles.syncButton}>{saving ? <LoaderCircle className={styles.spin} size={15} /> : <Save size={15} />}Salvar configuração</button>}
    </fieldset>
    {notice && <p role="status">{notice}</p>}
  </form>;
}
