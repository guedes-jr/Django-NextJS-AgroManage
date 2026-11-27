import {useEffect,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {useAuth} from '../auth/AuthProvider';
import {colors,space,type as typo} from '../../theme/tokens';
import {offlineMessages} from './messages';

const RETRY_MS=60000;

/** P08.08 — offline state, time of the last server confirmation and a manual retry (plus a slow automatic one). */
export function OfflineBanner(){
 const {state,controller,language}=useAuth();const t=offlineMessages[language];
 const confirmedAt=state.status==='signedIn'?state.offline?.confirmedAt:undefined;
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  if(confirmedAt===undefined)return;
  const timer=setInterval(()=>{void controller.reconnect();},RETRY_MS);
  return ()=>clearInterval(timer);
 },[confirmedAt,controller]);
 if(confirmedAt===undefined)return null;
 const at=new Intl.DateTimeFormat(language,{dateStyle:'short',timeStyle:'short'}).format(new Date(confirmedAt));
 const retry=async()=>{if(busy)return;setBusy(true);try{await controller.reconnect();}finally{setBusy(false);}};
 return <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:space.sm,paddingHorizontal:space.lg,paddingVertical:space.sm,backgroundColor:colors.warningSurface,borderBottomWidth:1,borderColor:colors.borderSoft}}>
  <View style={{flex:1,minWidth:200,gap:2}}>
   <Text style={{...typo.body,fontWeight:'700',color:colors.warning}}>{t.title}</Text>
   <Text style={{...typo.meta,color:colors.text}}>{t.body.replace('{date}',at)}</Text>
  </View>
  <Pressable accessibilityRole="button" accessibilityState={{busy,disabled:busy}} disabled={busy} onPress={()=>void retry()} hitSlop={8} style={{minHeight:44,minWidth:44,justifyContent:'center',paddingHorizontal:space.sm}}>
   <Text style={{...typo.body,fontWeight:'700',color:colors.primary}}>{busy?t.checking:t.retry}</Text>
  </Pressable>
 </View>;
}
