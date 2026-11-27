import {useState} from 'react';
import {Text,View} from 'react-native';
import {useAuth} from '../auth/AuthProvider';
import type {User} from '../auth/contracts';
import {AgendaButton} from '../agenda/ui';
import {colors,radius,space,type} from '../../theme/tokens';
import {trialDaysLeft} from './contracts';
import {fill,onboardingMessages} from './messages';

/** Days left in the free trial on Início; the admin opens the payment method and early subscription. */
export function TrialNotice({user,onOpen}:{user:User;onOpen:()=>void}){
 const {language}=useAuth();const t=onboardingMessages[language];
 const [now]=useState(()=>Date.now());
 const end=user.access.trial_ends_at;
 if(!end||user.access.access_stage)return null;
 const days=trialDaysLeft(end,now);
 return <View accessibilityRole="summary" style={{gap:space.sm,padding:space.md,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.soft}}>
  <Text style={type.body}>{days<=1?t.trialToday:fill(t.trialDays,{days})}</Text>
  {user.access.role==='admin'&&<AgendaButton label={t.trialAction} onPress={onOpen}/>}
 </View>;
}
