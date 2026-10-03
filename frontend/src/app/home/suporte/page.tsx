"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Headphones, MessageCircle, Send, CheckCircle, Plus, Search } from "lucide-react";
import { supportError, supportService, SupportArticle, SupportConfig, SupportConversation, SupportHandoff } from "@/services/supportService";
import styles from "./page.module.css";

export default function SupportPage() {
  const [tab, setTab] = useState<"chat" | "knowledge">("chat");
  const [config, setConfig] = useState<SupportConfig | null>(null);
  const [articles, setArticles] = useState<SupportArticle[]>([]);
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [question, setQuestion] = useState("");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [handoff, setHandoff] = useState<SupportHandoff | null>(null);
  const [summary, setSummary] = useState("");
  const [copied, setCopied] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    const results = await Promise.allSettled([supportService.config(signal), supportService.articles(signal), supportService.conversations(signal)]);
    if (signal?.aborted) return;
    const [configuration, knowledge, history] = results;
    if (configuration.status === "fulfilled") setConfig(configuration.value);
    if (knowledge.status === "fulfilled") setArticles(knowledge.value);
    if (history.status === "fulfilled") { setConversations(history.value); setConversation(history.value.find(item => item.is_active) || null); }
    const failed = results.find(result => result.status === "rejected");
    if (failed?.status === "rejected") setError(supportError(failed.reason));
    setLoading(false);
  }, []);
  useEffect(() => { const controller = new AbortController(); queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); }); return () => controller.abort(); }, [load]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [conversation?.messages.length, busy]);
  const updateConversation = (next: SupportConversation) => { setConversation(next); setConversations(items => [next, ...items.filter(item => item.id !== next.id)]); };
  const getConversation = async () => { if (conversation?.is_active) return conversation; const next = await supportService.create(); updateConversation(next); return next; };
  const send = async (event: FormEvent) => {
    event.preventDefault(); if (busy || question.trim().length < 3) return;
    setBusy(true); setError("");
    let current: SupportConversation | null = null;
    try { current = await getConversation(); await supportService.ask(current.id, question.trim()); updateConversation(await supportService.conversation(current.id)); setQuestion(""); }
    catch (failure) { setError(supportError(failure)); if (current) { try { updateConversation(await supportService.conversation(current.id)); } catch { /* Preserve the visible conversation on a network failure. */ } } }
    finally { setBusy(false); }
  };
  const newConversation = async () => { setBusy(true); setError(""); try { updateConversation(await supportService.create()); setHandoff(null); setQuestion(""); } catch (failure) { setError(supportError(failure)); } finally { setBusy(false); } };
  const resolve = async () => { if (!conversation) return; setBusy(true); setError(""); try { updateConversation(await supportService.resolve(conversation.id)); } catch (failure) { setError(supportError(failure)); } finally { setBusy(false); } };
  const prepareHandoff = async () => { setBusy(true); setError(""); try { const current = conversation || await getConversation(); const next = await supportService.handoff(current.id); setHandoff(next); setSummary(next.summary); setCopied(false); } catch (failure) { setError(supportError(failure)); } finally { setBusy(false); } };
  const prepareLink = async () => { if (!conversation) return; setBusy(true); setError(""); try { const next = await supportService.handoff(conversation.id, summary); setSummary(next.summary); setHandoff(next); } catch (failure) { setError(supportError(failure)); } finally { setBusy(false); } };
  const filtered = articles.filter(item => (!kind || item.kind === kind) && `${item.title} ${item.category} ${item.content}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  return <main className={styles.page}>
    <header className={styles.header}><div className={styles.heading}><Headphones size={30} /><div><h1>Central de suporte</h1><p>Ajuda para cadastrar, lançar e acompanhar sua granja no Fazenda Mais.</p></div></div></header>
    <nav className={styles.tabs} aria-label="Seções de suporte"><button onClick={() => setTab("chat")} aria-current={tab === "chat" ? "page" : undefined}><MessageCircle size={18} />Atendimento</button><button onClick={() => setTab("knowledge")} aria-current={tab === "knowledge" ? "page" : undefined}><BookOpen size={18} />Dúvidas e tutoriais</button></nav>
    {error && <div role="alert" className={styles.error}>{error}<button disabled={busy} onClick={() => void load()}>Recarregar suporte</button></div>}
    {loading ? <p role="status">Carregando suporte…</p> : tab === "knowledge" ? <section className={styles.panel}>
      <div className={styles.filters}><label><Search size={18} /><input aria-label="Buscar dúvidas e tutoriais" placeholder="Busque por cadastro, lançamento, relatório…" value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label="Tipo de conteúdo" value={kind} onChange={event => setKind(event.target.value)}><option value="">Todos os conteúdos</option><option value="faq">Dúvidas frequentes</option><option value="tutorial">Tutoriais</option></select></div>
      {filtered.length ? filtered.map(article => <details key={article.id} className={styles.article}><summary><span>{article.kind === "faq" ? "Dúvida frequente" : "Tutorial"}{article.category ? ` · ${article.category}` : ""}</span><strong>{article.title}</strong></summary><p>{article.content}</p>{article.video_url && <a href={article.video_url} target="_blank" rel="noopener noreferrer">Abrir vídeo ou material do tutorial</a>}</details>) : <p>Nenhum conteúdo encontrado.</p>}
    </section> : <div className={styles.layout}>
      <section className={styles.panel}><div className={styles.chatHeader}><div><h2>Ajuda com o sistema</h2><p>Descreva a tela, o que tentou fazer e o que aconteceu.</p></div><button disabled={busy} onClick={newConversation}><Plus size={16} />Nova conversa</button></div>
        {!!conversations.length && <label className={styles.history}>Conversa<select value={conversation?.id || ""} disabled={busy} onChange={event => { const selected = conversations.find(item => item.id === event.target.value); if (selected) { setConversation(selected); setHandoff(null); } }}><option value="" disabled>Escolha uma conversa</option>{conversations.map((item, index) => <option key={item.id} value={item.id}>Conversa {conversations.length - index}{item.is_active ? "" : " · Resolvida"}</option>)}</select></label>}
        <div className={styles.messages} aria-live="polite"><div className={styles.message}><strong>Suporte Fazenda Mais</strong><p>{config?.welcome_message || "Como podemos ajudar com o uso do sistema?"}</p></div>{conversation?.messages.filter(message => message.status !== "blocked").map(message => <div key={message.id} className={`${styles.message} ${message.role === "user" ? styles.userMessage : ""}`}><strong>{message.role === "user" ? "Você" : "Suporte IA"}</strong><p>{message.content}</p>{message.status === "failed" && <small>A IA não conseguiu concluir esta resposta.</small>}</div>)}{busy && <p role="status">Aguarde…</p>}<div ref={bottom} /></div>
        {conversation && !conversation.is_active ? <p className={styles.notice}>Conversa resolvida. Inicie uma nova conversa se precisar de ajuda.</p> : <form onSubmit={send} className={styles.composer}><label htmlFor="support-question">Sua dúvida</label><textarea id="support-question" value={question} maxLength={4000} minLength={3} required rows={3} onChange={event => setQuestion(event.target.value)} placeholder="Ex.: cadastrei uma matriz e não encontrei a compra na dashboard…" /><div><small>Não envie senhas ou códigos de acesso.</small><button disabled={busy || !config?.ai_enabled || question.trim().length < 3} type="submit"><Send size={16} />Enviar</button></div></form>}
        {!config?.ai_enabled && <p className={styles.notice}>A IA está indisponível. Consulte os tutoriais ou fale com um atendente.</p>}
        {conversation?.is_active && !!conversation.messages.length && <button className={styles.secondary} disabled={busy} onClick={resolve}><CheckCircle size={17} />Minha dúvida foi resolvida</button>}
      </section>
      <aside className={styles.panel}><h2>Precisa de um atendente?</h2><p>Se a IA não resolver, prepare um resumo para continuar no WhatsApp.</p><button disabled={busy} onClick={prepareHandoff}><MessageCircle size={17} />Falar com atendente</button>
        {handoff && <div className={styles.handoff}><label htmlFor="support-summary">Revise o resumo do problema</label><textarea id="support-summary" value={summary} maxLength={4000} rows={12} onChange={event => { setSummary(event.target.value); setHandoff(current => current ? { ...current, whatsapp_url: null } : current); }} /><p>Confira o texto antes de compartilhar. O envio será concluído por você no WhatsApp.</p>{config?.whatsapp_number ? handoff.whatsapp_url ? <a className={styles.whatsapp} href={handoff.whatsapp_url} target="_blank" rel="noopener noreferrer">Abrir mensagem no WhatsApp</a> : <button disabled={busy || summary.trim().length < 3} onClick={prepareLink}>Preparar mensagem revisada</button> : <p>O número de atendimento ainda não foi configurado pela administração.</p>}<button className={styles.secondary} disabled={busy} onClick={async () => { try { await navigator.clipboard.writeText(summary); setCopied(true); } catch { setError("Não foi possível copiar. Selecione o resumo para copiá-lo."); } }}>{copied ? "Resumo copiado" : "Copiar resumo"}</button></div>}
        <button className={styles.secondary} onClick={() => setTab("knowledge")}><BookOpen size={17} />Consultar dúvidas e tutoriais</button>
      </aside>
    </div>}
  </main>;
}
