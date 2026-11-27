import {useMemo,useRef,useState} from 'react';
import {Alert,Pressable,ScrollView,Switch,Text,TextInput,View} from 'react-native';
import {useLocalSearchParams,useRouter} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {isAxiosError} from 'axios';
import {useAuth} from '../auth/AuthProvider';
import {AgendaShell} from '../workspace/AppShell';
import {workspaceMessages} from '../workspace/messages';
import {AgendaButton,FormField,styles as ui} from '../agenda/ui';
import {EmptyState,ErrorState,ListRow,Notice,SectionLabel,SkeletonList,mobileStyles as ms} from '../../components/mobile';
import {colors,space,type as typo} from '../../theme/tokens';
import {VETERINARY_SEGMENT,canManageMembers,draftFromMember,emptyMemberDraft,memberPayload,memberRoles,scopedRoles,validateMemberDraft,withRole,type Member,type MemberDraft,type MemberErrorKey} from './contracts';
import {teamMessages} from './messages';

/** Readable server message (field errors or detail) without exposing raw 5xx bodies. */
function serverMessage(error:unknown){
 if(!isAxiosError(error)||!error.response||error.response.status>=500)return '';
 const data=error.response.data as {error?:{detail?:unknown};detail?:unknown}|undefined;
 const detail=data?.error?.detail??data?.detail??data;
 if(typeof detail==='string')return detail;
 if(detail&&typeof detail==='object')return Object.values(detail as Record<string,unknown>).flat().filter(x=>typeof x==='string').join(' ').slice(0,400);
 return '';
}

function ToggleRow({label,hint,value,onChange,disabled}:{label:string;hint?:string;value:boolean;onChange:(value:boolean)=>void;disabled?:boolean}){
 return <Pressable accessibilityRole="switch" accessibilityState={{checked:value,disabled}} accessibilityLabel={label} accessibilityHint={hint} disabled={disabled} onPress={()=>onChange(!value)} style={{flexDirection:'row',alignItems:'center',gap:space.md,minHeight:44,paddingVertical:space.sm}}>
  <View style={{flex:1}}><Text style={{...typo.body,color:colors.text}}>{label}</Text>{!!hint&&<Text style={{...typo.meta,color:colors.muted}}>{hint}</Text>}</View>
  <Switch accessible={false} disabled={disabled} value={value} onValueChange={onChange} trackColor={{true:colors.primary,false:colors.muted}}/>
 </Pressable>;
}

