"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Beef, Bird, Check, Droplets, PiggyBank, Sprout } from 'lucide-react';
import { usePublicLocale } from '@/lib/publicLocale';
import type { PublicTranslationKey } from '@/lib/publicMessages';
import { getPublicSegments, type PublicSegment } from '@/services/publicSegments';
const definitions: {code:string;title:PublicTranslationKey;subtitle?:PublicTranslationKey;description:PublicTranslationKey;icon:typeof Sprout;features:PublicTranslationKey[]}[] = [
  {code:'plantacoes',title:'users.crops',subtitle:'public.planningAndProductivity',description:'public.trackCropsInputsOperationsAndCostsFromPlantingToHarvest',icon:Sprout,features:['public.soilPreparationFertilizationAndSeeds','public.irrigationPesticidesAndFertigation','public.laborAgronomistHistoryAndHarvest']},
  {code:'suinocultura-ciclo-completo',title:'swine.home.title',subtitle:'public.fullCycle',description:'public.manageReproductionMaternityGrowthAndFinishingInOneRoutine',icon:PiggyBank,features:['segments.reproduction','segments.phases','public.feedConsumptionAndFormulas']},
  {code:'suinocultura-engorda',title:'swine.home.title',subtitle:'swineReproduction.fattening',description:'public.trackBatchesConsumptionAndPerformanceFromGrowthToFinishing',icon:PiggyBank,features:['segments.batches','public.feedConsumptionAndFormulas','segments.sales']},
  {code:'gado-de-corte',title:'sidebar.beefCattle',description:'segments.beefDescription',icon:Beef,features:['segments.batches','segments.pasture','segments.sales']},
  {code:'pecuaria-leiteira',title:'sidebar.dairy',description:'segments.dairyDescription',icon:Droplets,features:['segments.milk','segments.tank','segments.dairyHerd']},
];
export function SegmentOverview() {
  const { t }=usePublicLocale();
  const [catalog,setCatalog]=useState<PublicSegment[]>([]);
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();
    void getPublicSegments(abort.signal).then(result=>{if(!abort.signal.aborted){setCatalog(result);setStatus('ready');}}).catch(()=>{if(!abort.signal.aborted)setStatus('error');});
    return ()=>abort.abort();
  },[retry]);
  const available=(code:string)=>status==='ready' && catalog.some(item=>item.code===code&&item.hasTiers);
  const metric=(code:string)=>{
    const unit=catalog.find(item=>item.code===code)?.metric;
    return unit==='matrizes'?t('segments.matrices'):unit==='animais'?t('segments.animals'):unit==='hectares'?t('segments.hectares'):unit;
  };
  return <section className="marketing-section segment-overview" id="segmentos" aria-labelledby="segments-title">
    <div className="marketing-container">
      <div className="section-heading"><div className="eyebrow">{t('segments.eyebrow')}</div><h2 id="segments-title">{t('segments.title')}</h2><p>{t('segments.description')}</p></div>
      {status==='loading'&&<p className="segment-catalog-state" role="status">{t('segments.loading')}</p>}
      {status==='error'&&<div className="segment-catalog-state" role="alert"><p>{t('segments.error')}</p><button type="button" className="marketing-button secondary" onClick={()=>{setStatus('loading');setRetry(value=>value+1);}}>{t('segments.retry')}</button></div>}
      <div className="segment-overview-grid">
        {definitions.map(({code,title,subtitle,description,icon:Icon,features})=><article className="segment-overview-card" key={code} data-segment={code}>
          <header><div className="segment-overview-icon"><Icon size={26} aria-hidden="true"/></div><div><h3>{t(title)}</h3>{subtitle&&<p>{t(subtitle)}</p>}</div></header>
          <span className={`segment-status${available(code)?' is-public':''}`}>{status==='loading'?t('segments.checking'):available(code)?t('segments.public'):t('segments.contact')}</span>
          <p className="segment-overview-description">{t(description)}</p>
          <ul>{features.map(feature=><li key={feature}><Check size={16} aria-hidden="true"/>{t(feature)}</li>)}</ul>
          {available(code)&&metric(code)&&<p className="segment-sizing">{t('segments.sizing')}: {metric(code)}</p>}
          {status==='ready'&&!available(code)&&<p className="segment-commercial-note">{t('segments.notListed')}</p>}
          <Link className={`marketing-button ${available(code)?'primary':'secondary'}`} href={available(code)?`/planos?segmento=${encodeURIComponent(code)}`:'/contato'}>{available(code)?t('segments.plans'):t('segments.talk')}<ArrowRight size={16}/></Link>
        </article>)}
        {status==='ready'&&catalog.filter(item=>item.hasTiers&&!definitions.some(def=>def.code===item.code)).map(item=><article className="segment-overview-card" key={item.code} data-segment={item.code}><header><div className="segment-overview-icon"><Sprout size={26}/></div><div><h3>{item.name}</h3><p>{item.subtitle}</p></div></header><span className="segment-status is-public">{t('segments.public')}</span><p className="segment-overview-description">{item.description}</p>{item.metric&&<p className="segment-sizing">{t('segments.sizing')}: {metric(item.code)}</p>}<Link href={`/planos?segmento=${encodeURIComponent(item.code)}`} className="marketing-button primary">{t('segments.plans')}<ArrowRight size={16}/></Link></article>)}
      </div>
      <div className="segment-shared"><strong>{t('segments.sharedTitle')}</strong><p>{t('segments.sharedDescription')}</p><Link href="/recursos">{t('segments.allResources')} <ArrowRight size={16}/></Link></div>
      <div className="segment-development"><Bird size={23} aria-hidden="true"/><div><strong>{t('segments.birdsTitle')}</strong><p>{t('segments.birdsDescription')}</p></div></div>
    </div>
  </section>;
}
