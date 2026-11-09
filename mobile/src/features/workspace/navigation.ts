import type {ModuleKey} from '../home/contracts';
import type {HomeIconName} from '../home/HomeIcon';
export const moduleKeys:ModuleKey[]=['agenda','crops','swine','beef','dairy','feeding','clinic','inventory','finance','structure','assistant','settings','profile','notifications','support'];
export const iconFor=(key:ModuleKey):HomeIconName=>key==='agenda'?'agenda':key==='finance'?'wallet':key==='inventory'?'box':key==='notifications'?'bell':'leaf';
export function nativeDestination(key:ModuleKey,create=false){
 if(key==='agenda')return create?{pathname:'/agenda/task-form' as const}:{pathname:'/agenda' as const};
 if(key==='beef'||key==='dairy')return create?{pathname:'/cattle/[production]/form' as const,params:{production:key,mode:'create'}}:{pathname:'/cattle/[production]' as const,params:{production:key}};
 if(key==='clinic')return create?{pathname:'/clinic/form' as const}:{pathname:'/clinic' as const};
 if(key==='notifications'&&!create)return {pathname:'/notifications' as const};
 if(key==='feeding')return {pathname:'/feeding' as const};
 if(key==='inventory')return create?{pathname:'/inventory/form' as const,params:{kind:'items'}}:{pathname:'/inventory' as const};
 if(key==='profile'&&!create)return {pathname:'/profile' as const};
 return null;
}
