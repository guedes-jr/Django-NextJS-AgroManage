"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Megaphone, Save, Send, Plus, ImagePlus } from 'lucide-react';
import { platformMarketingService as api, type Audience, type AudienceFilters, type Campaign, type CampaignInput, type MarketingImage, type AudiencePreview } from '@/services/platformMarketingService';
import { memberError } from '@/services/memberService';
import MarketingContent from '@/components/notifications/MarketingContent';
import './marketing.css';
const blank: CampaignInput = {category: 'system', title: '', body: '', link_url: '', link_label: '', images: [], audience: '', send_in_app: true, send_whatsapp: false};
const labels: Record<string, string> = {draft: 'Rascunho', queued: 'Na fila', processing: 'Preparando destinatários', completed: 'Destinatários preparados', cancelled: 'Cancelada', pending: 'Pendente', sent: 'Enviada', unknown: 'Resultado incerto', failed: 'Falhou', skipped: 'Suspensa'};
export default function MarketingPage() {
  const [audiences, setAudiences] = useState<Audience[]>([]), [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [options, setOptions] = useState<Awaited<ReturnType<typeof api.options>> | null>(null);
  const [audienceId, setAudienceId] = useState(''), [audienceName, setAudienceName] = useState('');
  const [filters, setFilters] = useState<AudienceFilters>({roles: ['admin', 'manager', 'operator']});
  const [draft, setDraft] = useState<CampaignInput>(blank), [draftId, setDraftId] = useState(''), [images, setImages] = useState<MarketingImage[]>([]);
  const [preview, setPreview] = useState<AudiencePreview | null>(null), [queryPreview, setQueryPreview] = useState<Awaited<ReturnType<typeof api.queryOrganizations>> | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [page, setPage] = useState(1), [hasNext, setHasNext] = useState(false);
  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false), [dirty, setDirty] = useState(false);
  const [searchInput, setSearchInput] = useState(''), [campaignSearch, setCampaignSearch] = useState(''), [campaignStatus, setCampaignStatus] = useState('');
  const [pendingAction, setPendingAction] = useState<{kind: 'new' | 'edit' | 'cancel'; campaign?: Campaign} | null>(null);
  const [selectionOnly, setSelectionOnly] = useState(false), [ordering, setOrdering] = useState('name');
  const selectOrganizations = (ids: string[], checked: boolean) => {
    setDirty(true);
    setSelectionOnly(true);
    setFilters(current => ({...current, organizations: checked ? [...new Set([...(current.organizations || []), ...ids])] : (current.organizations || []).filter(id => !ids.includes(id))}));
    setPreview(null);
  };
  const queryOrganizations = (requestedPage = 1, requestedOrdering = ordering, requestedFilters = filters) => run(async () => {
    setQueryPreview(await api.queryOrganizations(requestedFilters, requestedPage, requestedOrdering));
    setOrdering(requestedOrdering);
  });
  const hasContent = !!draft.title.trim() || !!draft.body.trim() || !!draft.link_url.trim() || draft.images.length > 0;
  const messageReady = hasContent && (!draft.link_url || /^https?:\/\/[^\s]+$/.test(draft.link_url));
  const goTo = (next: number) => {setStep(next); setError(''); setNotice(''); window.scrollTo({top: 0, behavior: 'smooth'});};
  const textarea = useRef<HTMLTextAreaElement>(null);
  const load = async (requestedPage = page) => {
    const rows = await api.campaigns(requestedPage, campaignSearch, campaignStatus);
    setCampaigns(rows.results);
    setHasNext(!!rows.next);
  };
  useEffect(() => {
    let active = true;
    Promise.allSettled([api.audiences(), api.options()]).then(([audienceResult, optionsResult]) => {
      if (!active) return;
      if (audienceResult.status === 'fulfilled') setAudiences(audienceResult.value);
      if (optionsResult.status === 'fulfilled') setOptions(optionsResult.value);
      if (audienceResult.status === 'rejected' || optionsResult.status === 'rejected') setError('Não foi possível carregar todos os dados. Tente carregar novamente; sua mensagem será mantida.');
    });
    return () => {active = false;};
  }, []);
  useEffect(() => {
    let active = true;
    api.campaigns(page, campaignSearch, campaignStatus).then(rows => {
      if (active) {setCampaigns(rows.results); setHasNext(!!rows.next);}
    }).catch(() => {if (active) setError('Não foi possível carregar todos os dados das campanhas. Tente novamente.');}).finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, [page, campaignSearch, campaignStatus]);
  useEffect(() => {
    if (!dirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {event.preventDefault(); event.returnValue = '';};
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [dirty]);
  const run = async (work: () => Promise<void>) => {setBusy(true); setError(''); setNotice(''); try {await work();} catch (e) {window.scrollTo({top: 0, behavior: 'smooth'}); setError(e && typeof e === 'object' && 'code' in e && (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') ? 'O servidor demorou para responder. Seus dados continuam nesta tela. Antes de salvar novamente, confira as consultas e campanhas para verificar se o cadastro foi concluído.' : e instanceof Error && !('response' in e) ? e.message : memberError(e, 'Não foi possível concluir a operação.')); } finally {setBusy(false);} };
  const edit = (change: Partial<CampaignInput>) => {setDirty(true); setDraft(current => ({...current, ...change})); setPreview(null);};
  const toggle = (field: 'roles' | 'plans' | 'statuses', value: string) => {setDirty(true); setPreview(null); setQueryPreview(null); setFilters(current => ({...current, [field]: (current[field] || []).includes(value) ? (current[field] || []).filter(v => v !== value) : [...(current[field] || []), value]}));};
  const format = (before: string, after = before) => {const node = textarea.current; if (!node) return; const start = node.selectionStart, end = node.selectionEnd; const text = draft.body.slice(start, end) || 'texto'; edit({body: draft.body.slice(0,start) + before + text + after + draft.body.slice(end)}); requestAnimationFrame(() => {node.focus(); node.setSelectionRange(start + before.length, start + before.length + text.length);});};
  const saveAudience = async () => {
    if (!filters.roles.length) throw new Error('Selecione ao menos um cargo que receberá a comunicação.');
    if (selectionOnly && !filters.organizations?.length) throw new Error('Selecione ao menos uma organização na tabela ou escolha todas as organizações dos filtros.');
    const name = audienceName.trim() || draft.title.trim().slice(0, 150) || 'Público da comunicação';
    const audienceFilters: AudienceFilters = selectionOnly ? {roles: filters.roles, organizations: filters.organizations} : {...filters, organizations: []};
    const row = await api.saveAudience({name, filters: audienceFilters}, audienceId || undefined);
    setAudienceId(row.id);
    setAudienceName(row.name);
    setFilters(row.filters);
    setAudiences(current => [row, ...current.filter(item => item.id !== row.id)]);
    edit({audience: row.id});
    return row;
  };
  const save = async (input = draft) => {const row = await api.saveCampaign(input, draftId || undefined); setDraftId(row.id); setDirty(false); setPreview(null); setCampaigns(current => [row, ...current.filter(item => item.id !== row.id)]); return row;};
  const startCampaign = () => {
    setDraft({...blank}); setDraftId(''); setImages([]); setPreview(null);
    setAudienceId(''); setAudienceName(''); setSelectionOnly(false); setQueryPreview(null);
    setFilters({roles: ['admin', 'manager', 'operator']}); setDirty(false); setCreating(true); goTo(1);
  };
  const review = async (input = draft) => {
    const row = await save(input);
    setPreview(await api.preview(row.id));
  };
  const changeChannels = (change: Partial<CampaignInput>) => {
    const next = {...draft, ...change};
    edit(change);
    if (next.send_in_app || next.send_whatsapp) void run(() => review(next));
  };
  const publishCampaign = () => run(async () => {
    if (!preview || !draftId || !preview.recipients || preview.blockers?.length) throw new Error('Resolva as pendências e atualize a revisão antes de enviar.');
    try {
      const published = await api.publish(draftId, preview.token);
      setCampaigns(current => [published, ...current.filter(item => item.id !== published.id)]);
      setCreating(false); setDirty(false); setPreview(null); setDraft({...blank}); setDraftId(''); setImages([]);
      window.scrollTo({top: 0, behavior: 'smooth'});
      setNotice('Campanha confirmada e adicionada à fila. Acompanhe as entregas na lista de campanhas.');
    } catch (failure) {
      setPreview(null);
      throw failure;
    }
  });
  const navigateStep = (next: number) => {
    if (next === 1) {goTo(1); return;}
    if (!messageReady) {setError('Preencha ao menos um título, texto, link ou foto. Confira também se o link é válido.'); return;}
    if (next === 2) {goTo(2); if (!queryPreview) void queryOrganizations(); return;}
    void run(async () => {const audience = await saveAudience(); goTo(3); await review({...draft, audience: audience.id});});
  };
  const saveAndExit = () => run(async () => {
    if (!messageReady) throw new Error('Preencha ao menos um título, texto, link ou foto antes de salvar.');
    const audience = await saveAudience();
    await save({...draft, audience: audience.id});
    setCreating(false);
    window.scrollTo({top: 0, behavior: 'smooth'});
    setNotice('Rascunho salvo. Você pode continuar pela lista de campanhas.');
  });
  const openCampaign = (campaign: Campaign) => run(async () => {
    const audience = audiences.find(item => item.id === campaign.audience) || await api.audience(campaign.audience);
    setDraftId(campaign.id);
    setDraft({category: campaign.category || 'marketing', title: campaign.title, body: campaign.body, link_url: campaign.link_url, link_label: campaign.link_label, images: campaign.images, audience: campaign.audience, send_in_app: campaign.send_in_app, send_whatsapp: campaign.send_whatsapp});
    setImages(campaign.image_details);
    setAudienceId(audience.id); setAudienceName(audience.name); setFilters(audience.filters);
    setAudiences(current => [audience, ...current.filter(item => item.id !== audience.id)]);
    setSelectionOnly(!!audience.filters.organizations?.length); setQueryPreview(null); setPreview(null);
    setDirty(false); setCreating(true); goTo(1);
  });
  const requestNewCampaign = () => {
    if (dirty && hasContent) setPendingAction({kind: 'new'});
    else startCampaign();
  };
  const clearOrganizationFilters = () => {
    const next = {roles: filters.roles, organizations: filters.organizations};
    setFilters(next); setDirty(true); setPreview(null); void queryOrganizations(1, ordering, next);
  };
  const confirmPendingAction = () => {
    const action = pendingAction;
    setPendingAction(null);
    if (action?.kind === 'new') startCampaign();
    if (action?.kind === 'edit' && action.campaign) void openCampaign(action.campaign);
    if (action?.kind === 'cancel' && action.campaign) {
      const campaign = action.campaign;
      void run(async () => {
        const cancelled = await api.cancel(campaign.id);
        setCampaigns(current => current.map(item => item.id === cancelled.id ? cancelled : item));
        if (cancelled.id === draftId) {setDraft({...blank}); setDraftId(''); setImages([]); setPreview(null); setDirty(false);}
        setNotice('Campanha cancelada. Entregas já realizadas permanecem no histórico.');
      });
    }
  };
  return <div className="campaign-page"><div inert={!!pendingAction}><header className="campaign-hero mb-4"><span className="platform-kicker">Comunicação com as organizações</span><h1 className="platform-title"><Megaphone className="me-2"/>Comunicações</h1><p className="mb-0">Prepare a mensagem, escolha as organizações e revise as pendências antes de enviar.</p><Link href="/platform/notifications" target="_blank" rel="noopener noreferrer" className="btn btn-light btn-sm mt-3">Canais e indicadores (nova aba)</Link></header>
    {loading && <p role="status">Carregando consultas, opções e campanhas…</p>}
    {error && <div className="alert alert-danger" role="alert">{error}<button className="btn btn-link" disabled={busy || loading} onClick={() => void run(async () => {const [saved, choices] = await Promise.all([api.audiences(), api.options()]); setAudiences(saved); setOptions(choices); await load();})}>Carregar dados novamente</button></div>}{notice && <div className="alert alert-success" role="status">{notice}</div>}
    {creating ? <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><h2 className="h5 mb-0">{draftId ? 'Gerenciar rascunho' : 'Criar comunicação'}</h2><button className="btn btn-outline-secondary" disabled={busy} onClick={() => {setCreating(false); setError(''); window.scrollTo({top: 0, behavior: 'smooth'});}}>Voltar às campanhas</button><button className="btn btn-outline-success" disabled={busy || !messageReady} onClick={() => void saveAndExit()}><Save size={16} className="me-2"/>Salvar e sair</button><small className="text-muted">{dirty ? 'Alterações ainda não salvas' : draftId ? 'Rascunho salvo' : 'Sua edição fica mantida ao voltar às campanhas nesta aba.'}</small></div> : <div className="d-flex flex-wrap gap-2 mb-4"><button className="btn btn-success" disabled={busy || loading} onClick={requestNewCampaign}><Plus size={16} className="me-2"/>Nova comunicação</button>{hasContent && <button className="btn btn-outline-success" disabled={busy} onClick={() => {setCreating(true); navigateStep(step);}}>Continuar edição</button>}</div>}
    {busy && <p role="status" aria-live="polite">Processando, aguarde…</p>}
    <div hidden={!creating}>
    <nav className="campaign-steps mb-4" aria-label="Etapas da comunicação">{['Mensagem', 'Organizações', 'Revisão e envio'].map((label, index) => <button type="button" key={label} disabled={busy} aria-current={step === index + 1 ? 'step' : undefined} className={step === index + 1 ? 'active' : ''} onClick={() => navigateStep(index + 1)}><span>{index + 1}</span><span>{label}</span></button>)}</nav>
    <p className="text-muted small">Etapa {step} de 3 · {step === 1 ? 'Prepare o conteúdo. Basta preencher título, texto, link ou foto.' : step === 2 ? 'Consulte, selecione as organizações e escolha os cargos que receberão.' : 'Confira os canais, resolva as pendências e confirme o envio.'}</p>
    <section hidden={step !== 1}><div className="platform-card p-4"><div className="d-flex justify-content-between gap-2"><div><span className="campaign-step">1 · Mensagem</span><h2 className="h5 mt-2">{draftId ? 'Editar rascunho' : 'Nova divulgação'}</h2></div></div><fieldset disabled={busy}>
      <label className="form-label w-100">Tipo de envio<select className="form-select" value={draft.category} onChange={event => edit({category: event.target.value as CampaignInput['category']})}><option value="system">Comunicado / cobrança</option><option value="marketing">Propaganda</option></select><small className="text-muted">{draft.category === 'marketing' ? 'Publicidade: somente usuários que autorizaram propagandas.' : 'Avisos de serviço, cobrança e pagamento: não exigem a opção Propagandas ativa.'}</small></label>
      <label className="form-label w-100">Título<input className="form-control" maxLength={200} value={draft.title} onChange={e => edit({title:e.target.value})}/></label>
      <div className="campaign-toolbar" role="toolbar" aria-label="Formatar mensagem">{[['Negrito','**','**'],['Itálico','_','_'],['Riscado','~~','~~'],['Lista','\n- ',''],['Link','[','](https://exemplo.com)']] .map(([label,before,after]) => <button type="button" key={label} className="btn btn-light btn-sm" onClick={() => format(before,after)}>{label}</button>)}</div>
      <label className="form-label w-100">Mensagem<textarea ref={textarea} className="form-control campaign-editor" rows={9} maxLength={10000} value={draft.body} onChange={e => edit({body:e.target.value})}/></label><small className="text-muted">{draft.body.length}/10.000 · Use os botões para formatar o texto ou inserir links. Emojis também são aceitos.</small>
      <div className="row g-2 mt-2"><label className="form-label col-md-7">Link do botão<input type="url" className="form-control" placeholder="https://" value={draft.link_url} onChange={e => edit({link_url:e.target.value})}/></label><label className="form-label col-md-5">Texto do botão<input className="form-control" maxLength={80} placeholder="Saiba mais" value={draft.link_label} onChange={e => edit({link_label:e.target.value})}/></label></div>
      <label className="btn btn-outline-secondary mt-2"><ImagePlus size={16} className="me-2"/>Adicionar imagens<input className="d-none" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy} onChange={e => {const files = Array.from(e.target.files || []); e.target.value=''; void run(async () => {if (images.length + files.length > 5) throw new Error('Use até cinco imagens.'); const added: MarketingImage[] = []; for (const file of files) {if (file.size > 5*1024*1024) throw new Error('Cada imagem deve ter até 5 MB.'); added.push(await api.upload(file));} const next = [...images,...added]; setImages(next); edit({images:next.map(i => i.id)});});}}/></label><small className="text-muted d-block">Até 5 imagens · PNG, JPEG ou WebP · 5 MB por imagem</small>
      <div className="d-flex flex-wrap gap-2 mt-2">{images.map(i => <div key={i.id} className="campaign-image"><Image unoptimized width={118} height={95} src={i.image} alt="Imagem selecionada"/><button className="btn btn-light btn-sm" onClick={() => {const next=images.filter(item => item.id!==i.id); setImages(next); edit({images:next.map(item => item.id)});}}>Remover</button></div>)}</div>
      <p className="small text-muted mt-3">Preencha ao menos um: título, mensagem, link ou foto. Se informar um link, use http:// ou https://. A mensagem será salva como rascunho na revisão.</p>
    </fieldset><div className="campaign-preview mt-4"><span className="campaign-step">Prévia no sistema</span><h3 className="h5 mt-2">{draft.title || 'Prévia da divulgação'}</h3><MarketingContent body={draft.body} images={images} link_url={draft.link_url} link_label={draft.link_label}/></div><p className="small text-muted mt-2">No WhatsApp, a mensagem será adaptada à formatação disponível, seguida das imagens.</p>
<div className="campaign-actions"><span className="small text-muted">Título, texto, link e fotos são opcionais individualmente.</span><button className="btn btn-success mt-2" disabled={busy || !messageReady} onClick={() => navigateStep(2)}>Continuar para organizações</button></div>
</div></section>
    <section hidden={step !== 2}><div className="platform-card p-4"><span className="campaign-step">2 · Organizações</span><h2 className="h5 mt-2">Consulta de organizações</h2><fieldset disabled={busy}>
      <details className="campaign-saved mb-3"><summary>Reutilizar ou nomear um público (opcional)</summary><div className="mt-3"><label className="form-label w-100">Consulta salva<select className="form-select" value={audienceId} onChange={e => {const row = audiences.find(a => a.id === e.target.value); setAudienceId(row?.id || ''); setAudienceName(row?.name || ''); setFilters(row?.filters || {roles: ['admin','manager','operator']}); setSelectionOnly(!!row?.filters.organizations?.length); setQueryPreview(null); setPreview(null); edit({audience: row?.id || ''}); void queryOrganizations(1, ordering, row?.filters || {roles: ['admin', 'manager', 'operator']});}}><option value="">Nova consulta</option>{audiences.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
      <label className="form-label w-100">Nome para salvar o público<input className="form-control" value={audienceName} maxLength={150} onChange={e => {setDirty(true); setAudienceName(e.target.value);}}/><small className="text-muted">Opcional ao continuar: se deixar vazio, criaremos um nome para o público.</small></label></div></details>
      <label className="form-label w-100">Nome da organização contém<input onKeyDown={event => {if (event.key === 'Enter') {event.preventDefault(); void queryOrganizations();}}} className="form-control" value={filters.search || ''} onChange={e => {setDirty(true); setPreview(null); setFilters({...filters, search: e.target.value}); setQueryPreview(null);}}/></label>
      <label className="form-label w-100">Estado (UF)<input onKeyDown={event => {if (event.key === 'Enter') {event.preventDefault(); void queryOrganizations();}}} className="form-control" maxLength={2} value={filters.state || ''} onChange={e => {setDirty(true); setPreview(null); setFilters({...filters, state: e.target.value.toUpperCase()}); setQueryPreview(null);}}/></label>
      <details className="campaign-saved my-3"><summary>Mais filtros: planos e assinatura</summary><div className="mt-3"><p className="fw-semibold mb-2">Planos</p>{options?.plans.map(o => <label className="form-check" key={o.code}><input className="form-check-input" type="checkbox" checked={filters.plans?.includes(o.code) || false} onChange={() => toggle('plans',o.code)}/>{o.name}</label>)}
      <p className="fw-semibold mt-3 mb-2">Situação da assinatura</p>{options?.statuses.map(o => <label className="form-check" key={o.value}><input className="form-check-input" type="checkbox" checked={filters.statuses?.includes(o.value) || false} onChange={() => toggle('statuses',o.value)}/>{o.label}</label>)}</div></details>
      <p className="fw-semibold mt-3 mb-2">Cargos que receberão</p><button type="button" className="btn btn-link btn-sm px-0 mb-2" onClick={() => {setDirty(true); setPreview(null); setFilters(current => ({...current, roles: options?.roles.map(role => role.value) || ['admin', 'manager', 'operator']}));}}>Selecionar todos os cargos</button>{options?.roles.map(o => <label className="form-check" key={o.value}><input className="form-check-input" type="checkbox" checked={filters.roles.includes(o.value)} onChange={() => toggle('roles',o.value)}/>{o.label}</label>)}
      <p className="small text-muted mt-3">{draft.category === 'marketing' ? 'Usuários ativos que autorizaram notificações e propagandas.' : 'Usuários ativos com notificações habilitadas, sem exigir adesão a propagandas.'} WhatsApp exige contato autorizado e válido; números repetidos recebem um único envio por campanha.</p>
      <button className="btn btn-outline-success w-100" disabled={!audienceName.trim() || !filters.roles.length || selectionOnly && !filters.organizations?.length} onClick={() => void run(async () => {await saveAudience(); setNotice('Público salvo. Consulte as organizações ou continue para a revisão.');})}><Save size={16} className="me-2"/>Salvar público</button>
    <button className="btn btn-success mt-2 me-2" onClick={() => void queryOrganizations()}>Consultar organizações</button><button type="button" className="btn btn-outline-secondary mt-2" onClick={clearOrganizationFilters}>Limpar filtros</button>
      <small className="text-muted d-block mt-2">Use um ou mais filtros. Sem filtros, a consulta mostra as organizações ativas. Não é necessário salvar para consultar.</small>
      <p className="small text-muted mt-3">Ao continuar, os filtros e as organizações selecionadas serão salvos automaticamente.</p>

    </fieldset>
    <div className="d-flex flex-wrap align-items-center gap-3 mt-3">
      <label className="form-check"><input className="form-check-input" type="radio" name="audience-selection" checked={!selectionOnly} disabled={busy} onChange={() => {setDirty(true); setSelectionOnly(false); setFilters(current => ({...current, organizations: []})); setPreview(null);}}/>Todas as organizações que correspondem aos filtros</label>
      <label className="form-check"><input className="form-check-input" type="radio" name="audience-selection" checked={selectionOnly} disabled={busy} onChange={() => {setDirty(true); setSelectionOnly(true); setPreview(null);}}/>Somente as selecionadas ({filters.organizations?.length || 0})</label>
    </div>
    {selectionOnly && !filters.organizations?.length && <p className="text-warning mt-2" role="status">Selecione ao menos uma organização na tabela para salvar o público.</p>}
    {queryPreview && <div className="mt-3">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><strong>{queryPreview.count} organizações encontradas</strong><label className="form-label mb-0">Ordenar por<select className="form-select" value={ordering} disabled={busy} onChange={event => void queryOrganizations(1, event.target.value)}><option value="name">Nome (A–Z)</option><option value="-name">Nome (Z–A)</option><option value="document">Documento (crescente)</option><option value="-document">Documento (decrescente)</option></select></label></div>
      <div className="table-responsive"><table className="table table-hover align-middle"><caption>Selecione as organizações para compor o público. A seleção é mantida entre as páginas.</caption><thead><tr><th scope="col"><input type="checkbox" className="form-check-input" aria-label="Selecionar organizações desta página" disabled={busy || !queryPreview.results.length} checked={!!queryPreview.results.length && queryPreview.results.every(organization => filters.organizations?.includes(organization.id))} onChange={event => selectOrganizations(queryPreview.results.map(organization => organization.id), event.target.checked)}/></th><th scope="col">Organização</th><th scope="col">Documento</th><th scope="col">Contato</th><th scope="col">Cidade / UF</th><th scope="col">Plano</th><th scope="col">Assinatura</th></tr></thead><tbody>
        {queryPreview.results.map(organization => <tr key={organization.id}><td><input type="checkbox" className="form-check-input" aria-label={`Selecionar ${organization.name}`} disabled={busy} checked={filters.organizations?.includes(organization.id) || false} onChange={event => selectOrganizations([organization.id], event.target.checked)}/></td><td>{organization.name}</td><td>{organization.document || '—'}</td><td><span className="d-block">{organization.email || '—'}</span><small>{organization.phone}</small></td><td>{[organization.city, organization.state].filter(Boolean).join(' / ') || '—'}</td><td>{organization.plan || '—'}</td><td>{organization.status || '—'}</td></tr>)}
        {!queryPreview.results.length && <tr><td colSpan={7} className="text-muted text-center">Nenhuma organização encontrada. Ajuste os filtros e consulte novamente.</td></tr>}
      </tbody></table></div>
      <div className="d-flex justify-content-end align-items-center gap-2"><button className="btn btn-outline-secondary btn-sm" disabled={busy || queryPreview.page <= 1} onClick={() => void queryOrganizations(queryPreview.page - 1)}>Página anterior</button><span>Página {queryPreview.page}</span><button className="btn btn-outline-secondary btn-sm" disabled={busy || !queryPreview.has_next} onClick={() => void queryOrganizations(queryPreview.page + 1)}>Próxima página</button></div>
    </div>}
    <div className="campaign-actions"><span className="small text-muted">{selectionOnly ? `${filters.organizations?.length || 0} organizações selecionadas` : 'Público: todas as organizações dos filtros'} · {filters.roles.length} cargos</span><div className="d-flex flex-wrap gap-2"><button className="btn btn-outline-secondary" disabled={busy} onClick={() => goTo(1)}>Voltar à mensagem</button><button className="btn btn-success" disabled={busy} onClick={() => navigateStep(3)}>Continuar para revisão</button></div></div>
    </div></section>
    <section hidden={step !== 3}><div className="platform-card p-4"><span className="campaign-step">3 · Revisão e pendências</span><h2 className="h5 mt-2">Revise antes de enviar</h2>
      <h3 className="h6 mt-3">{draft.title}</h3><MarketingContent body={draft.body} images={images} link_url={draft.link_url} link_label={draft.link_label}/>
      <p className="mt-3">Seleção: <strong>{selectionOnly ? `${filters.organizations?.length || 0} organizações escolhidas` : 'Todas as organizações dos filtros'}</strong></p><p>Cargos: {filters.roles.map(role => options?.roles.find(option => option.value === role)?.label || role).join(', ')}</p><p>Público: <strong>{audiences.find(item => item.id === draft.audience)?.name || 'Selecione as organizações'}</strong></p>
      <fieldset disabled={busy}>      <div className="d-flex gap-4 my-3"><label className="form-check"><input className="form-check-input" type="checkbox" checked={draft.send_in_app} onChange={e=>changeChannels({send_in_app:e.target.checked})}/>No sistema</label><label className="form-check"><input className="form-check-input" type="checkbox" checked={draft.send_whatsapp} onChange={e=>changeChannels({send_whatsapp:e.target.checked})}/>WhatsApp</label></div>
      <ul className="small">{!messageReady && <li>Informe ao menos um título, texto, link ou foto e confira o link.</li>}{!draft.audience && <li>Selecione e salve o público.</li>}{!draft.send_in_app && !draft.send_whatsapp && <li>Selecione ao menos um canal de envio.</li>}{!preview && <li>Atualize a revisão para conferir os destinatários e liberar o envio.</li>}{preview && !preview.recipients && <li>Nenhum destinatário elegível nos canais escolhidos. Confira o diagnóstico abaixo.</li>}</ul>
      <p className="small text-muted">Os canais precisam estar ativos em <Link href="/platform/notifications" target="_blank" rel="noopener noreferrer">Notificações</Link>. O envio respeita as autorizações de cada usuário.</p>
      <div className="d-flex flex-wrap gap-2"><button className="btn btn-outline-secondary" onClick={() => navigateStep(2)}>Voltar às organizações</button><button className="btn btn-outline-success" disabled={!messageReady || !draft.audience || !draft.send_in_app && !draft.send_whatsapp} onClick={() => void saveAndExit()}><Save size={16} className="me-2"/>Salvar rascunho e sair</button><button className="btn btn-success" disabled={!messageReady || !draft.audience || !draft.send_in_app && !draft.send_whatsapp} onClick={() => void run(() => review())}>Atualizar revisão</button></div>
      </fieldset>
    <div className="campaign-confirm mt-4" role="region" aria-label="Confirmar campanha">
      <h3 className="h5">Confirmar envio</h3>
      {preview ? <><p><strong>{preview.recipients} destinatários</strong> em {preview.organizations} organizações</p><p>{preview.in_app} notificações no sistema · {preview.whatsapp} envios pelo WhatsApp</p>
      {preview.eligibility && <div className="campaign-preview my-3"><h4 className="h6">{draft.send_in_app && !preview.in_app ? 'Por que o total no sistema está zero?' : 'Usuários das organizações escolhidas'}</h4><p className="small">{draft.category === 'marketing' ? 'Propagandas exigem adesão individual. O total considera os cargos escolhidos e as preferências dos usuários.' : 'Comunicados não dependem da opção Propagandas. O total considera usuários ativos dos cargos escolhidos, com notificações habilitadas.'}</p><dl className="row small mb-2">{([
        ['Usuários cadastrados', preview.eligibility.total_users],
        ['Usuários elegíveis', preview.eligibility.eligible_users],
        ...(draft.category === 'marketing' ? [['Sem autorização para propagandas', preview.eligibility.marketing_not_authorized] as const] : []),
        ['Notificações desativadas', preview.eligibility.notifications_disabled],
        ['Cargos fora da seleção', preview.eligibility.roles_excluded],
        ['Usuários inativos', preview.eligibility.inactive_users],
        ['Equipe do backoffice (excluída)', preview.eligibility.platform_staff_excluded],
      ] as const).map(([label, count]) => <div className="col-12 col-md-6 d-flex justify-content-between gap-2" key={label}><dt className="fw-normal">{label}</dt><dd>{count}</dd></div>)}</dl>{draft.category === 'marketing' && preview.eligibility.marketing_not_authorized > 0 && <p className="small mb-2">Cada destinatário precisa ativar <strong>Propagandas</strong> na própria conta, em <strong>Notificações → Preferências</strong>. Depois, clique em Atualizar revisão.</p>}<div className="d-flex flex-wrap gap-2"><button className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => navigateStep(2)}>Revisar organizações e cargos</button><Link href="/platform/users" target="_blank" rel="noopener noreferrer" className="btn btn-link btn-sm">Consultar usuários (nova aba)</Link></div></div>}
      {!!preview.blockers?.length && <div className="alert alert-warning" role="alert"><strong>Pendências para enviar</strong><ul className="mb-0">{preview.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul><Link href="/platform/notifications" target="_blank" rel="noopener noreferrer">Configurar canais (nova aba), depois atualizar revisão</Link></div>}
      <details className="mb-3"><summary>Organizações da consulta</summary><ul>{preview.sample.map(organization => <li key={organization.id}>{organization.name} · {organization.eligible_users ?? '—'} usuários elegíveis</li>)}</ul></details></> : <p role="status">{busy ? 'Preparando destinatários e verificando pendências…' : 'Atualize a revisão para verificar os destinatários e as permissões de envio.'}</p>}
      <p className="small">Ao confirmar, a campanha entra na fila de envio. Acompanhe os resultados na home de comunicações.</p>
      <button className="btn btn-success" disabled={busy || !preview?.recipients || !!preview?.blockers?.length} onClick={() => void publishCampaign()}><Send size={16} className="me-2"/>Confirmar envio</button>
      <button className="btn btn-link" disabled={busy} onClick={() => goTo(1)}>Editar mensagem</button>
    </div></div></section>
    </div>
    <section hidden={creating} className="platform-card p-4 mt-4" aria-label="Campanhas e resultados"><form className="row g-2 mb-4" onSubmit={event => {event.preventDefault(); if (campaignSearch === searchInput.trim() && page === 1) {void run(() => load(1)); return;} setLoading(true); setPage(1); setCampaignSearch(searchInput.trim());}}><label className="col-12 col-md-6 form-label">Buscar campanha<input type="search" className="form-control" placeholder="Título, mensagem ou público" value={searchInput} onChange={event => setSearchInput(event.target.value)}/></label><label className="col-12 col-md-4 form-label">Situação<select className="form-select" value={campaignStatus} disabled={busy} onChange={event => {setLoading(true); setPage(1); setCampaignStatus(event.target.value);}}><option value="">Todas as situações</option>{['draft', 'queued', 'processing', 'completed', 'cancelled'].map(status => <option key={status} value={status}>{labels[status]}</option>)}</select></label><div className="col-12 col-md-2 d-flex align-items-end pb-2"><button className="btn btn-outline-success w-100" disabled={busy || loading}>Buscar</button></div></form><div className="d-flex justify-content-between"><h2 className="h5">Campanhas e resultados</h2><button className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={()=>void run(()=>load())}>Atualizar</button></div><div className="row g-3 my-2" aria-label="Resumo das campanhas desta página">{[['Campanhas nesta página', campaigns.length], ['Rascunhos', campaigns.filter(campaign => campaign.status === 'draft').length], ['Na fila ou em preparação', campaigns.filter(campaign => ['queued', 'processing'].includes(campaign.status)).length], ['Notificações lidas', campaigns.reduce((total, campaign) => total + campaign.summary.read, 0)]].map(([label, count]) => <div className="col-6 col-lg-3" key={label}><div className="campaign-preview p-3"><span className="small text-muted d-block">{label}</span><strong className="fs-4">{count}</strong></div></div>)}</div>{!campaigns.length ? <p className="text-muted">{loading ? 'Carregando campanhas…' : campaignSearch || campaignStatus ? 'Nenhuma campanha corresponde à busca. Altere os filtros.' : 'Nenhuma campanha criada. Clique em Nova comunicação para começar.'}</p> : <div className="table-responsive"><table className="table align-middle"><thead><tr><th>Campanha</th><th>Público</th><th>Estado</th><th>Resultados</th><th>Ações</th></tr></thead><tbody>{campaigns.map(c=><tr key={c.id}><td><strong>{c.title || c.body.slice(0, 80) || c.link_url || 'Propaganda com imagens'}</strong><small className="d-block text-muted">{c.category === 'system' ? 'Comunicado / cobrança' : 'Propaganda'}</small><small className="d-block text-muted">Criada: {c.created_at ? new Date(c.created_at).toLocaleString('pt-BR') : '—'}</small><details className="mt-2"><summary>Ver conteúdo e detalhes</summary><MarketingContent body={c.body} images={c.image_details} link_url={c.link_url} link_label={c.link_label}/><small className="d-block">Atualizada: {c.updated_at ? new Date(c.updated_at).toLocaleString('pt-BR') : '—'}</small><small className="d-block">Entrada na fila: {c.queued_at ? new Date(c.queued_at).toLocaleString('pt-BR') : 'Ainda não enviada'}</small></details><small className="d-block text-muted">{[c.send_in_app?'Sistema':'',c.send_whatsapp?'WhatsApp':''].filter(Boolean).join(' · ')}</small></td><td>{c.audience_name}<small className="d-block">{c.recipient_count} destinatários</small></td><td><span className="badge bg-success-subtle text-success">{labels[c.status] || c.status}</span></td><td><small>{Math.max(0, c.recipient_count - c.summary.prepared)} aguardando preparação · {c.summary.prepared} preparados · {c.summary.read} lidos · {c.summary.skipped} suspensos</small>{c.summary.deliveries.map(d=><small className="d-block" key={d.deliveries__status}>{labels[d.deliveries__status] || d.deliveries__status}: {d.total}</small>)}</td><td>{c.status==='draft' && <button disabled={busy} className="btn btn-outline-success btn-sm me-2" onClick={() => {if (dirty && hasContent) setPendingAction({kind: 'edit', campaign: c}); else void openCampaign(c);}}>Gerenciar e enviar</button>}{['draft', 'queued', 'processing'].includes(c.status) && <button disabled={busy} className="btn btn-outline-danger btn-sm" onClick={() => setPendingAction({kind: 'cancel', campaign: c})}>Cancelar pendentes</button>}</td></tr>)}</tbody></table></div>}<div className="d-flex justify-content-end gap-2"><button className="btn btn-outline-secondary btn-sm" disabled={page===1 || busy || loading} onClick={()=>{setLoading(true); setPage(page-1);}}>Anterior</button><span>Página {page}</span><button className="btn btn-outline-secondary btn-sm" disabled={!hasNext || busy || loading} onClick={()=>{setLoading(true); setPage(page+1);}}>Próxima</button></div></section>
    </div>
    {pendingAction && <div className="campaign-dialog-backdrop"><div role="dialog" aria-modal="true" aria-labelledby="campaign-dialog-title" onKeyDown={event => {
      if (event.key === 'Escape') {event.preventDefault(); setPendingAction(null);}
      if (event.key === 'Tab') {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && event.target === first) {event.preventDefault(); last?.focus();}
        if (!event.shiftKey && event.target === last) {event.preventDefault(); first?.focus();}
      }
    }} className="platform-card campaign-dialog p-4"><h2 id="campaign-dialog-title" className="h5">{pendingAction.kind === 'cancel' ? 'Cancelar os envios pendentes?' : 'Você tem alterações não salvas'}</h2><p>{pendingAction.kind === 'cancel' ? 'Os envios ainda pendentes serão interrompidos. As entregas já realizadas permanecem no histórico.' : 'Você pode continuar editando ou salvar o rascunho antes de abrir outra comunicação.'}</p><div className="d-flex flex-wrap gap-2"><button autoFocus className="btn btn-outline-secondary" onClick={() => {setPendingAction(null); if (pendingAction.kind !== 'cancel') {setCreating(true); goTo(step);}}}>{pendingAction.kind === 'cancel' ? 'Manter campanha' : 'Continuar editando'}</button>{pendingAction.kind !== 'cancel' && <button className="btn btn-success" onClick={() => {setPendingAction(null); void saveAndExit();}}>Salvar rascunho e voltar à home</button>}<button className="btn btn-outline-danger" onClick={confirmPendingAction}>{pendingAction.kind === 'cancel' ? 'Confirmar cancelamento' : 'Descartar alterações e continuar'}</button></div></div></div>}
  </div>;
}
