import type {ModuleKey} from '../home/contracts';
import type {HomeIconName} from '../home/HomeIcon';
export const moduleKeys:ModuleKey[]=['agenda','crops','swine','beef','dairy','feeding','clinic','inventory','finance','structure','assistant','reports','settings','profile','notifications','support'];
export const iconFor=(key:ModuleKey):HomeIconName=>key==='agenda'?'agenda':key==='finance'?'wallet':key==='inventory'?'box':key==='notifications'?'bell':'leaf';
export function nativeDestination(key:ModuleKey,create=false){
 if(key==='agenda')return create?{pathname:'/agenda/task-form' as const}:{pathname:'/agenda' as const};
 if(key==='beef'||key==='dairy')return create?{pathname:'/cattle/[production]/form' as const,params:{production:key,mode:'create'}}:{pathname:'/cattle/[production]' as const,params:{production:key}};
 if(key==='swine'&&!create)return {pathname:'/swine' as const};
 if(key==='clinic')return create?{pathname:'/clinic/health-form' as const}:{pathname:'/clinic' as const};
 if(key==='notifications'&&!create)return {pathname:'/notifications' as const};
 if(key==='feeding')return {pathname:'/feeding' as const};
 if(key==='inventory')return create?{pathname:'/inventory/form' as const,params:{kind:'items'}}:{pathname:'/inventory' as const};
 if(key==='profile'&&!create)return {pathname:'/profile' as const};
 if(key==='crops')return create?{pathname:'/crops' as const,params:{tab:'routines'}}:{pathname:'/crops' as const};
 if(key==='structure'&&!create)return {pathname:'/structures' as const};
 if(key==='assistant'&&!create)return {pathname:'/assistant' as const};
 if(key==='reports'&&!create)return {pathname:'/reports' as const};
 if(key==='settings'&&!create)return {pathname:'/organization' as const};
 if(key==='support')return create?{pathname:'/support/new' as const}:{pathname:'/support' as const};
 if(key==='finance')return create?{pathname:'/finance/form' as const}:{pathname:'/finance' as const};
 return null;
}
export type NavSlot='home'|'agenda'|'search'|'finance'|'modules'|'spacer';
// Keeps the central create button centred: the shorter side gets the optional tab first, then empty slots.
export function balanceNavSlots(left:NavSlot[],right:NavSlot[],optional:NavSlot|null,centred:boolean){
 const l=[...left],r=[...right];if(!centred)return {left:l,right:r};
 if(optional&&l.length!==r.length){if(l.length<r.length)l.push(optional);else r.unshift(optional);}
 while(l.length<r.length)l.push('spacer');while(r.length<l.length)r.unshift('spacer');
 return {left:l,right:r};
}
