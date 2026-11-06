"use client";
import { useOrganizationLocale } from "@/lib/locale";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Headphones, MessageCircle, Send, CheckCircle, Plus, Search, Copy, Download, MessageSquareMore } from "lucide-react";
import { supportError, supportService, SupportArticle, SupportConfig, SupportConversation, SupportHandoff } from "@/services/supportService";
import { SupportTicketList } from "@/components/support/SupportTicketList";
import { MarkdownMessage } from "@/components/ui/MarkdownMessage";
import styles from "./page.module.css";

export default function SupportPage() {
  const { language, t } = useOrganizationLocale();
  const [tab, setTab] = useState<"chat" | "knowledge" | "attendant">("chat");
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
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
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
    if (failed?.status === "rejected") setError(supportError(failed.reason, language));
    setLoading(false);
  }, [language]);
  useEffect(() => { const controller = new AbortController(); queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); }); return () => controller.abort(); }, [load]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [conversation?.messages.length, busy]);
  const updateConversation = (next: SupportConversation) => { setConversation(next); setConversations(items => [next, ...items.filter(item => item.id !== next.id)]); };
  const getConversation = async () => { if (conversation?.is_active) return conversation; const next = await supportService.create(); updateConversation(next); return next; };
  const send = async (event: FormEvent) => {
    event.preventDefault(); if (busy || question.trim().length < 3) return;
    setBusy(true); setError("");
    let current: SupportConversation | null = null;
    try { current = await getConversation(); await supportService.ask(current.id, question.trim()); updateConversation(await supportService.conversation(current.id)); setQuestion(""); }
    catch (failure) { setError(supportError(failure, language)); if (current) { try { updateConversation(await supportService.conversation(current.id)); } catch { /* Preserve the visible conversation on a network failure. */ } } }
    finally { setBusy(false); }
  };
  const newConversation = async () => { setBusy(true); setError(""); try { updateConversation(await supportService.create()); setHandoff(null); setQuestion(""); } catch (failure) { setError(supportError(failure, language)); } finally { setBusy(false); } };
  const resolve = async () => { if (!conversation) return; setBusy(true); setError(""); try { updateConversation(await supportService.resolve(conversation.id)); } catch (failure) { setError(supportError(failure, language)); } finally { setBusy(false); } };
  const prepareHandoff = async () => { setBusy(true); setError(""); try { const current = conversation || await getConversation(); const next = await supportService.handoff(current.id); setHandoff(next); setSummary(next.summary); setCopied(false); } catch (failure) { setError(supportError(failure, language)); } finally { setBusy(false); } };
  const prepareLink = async () => { if (!conversation) return; setBusy(true); setError(""); try { const next = await supportService.handoff(conversation.id, summary); setSummary(next.summary); setHandoff(next); } catch (failure) { setError(supportError(failure, language)); } finally { setBusy(false); } };
  const copyMessage = async (id: string, content: string) => { try { await navigator.clipboard.writeText(content); setCopiedMessage(id); window.setTimeout(() => setCopiedMessage(null), 1600); } catch { setError(t("workspace.couldNotCopyTheMessage")); } };
  const exportConversation = () => {
    if (!conversation?.messages.length) return;
    const content = ["Conversa com o Suporte Fazenda Mais", `Exportada em: ${new Date().toLocaleString("pt-BR")}`, "", ...conversation.messages.filter(message => message.status !== "blocked").map(message => `${message.role === "user" ? "Você" : "Suporte IA"}:\n${message.content}`)].join("\n\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "conversa-suporte.txt"; link.click(); URL.revokeObjectURL(url);
  };
  const filtered = articles.filter(item => (!kind || item.kind === kind) && `${item.title} ${item.category} ${item.content}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  return <main className={styles.page}>
    <header className={styles.header}><div className={styles.heading}><Headphones size={30} /><div><h1>{t("workspace.supportCenter")}</h1><p>{t("workspace.helpRegisteringRecordingAndMonitoringYourFarmInFazendaMais")}</p></div></div></header>
    <nav className={styles.tabs} aria-label={t("workspace.supportSections")}><button onClick={() => setTab("chat")} aria-current={tab === "chat" ? "page" : undefined}><MessageCircle size={18} />{t("workspace.assistance")}</button><button onClick={() => setTab("knowledge")} aria-current={tab === "knowledge" ? "page" : undefined}><BookOpen size={18} />{t("workspace.questionsAndTutorials")}</button><button onClick={() => setTab("attendant")} aria-current={tab === "attendant" ? "page" : undefined}><MessageSquareMore size={18} />{t("workspace.needAnAttendant")}</button></nav>
    {error && <div role="alert" className={styles.error}>{error}<button disabled={busy} onClick={() => void load()}>{t("workspace.reloadSupport")}</button></div>}
    {loading ? <p role="status">{t("workspace.loadingSupport")}</p> : tab === "knowledge" ? <section className={styles.panel}>
      <div className={styles.filters}><label><Search size={18} /><input aria-label={t("workspace.searchQuestionsAndTutorials")} placeholder={t("workspace.searchForRegistrationEntryReport")} value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label={t("workspace.contentType")} value={kind} onChange={event => setKind(event.target.value)}><option value="">{t("workspace.allContent")}</option><option value="faq">{t("workspace.frequentlyAskedQuestions")}</option><option value="tutorial">{t("workspace.tutorials")}</option></select></div>
      {filtered.length ? filtered.map(article => <details key={article.id} className={styles.article}><summary><span>{article.kind === "faq" ? t("workspace.frequentlyAskedQuestion") : t("workspace.tutorial")}{article.category ? ` · ${article.category}` : ""}</span><strong>{article.title}</strong></summary><p>{article.content}</p>{article.video_url && <a href={article.video_url} target="_blank" rel="noopener noreferrer">{t("workspace.openTutorialVideoOrMaterial")}</a>}</details>) : <p>{t("workspace.noContentFound")}</p>}
    </section> : tab === "attendant" ? <section className={styles.panel}>
      <SupportTicketList conversationId={conversation?.id}/>
      <hr/>
      <h2>{t("workspace.continueOnWhatsapp")}</h2>
      <p>{t("workspace.ifAiCannotResolveItPrepareASummaryToContinue")}</p>
      <button disabled={busy} onClick={prepareHandoff}><MessageCircle size={17} />{t("workspace.talkToAnAttendant")}</button>
      {handoff && <div className={styles.handoff}><label htmlFor="support-summary">{t("workspace.reviewTheProblemSummary")}</label><textarea id="support-summary" value={summary} maxLength={4000} rows={12} onChange={event => { setSummary(event.target.value); setHandoff(current => current ? { ...current, whatsapp_url: null } : current); }} /><p>{t("workspace.reviewTheTextBeforeSharingYouWillCompleteSendingIt")}</p>{config?.whatsapp_number ? handoff.whatsapp_url ? <a className={styles.whatsapp} href={handoff.whatsapp_url} target="_blank" rel="noopener noreferrer">{t("workspace.openMessageInWhatsapp")}</a> : <button disabled={busy || summary.trim().length < 3} onClick={prepareLink}>{t("workspace.prepareReviewedMessage")}</button> : <p>{t("workspace.theAdministrationHasNotConfiguredTheSupportNumberYet")}</p>}<button className={styles.secondary} disabled={busy} onClick={async () => { try { await navigator.clipboard.writeText(summary); setCopied(true); } catch { setError(t("workspace.couldNotCopySelectTheSummaryToCopyIt")); } }}>{copied ? t("workspace.summaryCopied") : t("workspace.copySummary")}</button></div>}
      <button className={styles.secondary} onClick={() => setTab("knowledge")}><BookOpen size={17} />{t("workspace.viewQuestionsAndTutorials")}</button>
    </section> : <div className={styles.layout} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
      <section className={styles.panel}><div className={styles.chatHeader}><div><h2>{t("workspace.helpWithTheSystem")}</h2><p>{t("workspace.describeTheScreenWhatYouTriedAndWhatHappened")}</p></div><div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}><button type="button" disabled={busy || !conversation?.messages.length} onClick={exportConversation}><Download size={16} />{t("workspace.exportConversation")}</button><button disabled={busy} onClick={newConversation}><Plus size={16} />{t("workspace.newConversation")}</button></div></div>
        {!!conversations.length && <label className={styles.history}>{t("workspace.conversation")}<select value={conversation?.id || ""} disabled={busy} onChange={event => { const selected = conversations.find(item => item.id === event.target.value); if (selected) { setConversation(selected); setHandoff(null); } }}><option value="" disabled>{t("workspace.chooseAConversation")}</option>{conversations.map((item, index) => <option key={item.id} value={item.id}>{t("workspace.conversation")} {conversations.length - index}{item.is_active ? "" : t("workspace.resolved")}</option>)}</select></label>}
        <div className={styles.messages} style={{ height: "clamp(28rem, 62vh, 45rem)" }} aria-live="polite"><div className={styles.message}><strong>{t("workspace.fazendaMaisSupport")}</strong><p>{config?.welcome_message || t("workspace.howCanWeHelpYouUseTheSystem")}</p></div>{conversation?.messages.filter(message => message.status !== "blocked").map(message => <div key={message.id} className={`${styles.message} ${message.role === "user" ? styles.userMessage : ""}`} style={{ position: "relative" }}><button type="button" title={t("workspace.copyMessage")} aria-label={t("workspace.copyMessage")} onClick={() => void copyMessage(message.id, message.content)} style={{ position: "absolute", top: "0.5rem", right: "0.5rem", display: "inline-flex", alignItems: "center", gap: "0.25rem", padding: "0.25rem 0.4rem", border: 0, borderRadius: "0.35rem", color: "var(--muted-foreground)", background: "transparent" }}><Copy size={14} />{copiedMessage === message.id ? t("workspace.copied") : ""}</button><strong>{message.role === "user" ? t("workspace.you") : t("workspace.aiSupport")}</strong>{message.role === "assistant" ? <MarkdownMessage className={styles.markdown} text={message.content} /> : <p>{message.content}</p>}{message.status === "failed" && <small>{t("workspace.aiCouldNotCompleteThisResponse")}</small>}</div>)}{busy && <p role="status">{t("workspace.pleaseWait")}</p>}<div ref={bottom} /></div>
        {conversation && !conversation.is_active ? <p className={styles.notice}>{t("workspace.conversationResolvedStartANewConversationIfYouNeedHelp")}</p> : <form onSubmit={send} className={styles.composer}><label htmlFor="support-question">{t("workspace.yourQuestion")}</label><textarea id="support-question" value={question} maxLength={4000} minLength={3} required rows={3} onChange={event => setQuestion(event.target.value)} placeholder={t("workspace.eGIRegisteredABreedingFemaleAndCannotFind")} /><div><small>{t("workspace.doNotSendPasswordsOrAccessCodes")}</small><button disabled={busy || !config?.ai_enabled || question.trim().length < 3} type="submit"><Send size={16} />{t("workspace.send")}</button></div></form>}
        {!config?.ai_enabled && <p className={styles.notice}>{t("workspace.aiIsUnavailableCheckTheTutorialsOrTalkToAn")}</p>}
        {conversation?.is_active && !!conversation.messages.length && <button className={styles.secondary} disabled={busy} onClick={resolve}><CheckCircle size={17} />{t("workspace.myQuestionWasResolved")}</button>}
      </section>
    </div>}
  </main>;
}
