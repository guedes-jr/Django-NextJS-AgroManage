import Link from 'next/link';
import { ArrowRight, ChevronRight, CircleHelp, FileText, Info, ShieldCheck } from 'lucide-react';
import type { PublicLanguage, PublicTranslationKey, PublicTranslator } from '@/lib/publicMessages';
import { MarketingHeader } from './MarketingHeader';
import { MarketingFooter } from './MarketingFooter';
import './legal-document.css';
type Section={id:string;title:PublicTranslationKey;body:PublicTranslationKey;extra?:PublicTranslationKey;items?:PublicTranslationKey[]};
export const legalSections:Record<'terms'|'privacy',Section[]>={
  terms:[
    {id:'uso',title:'public.platformUse',body:'public.accessMustBeByUsersAuthorizedByTheContractingOrganization'},
    {id:'conta',title:'legal.accounts',body:'legal.accountsBody'},
    {id:'planos',title:'legal.plans',body:'legal.plansBody'},
    {id:'responsabilidades',title:'public.responsibilities',body:'public.fazendaMaisSupportsManagementAndDecisionMakingWithoutReplacingTechnical',extra:'legal.recordsBody'},
    {id:'dados',title:'public.dataAndAvailability',body:'public.registeredDataRemainsLinkedToTheResponsibleOrganizationAvailabilitySupport'},
    {id:'integracoes',title:'legal.integrations',body:'legal.integrationsBody'},
    {id:'contato',title:'legal.questions',body:'legal.termsContact'},
  ],
  privacy:[
    {id:'dados',title:'public.dataProcessed',body:'public.weProcessRegistrationOperationalAndTechnicalDataNecessaryForAuthentication',items:['legal.accountData','legal.operationData','legal.technicalData']},
    {id:'finalidades',title:'crops.purpose',body:'public.informationIsUsedToProvideTheContractedServiceProtectAccounts'},
    {id:'organizacao',title:'legal.organization',body:'legal.organizationBody'},
    {id:'armazenamento',title:'legal.storage',body:'legal.storageBody'},
    {id:'servicos',title:'legal.providers',body:'legal.providersBody'},
    {id:'retencao',title:'legal.retention',body:'legal.retentionBody'},
    {id:'direitos',title:'public.securityAndRights',body:'public.weApplyAccessControlsAndOrganizationIsolationRequestsConcerningData',extra:'legal.rightsBody'},
    {id:'contato',title:'legal.privacyContact',body:'legal.privacyContactBody'},
  ],
};
export function LegalDocument({kind,t,language}:{kind:'terms'|'privacy';t:PublicTranslator;language:PublicLanguage}) {
  const privacy=kind==='privacy';
  const sections=legalSections[kind];
  const title=t(privacy?'public.privacyPolicy':'public.termsOfUse');
  const Icon=privacy?ShieldCheck:FileText;
  const revised=new Intl.DateTimeFormat(language,{dateStyle:'long',timeZone:'UTC'}).format(new Date('2026-11-07T00:00:00Z'));
  const index=<ol>{sections.map((section,i)=><li key={section.id}><a href={`#legal-${section.id}`}><span>{String(i+1).padStart(2,'0')}</span>{t(section.title)}</a></li>)}</ol>;
  return <div className="legal-document-page">
    <MarketingHeader/>
    <main id="marketing-main" tabIndex={-1}>
      <header className="legal-masthead" id="legal-top"><div className="marketing-container">
        <nav className="legal-breadcrumb" aria-label={t('legal.navigation')}><Link href="/">Fazenda Mais</Link><ChevronRight size={14} aria-hidden="true"/><span aria-current="page">{title}</span></nav>
        <div className="legal-title-row"><span className="legal-page-icon"><Icon size={30} aria-hidden="true"/></span><div><span className="eyebrow">{t('legal.eyebrow')}</span><h1>{title}</h1></div></div>
        <p className="legal-lead">{t(privacy?'public.howFazendaMaisHandlesAndProtectsYourOrganizationSInformation':'public.generalConditionsForUsingFazendaMaisServices')}</p>
        <div className="legal-meta"><span>{t('legal.updated',{date:revised})}</span><span>{t('legal.languageNotice')}</span></div>
        <nav className="legal-document-switch" aria-label={t('legal.documents')}><Link href="/termos" aria-current={!privacy?'page':undefined}><FileText size={17}/>{t('public.termsOfUse')}</Link><Link href="/privacidade" aria-current={privacy?'page':undefined}><ShieldCheck size={17}/>{t('privacy')}</Link></nav>
      </div></header>
      <div className="marketing-container legal-layout">
        <aside className="legal-sidebar"><nav className="legal-desktop-index" aria-label={t('legal.toc')}><h2>{t('legal.toc')}</h2>{index}</nav><details className="legal-mobile-index"><summary>{t('legal.toc')}</summary><nav aria-label={t('legal.toc')}>{index}</nav></details><div className="legal-help"><CircleHelp size={23} aria-hidden="true"/><strong>{t('legal.helpTitle')}</strong><p>{t('legal.helpText')}</p><Link href="/contato">{t('segments.talk')}<ArrowRight size={16}/></Link></div></aside>
        <article className="legal-article" aria-label={title}>
          <div className="legal-overview"><Info size={22} aria-hidden="true"/><p>{t(privacy?'legal.privacyOverview':'legal.termsOverview')}</p></div>
          {sections.map((section,i)=><section id={`legal-${section.id}`} className="legal-section" key={section.id}><h2><span aria-hidden="true">{String(i+1).padStart(2,'0')}</span>{t(section.title)}</h2><p>{t(section.body)}</p>{section.items&&<ul>{section.items.map(item=><li key={item}>{t(item)}</li>)}</ul>}{section.extra&&<p>{t(section.extra)}</p>}{section.id==='contato'&&<Link href="/contato" className="marketing-button primary">{t(privacy?'legal.requestContact':'contact')}<ArrowRight size={17}/></Link>}{privacy&&section.id==='direitos'&&<a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares" className="legal-reference">{t('legal.anpd')}<ArrowRight size={15}/></a>}</section>)}
          <div className="legal-article-end"><a href="#legal-top">{t('legal.backTop')}</a><Link href={privacy?'/termos':'/privacidade'}>{t(privacy?'public.termsOfUse':'public.privacyPolicy')}<ArrowRight size={15}/></Link></div>
        </article>
      </div>
    </main>
    <MarketingFooter/>
  </div>;
}
