import type {Language} from '../../i18n/messages';

/** Segment that owns a stock item or feed formula (backend `segmento`); '' = general/shared. */
export const ownerSegments=['','suinos','gado-de-corte','pecuaria-leiteira'] as const;
export type OwnerSegment=(typeof ownerSegments)[number];

const copy:Record<Language,{label:string;names:Record<OwnerSegment,string>}>={
 'pt-BR':{label:'Segmento',names:{'':'Geral (todos)','suinos':'Suinocultura','gado-de-corte':'Gado de corte','pecuaria-leiteira':'Pecuária leiteira'}},
 en:{label:'Segment',names:{'':'General (all)','suinos':'Pig farming','gado-de-corte':'Beef cattle','pecuaria-leiteira':'Dairy farming'}},
 es:{label:'Segmento',names:{'':'General (todos)','suinos':'Porcicultura','gado-de-corte':'Ganado de carne','pecuaria-leiteira':'Ganadería lechera'}},
 'pt-PT':{label:'Segmento',names:{'':'Geral (todos)','suinos':'Suinicultura','gado-de-corte':'Bovinos de carne','pecuaria-leiteira':'Pecuária leiteira'}},
};
export const segmentCopy=(language:Language)=>copy[language];
/** Older servers do not send the field: treat it as general. */
export const ownerSegmentField=(value:unknown):OwnerSegment=>(ownerSegments as readonly unknown[]).includes(value)?value as OwnerSegment:'';