export function MemberFormScreen(){
 const {id}=useLocalSearchParams<{id:string}>();const creating=id==='new';
 const {state,controller,language}=useAuth();const router=useRouter();const client=useQueryClient();
 const t=teamMessages[language],w=workspaceMessages[language];
 const user=state.status==='signedIn'?state.session.user:null;
 const allowed=!!user&&canManageMembers(user);
 const members=useQuery({queryKey:['team-members'],enabled:allowed,queryFn:({signal})=>controller.teamMembers(signal)});
 const options=useQuery({queryKey:['team-member-options'],enabled:allowed,queryFn:({signal})=>controller.memberOptions(signal)});
 const member=useMemo(()=>creating?null:(members.data??[]).find(row=>row.id===id)??null,[creating,id,members.data]);
 const [draft,setDraft]=useState<MemberDraft|null>(creating?emptyMemberDraft:null);
 const current=draft??(member?draftFromMember(member):null);
 const [errors,setErrors]=useState<Partial<Record<keyof MemberDraft,MemberErrorKey>>>({});
 const [busy,setBusy]=useState(false);const [notice,setNotice]=useState<{text:string;ok:boolean}|null>(null);const lock=useRef(false);
 const roleLocked=!!member&&(member.organization_responsible||member.id===user?.id);
 const back=()=>{if(router.canGoBack())router.back();else router.replace('/team');};
 const errorText:Record<MemberErrorKey,string>={name:t.errName,email:t.errEmail,phone:t.errPhone,password:t.errPassword,passwordMismatch:t.errMismatch};
 const roleHint:Record<Member['role'],string>={admin:t.roleAdmin,manager:t.roleManager,operator:t.roleOperator,veterinarian:t.roleVeterinarian};
 const set=(patch:Partial<MemberDraft>)=>setDraft({...(current??emptyMemberDraft),...patch});

 const save=async()=>{
  if(!current||lock.current)return;const found=validateMemberDraft(current,creating);setErrors(found);if(Object.keys(found).length)return;
  lock.current=true;setBusy(true);setNotice(null);
  try{
   const body=memberPayload(current,{creating,roleLocked});
   if(creating)await controller.createMember(body);else await controller.updateMember(id,body);
   await client.invalidateQueries({queryKey:['team-members']});
   setNotice({text:creating?t.created:t.saved,ok:true});
   if(creating)back();else setDraft(null);
  }catch(error){setNotice({text:serverMessage(error)||t.failed,ok:false});}
  finally{lock.current=false;setBusy(false);}
 };
 const toggleActive=()=>{
  if(!member||lock.current)return;
  const run=async()=>{lock.current=true;setBusy(true);setNotice(null);
   try{await controller.updateMember(member.id,{is_active:!member.is_active});await client.invalidateQueries({queryKey:['team-members']});setNotice({text:member.is_active?t.deactivated:t.activated,ok:true});}
   catch(error){setNotice({text:serverMessage(error)||t.failed,ok:false});}
   finally{lock.current=false;setBusy(false);}};
  if(!member.is_active){void run();return;}
  Alert.alert(t.deactivate,t.confirmDeactivate.replace('{name}',member.full_name||member.email),[{text:t.cancel,style:'cancel'},{text:t.confirm,style:'destructive',onPress:()=>void run()}]);
 };

 const contracted=(options.data?.segments??[]).filter(segment=>segment.contracted);
 const title=creating?t.createTitle:t.editTitle;
 return <AgendaShell title={title} onBack={back} layout="form"><ScrollView contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
  {!allowed?<EmptyState title={t.adminOnly}/>
   :(members.isPending&&!creating)||options.isPending?<SkeletonList rows={4}/>
   :members.isError||options.isError?<ErrorState message={w.error} language={language} onRetry={()=>{void members.refetch();void options.refetch();}}/>
   :!current?<EmptyState title={t.notFound}/>:<>
   {notice&&<Notice tone={notice.ok?'success':'danger'} text={notice.text}/>}
   <SectionLabel title={t.identity}/>
   <FormField label={t.name} error={errors.full_name&&errorText[errors.full_name]}><TextInput accessibilityLabel={t.name} value={current.full_name} onChangeText={full_name=>set({full_name})} maxLength={150} autoComplete="name" style={ui.fieldControl} editable={!busy}/></FormField>
   <FormField label={t.email} error={errors.email&&errorText[errors.email]}><TextInput accessibilityLabel={t.email} value={current.email} onChangeText={email=>set({email})} keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={254} style={ui.fieldControl} editable={creating&&!busy}/></FormField>
   <FormField label={t.phone} error={errors.phone&&errorText[errors.phone]}><TextInput accessibilityLabel={t.phone} value={current.phone} onChangeText={phone=>set({phone})} keyboardType="phone-pad" maxLength={30} style={ui.fieldControl} editable={!busy}/></FormField>
   <ToggleRow label={t.whatsapp} value={current.phone_is_whatsapp} onChange={phone_is_whatsapp=>set({phone_is_whatsapp})} disabled={busy}/>
   <ToggleRow label={t.alerts} value={current.receive_system_alerts} onChange={receive_system_alerts=>set({receive_system_alerts})} disabled={busy}/>

   <SectionLabel title={t.role}/>
   {roleLocked&&<Notice tone="info" text={t.lockedRole}/>}
   {memberRoles.map(role=><ListRow key={role} title={t.roles[role]??role} subtitle={roleHint[role]} selected={current.role===role} disabled={roleLocked||busy} onPress={()=>setDraft(withRole(current,role))} accessibilityLabel={`${t.roles[role]}. ${roleHint[role]}`}/>)}

   {scopedRoles.includes(current.role)&&<>
    <SectionLabel title={t.segments}/>
    <Text style={{...typo.meta,color:colors.muted,marginBottom:space.sm}}>{t.segmentsHint}</Text>
    {!contracted.length&&<Notice tone="warning" text={t.noContracted}/>}
    {contracted.map(segment=>{
     const fixed=segment.code===VETERINARY_SEGMENT&&current.role==='veterinarian';
     const checked=fixed||current.segments.includes(segment.code);
     const hint=fixed?t.vetIncluded:segment.code===VETERINARY_SEGMENT?t.vetOptIn:undefined;
     return <ListRow key={segment.code} title={t.segmentNames[segment.code]??segment.name} subtitle={hint} selected={checked} disabled={fixed||busy}
      onPress={()=>set({segments:checked?current.segments.filter(code=>code!==segment.code):[...current.segments,segment.code]})}
      accessibilityLabel={`${t.segmentNames[segment.code]??segment.name}${hint?`. ${hint}`:''}`}/>;
    })}
    <ToggleRow label={t.readOnlyLabel} hint={t.readOnlyHint} value={current.operator_read_only} onChange={operator_read_only=>set({operator_read_only})} disabled={busy}/>
   </>}

   {creating&&<>
    <SectionLabel title={t.password}/>
    <Text style={{...typo.meta,color:colors.muted,marginBottom:space.sm}}>{t.passwordHint}</Text>
    <FormField label={t.passwordLabel} error={errors.password&&errorText[errors.password]}><TextInput accessibilityLabel={t.passwordLabel} value={current.password} onChangeText={password=>set({password})} secureTextEntry autoComplete="new-password" textContentType="newPassword" style={ui.fieldControl} editable={!busy}/></FormField>
    <FormField label={t.confirmLabel} error={errors.password_confirm&&errorText[errors.password_confirm]}><TextInput accessibilityLabel={t.confirmLabel} value={current.password_confirm} onChangeText={password_confirm=>set({password_confirm})} secureTextEntry autoComplete="new-password" textContentType="newPassword" style={ui.fieldControl} editable={!busy}/></FormField>
   </>}

   <AgendaButton variant="primary" busy={busy} disabled={busy} label={creating?t.create:t.save} onPress={()=>void save()}/>
   {!creating&&member&&!roleLocked&&<AgendaButton label={member.is_active?t.deactivate:t.activate} disabled={busy} onPress={toggleActive}/>}
  </>}
 </ScrollView></AgendaShell>;
}
