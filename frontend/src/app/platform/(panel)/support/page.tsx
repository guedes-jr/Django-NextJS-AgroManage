"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { BookOpen, Headphones, Plus, Save, Trash2 } from "lucide-react";
import { ArticleDraft, SupportArticle, SupportConfig, supportAdminService, supportError } from "@/services/supportService";
const emptyArticle: ArticleDraft = { title: "", kind: "faq", category: "", content: "", video_url: "", is_published: false, position: 0 };
export default function SupportAdminPage() {
  const [config, setConfig] = useState<SupportConfig | null>(null);
  const [articles, setArticles] = useState<SupportArticle[]>([]);
  const [draft, setDraft] = useState<ArticleDraft>(emptyArticle);
  const [editing, setEditing] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const [settings, items] = await Promise.all([supportAdminService.config(), supportAdminService.articles()]); setConfig(settings); setArticles(items); }
    catch (failure) { setError(supportError(failure)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void load(); }); return () => { active = false; }; }, [load]);
  const saveConfiguration = async (event: FormEvent) => {
    event.preventDefault(); if (!config) return;
    setBusy(true); setError(""); setNotice("");
    try { setConfig(await supportAdminService.saveConfig(config)); setNotice("Configurações de suporte salvas para todas as organizações."); }
    catch (failure) { setError(supportError(failure)); } finally { setBusy(false); }
  };
  const saveArticle = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { const article = await supportAdminService.saveArticle(draft, editing); setArticles(items => [article, ...items.filter(item => item.id !== article.id)].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))); setDraft(emptyArticle); setEditing(undefined); setNotice(article.is_published ? "Conteúdo publicado para todas as organizações." : "Rascunho salvo. Ele ainda não aparece no suporte."); }
    catch (failure) { setError(supportError(failure)); } finally { setBusy(false); }
  };
  const remove = async (article: SupportArticle) => {
    if (!window.confirm(`Excluir “${article.title}” da base de suporte?`)) return;
    setBusy(true); setError(""); setNotice("");
    try { await supportAdminService.deleteArticle(article.id); setArticles(items => items.filter(item => item.id !== article.id)); if (editing === article.id) { setEditing(undefined); setDraft(emptyArticle); } setNotice("Conteúdo excluído."); }
    catch (failure) { setError(supportError(failure)); } finally { setBusy(false); }
  };
  return <>
    <header className="mb-4"><div className="platform-label mb-2">Atendimento e conhecimento</div><h1 className="h2 fw-bold"><Headphones size={28} /> Central de suporte</h1><p className="text-muted">Configure a IA e o contato de atendimento. Dúvidas e tutoriais publicados ficam disponíveis para todas as organizações.</p></header>
    {error && <div className="alert alert-danger" role="alert">{error}{!config && <button className="btn btn-sm btn-outline-danger ms-3" onClick={() => void load()}>Tentar novamente</button>}</div>}
    {notice && <div className="alert alert-success" role="status">{notice}</div>}
    {loading ? <p role="status">Carregando suporte…</p> : config && <div className="row g-4">
      <section className="col-lg-4"><form className="platform-card p-4 d-flex flex-column gap-3" onSubmit={saveConfiguration}><h2 className="h5 fw-bold">Atendimento</h2><label className="form-label">WhatsApp do suporte<input className="form-control mt-1" value={config.whatsapp_number} onChange={event => setConfig({ ...config, whatsapp_number: event.target.value })} placeholder="5511999999999" maxLength={25} /><small className="text-muted">Informe DDI e DDD. Deixe vazio para desativar o encaminhamento.</small></label><label className="form-check"><input className="form-check-input" type="checkbox" checked={config.ai_enabled} onChange={event => setConfig({ ...config, ai_enabled: event.target.checked })} />IA de suporte habilitada</label><label className="form-label">Perguntas por usuário/dia<input className="form-control mt-1" type="number" min={1} max={100} required value={config.daily_question_limit} onChange={event => setConfig({ ...config, daily_question_limit: Number(event.target.value) })} /></label><label className="form-label">Mensagem de boas-vindas<textarea className="form-control mt-1" rows={4} required maxLength={500} value={config.welcome_message} onChange={event => setConfig({ ...config, welcome_message: event.target.value })} /></label><button disabled={busy} className="btn btn-success"><Save size={16} /> Salvar configurações</button><p className="small text-muted mb-0">Os provedores e modelos utilizados são os configurados em Inteligência artificial.</p></form></section>
      <section className="col-lg-8"><form className="platform-card p-4 d-flex flex-column gap-3" onSubmit={saveArticle}><div className="d-flex justify-content-between"><h2 className="h5 fw-bold"><BookOpen size={20} /> {editing ? "Editar conteúdo" : "Novo conteúdo"}</h2><button className="btn btn-sm btn-outline-secondary" type="button" disabled={busy} onClick={() => { setEditing(undefined); setDraft(emptyArticle); }}><Plus size={16} /> Novo</button></div><label className="form-label">Título<input className="form-control" required maxLength={200} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label><div className="row g-3"><label className="col-md-4 form-label">Tipo<select className="form-select" value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as ArticleDraft["kind"] })}><option value="faq">Dúvida frequente</option><option value="tutorial">Tutorial</option></select></label><label className="col-md-5 form-label">Categoria<input className="form-control" maxLength={80} value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })} placeholder="Cadastros, Financeiro, Suínos…" /></label><label className="col-md-3 form-label">Ordem<input className="form-control" type="number" min={0} required value={draft.position} onChange={event => setDraft({ ...draft, position: Number(event.target.value) })} /></label></div><label className="form-label">Conteúdo e passos do procedimento<textarea className="form-control" rows={9} required maxLength={12000} value={draft.content} onChange={event => setDraft({ ...draft, content: event.target.value })} /></label><label className="form-label">Vídeo ou material complementar (HTTPS, opcional)<input className="form-control" type="url" value={draft.video_url} onChange={event => setDraft({ ...draft, video_url: event.target.value })} /></label><label className="form-check"><input className="form-check-input" type="checkbox" checked={draft.is_published} onChange={event => setDraft({ ...draft, is_published: event.target.checked })} />Publicar para todas as organizações</label><button disabled={busy} className="btn btn-success align-self-start"><Save size={16} /> {busy ? "Salvando…" : "Salvar conteúdo"}</button></form></section>
      <section className="col-12"><div className="platform-card p-4"><h2 className="h5 fw-bold mb-3">Dúvidas e tutoriais cadastrados</h2>{articles.length ? articles.map(article => <div className="d-flex flex-wrap gap-3 justify-content-between align-items-center border-top py-3" key={article.id}><div><strong>{article.title}</strong><p className="small text-muted mb-0">{article.kind === "faq" ? "Dúvida frequente" : "Tutorial"} · {article.category || "Geral"} · {article.is_published ? "Publicado" : "Rascunho"} · Ordem {article.position}</p></div><div className="d-flex gap-2"><button type="button" disabled={busy} className="btn btn-sm btn-outline-secondary" onClick={() => { setEditing(article.id); setDraft({ title: article.title, kind: article.kind, category: article.category, content: article.content, video_url: article.video_url, is_published: article.is_published, position: article.position }); setNotice(""); }}>Editar</button><button type="button" disabled={busy} className="btn btn-sm btn-outline-danger" aria-label={`Excluir ${article.title}`} onClick={() => void remove(article)}><Trash2 size={16} /></button></div></div>) : <p className="text-muted">Nenhum conteúdo cadastrado.</p>}</div></section>
    </div>}
  </>;
}
