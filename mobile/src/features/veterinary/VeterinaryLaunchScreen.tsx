import {useEffect, useRef, useState, type ComponentProps} from 'react';
import {KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View} from 'react-native';
import {useLocalSearchParams, useRouter} from 'expo-router';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {z} from 'zod';
import {useAuth} from '../auth/AuthProvider';
import {AgendaButton, AgendaShell, Busy, StatusPill, styles as s} from '../agenda/ui';
import {VetSaveRejected, VetSaveUnconfirmed} from '../../services/authApi';
import {canUseVeterinary, vetCategories, type VetClient, type VetWorkspace} from './contracts';
import {
  addDays, blankLaunch, launchBranch, launchPayload, proposedPregnancy, protocolSteps, vetConducts, vetDiscardReasons, vetMethods,
  type LaunchForm, type VetRegisterResult,
} from './launchContracts';
import {fill, veterinaryMessages} from './messages';

type Outcome={kind:'saved';result:VetRegisterResult}|{kind:'unknown'}|null;

/** VT01 · Lançar atendimento: one procedure for one animal, sent online and confirmed by the server. */
export function VeterinaryLaunchScreen(){
  const params=useLocalSearchParams();
  const preset=z.object({client:z.uuid().optional(),animal:z.string().max(60).optional()}).safeParse(params);
  const {state,controller,language}=useAuth();
  const router=useRouter();
  const t=veterinaryMessages[language],l=t.launch;
  const allowed=state.status==='signedIn'&&canUseVeterinary(state.session.user);
  const workspace=useQuery({queryKey:['vet-workspace'],enabled:allowed,queryFn:({signal})=>controller.vetWorkspace(signal)});
  const clients=useQuery({queryKey:['vet-clients'],enabled:allowed,queryFn:({signal})=>controller.vetClients(signal)});
  const back=()=>router.canGoBack()?router.back():router.replace('/veterinary');
  if(!allowed)return <AgendaShell title={l.title} backLabel={t.back} onBack={back}><View style={s.content}><Text style={s.error}>{t.noAccess}</Text></View></AgendaShell>;
  if(workspace.isError||clients.isError)return <AgendaShell title={l.title} backLabel={t.back} onBack={back}><View style={s.content}><Text accessibilityRole="alert" style={s.error}>{t.error}</Text><AgendaButton label={t.retry} onPress={()=>{void workspace.refetch();void clients.refetch();}}/></View></AgendaShell>;
  if(!workspace.data||!clients.data)return <AgendaShell title={l.title} backLabel={t.back} onBack={back}><View style={s.content}><Busy label={t.loading}/></View></AgendaShell>;
  // The form starts once the workspace (today, team, last responsible) and the clients are known.
  const last=workspace.data.settings?.last_responsible??'';
  const member=workspace.data.team.find(user=>user.name===last);
  const wanted=preset.success?preset.data.client:undefined;
  const client=wanted&&clients.data.some(c=>c.id===wanted)?wanted:clients.data[0]?.id??'';
  const initial={...blankLaunch(client,workspace.data.today,last,member?.id??''),animal:preset.success?preset.data.animal??'':''};
  return <LaunchFormBody initial={initial} workspace={workspace.data} clients={clients.data} onBack={back}/>;
}

function LaunchFormBody({initial,workspace,clients,onBack}:{initial:LaunchForm;workspace:VetWorkspace;clients:VetClient[];onBack:()=>void}){
  const {controller,language}=useAuth();
  const router=useRouter();
  const queryClient=useQueryClient();
  const t=veterinaryMessages[language],l=t.launch;
  const back=onBack;
  const [form,setForm]=useState<LaunchForm>(initial);
  const [typed,setTyped]=useState(initial.animal.trim());
  const [problem,setProblem]=useState('');
  const [busy,setBusy]=useState(false);
  const [outcome,setOutcome]=useState<Outcome>(null);
  const lock=useRef(false);
  const today=workspace.today;

  // Debounced lookup of the typed animal in the chosen client (decides which questions apply).
  useEffect(()=>{const timer=setTimeout(()=>setTyped(form.animal.trim()),450);return ()=>clearTimeout(timer);},[form.animal]);
  const lookupKey=form.client&&typed?['vet-lookup',form.client,typed]:null;
  const lookup=useQuery({queryKey:lookupKey??['vet-lookup-idle'],enabled:!!lookupKey,staleTime:0,gcTime:0,queryFn:async({signal})=>{
    const result=await controller.vetLookup(form.client,typed,signal);
    // Answers that depend on the animal found are prefilled once per lookup (as on the web).
    if(result.found)setForm(f=>{
      if(f.animal.trim()!==typed||f.client!==form.client)return f;
      const next={...f,stepDone:'' as const,edit:false};
      if(!f.category)next.category=result.category;
      if(result.pending_step)next.stepDate=result.pending_step.date>today?today:result.pending_step.date;
      if(result.status==='protocol'&&result.source){next.stepDate=result.source.insemination_date>today?today:result.source.insemination_date;next.stepBull=result.source.bull;}
      if(result.default_coverage_method&&!f.method)next.method=result.default_coverage_method;
      return next;
    });
    return result;
  }});
  const found=lookup.data?.found?lookup.data:null;
  const lookupFor=lookupKey&&lookup.data&&!lookup.isFetching?lookup.data:null;

  const set=(patch:Partial<LaunchForm>)=>{setProblem('');setForm(f=>({...f,...patch}));};
  const date=(day:string)=>new Intl.DateTimeFormat(language,{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(`${day}T12:00:00Z`));
  const isNewClient=!form.client;
  const branch=launchBranch(isNewClient?null:lookupFor);
  const proposal=proposedPregnancy(form,isNewClient?null:lookupFor);
  const team=workspace.team;
  const disabled=busy||outcome?.kind==='unknown';

  const save=async()=>{
    if(lock.current||disabled)return;
    const built=launchPayload(form,isNewClient?null:lookupFor,today);
    if('problem' in built){setProblem(l.problems[built.problem]??l.rejected);return;}
    lock.current=true;setBusy(true);setProblem('');
    try{
      const result=await controller.vetRegister(built.payload);
      setOutcome({kind:'saved',result});
      void queryClient.invalidateQueries({queryKey:['vet-animals']});void queryClient.invalidateQueries({queryKey:['vet-workspace']});void queryClient.invalidateQueries({queryKey:['vet-clients']});
    }catch(error){
      if(error instanceof VetSaveUnconfirmed)setOutcome({kind:'unknown'});
      else setProblem(error instanceof VetSaveRejected&&error.message?error.message:l.rejected);
    }finally{lock.current=false;setBusy(false);}
  };

  const restart=()=>{setOutcome(null);setProblem('');setTyped('');setForm(f=>blankLaunch(outcome?.kind==='saved'?outcome.result.client.id:f.client,f.date,f.responsible,f.responsibleUser));};

  if(outcome?.kind==='saved'){
    const r=outcome.result;
    return <AgendaShell title={l.title} backLabel={t.back} onBack={back}><ScrollView contentContainerStyle={s.content}>
      <View style={s.card}>
        <Text accessibilityRole="alert" style={s.title}>{fill(r.animal_created?l.savedNew:l.saved,{animal:r.animal.identifier})}</Text>
        <Text style={s.body}>{r.client.name} · {date(r.procedure.date)}</Text>
        {r.alerts.length>0&&<><Text style={s.body}>{fill(l.alertsCreated,{count:r.alerts.length})}</Text>{r.alerts.map(a=><Text key={`${a.kind}-${a.date}`} style={s.muted}>• {date(a.date)} · {fill(t.nextCode[`alert_${a.kind}`]??a.kind,{day:a.day??''})}</Text>)}</>}
      </View>
      <AgendaButton variant="primary" label={l.another} onPress={restart}/>
      <AgendaButton label={l.toList} onPress={()=>router.replace('/veterinary')}/>
    </ScrollView></AgendaShell>;
  }

  const chips=<T extends string>(values:readonly T[],current:string,label:(v:T)=>string,pick:(v:T)=>void)=><View style={s.row}>{values.map(v=><AgendaButton key={v} label={label(v)} selected={current===v} disabled={disabled} onPress={()=>pick(v)}/>)}</View>;
  const field=(label:string,value:string,onChange:(v:string)=>void,extra:Partial<ComponentProps<typeof TextInput>>={})=><View style={{gap:6}}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} style={s.input} value={value} onChangeText={onChange} editable={!disabled} autoCorrect={false} {...extra}/></View>;

  return <AgendaShell title={l.title} backLabel={t.back} onBack={back}>
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={s.title}>{l.data}</Text>
        <Text style={s.label}>{l.client}</Text>
        <View style={s.row}>
          {clients.map(c=><AgendaButton key={c.id} label={c.farm_name?`${c.name} · ${c.farm_name}`:c.name} selected={form.client===c.id} disabled={disabled} onPress={()=>set({client:c.id,category:'',stepDone:''})}/>)}
          <AgendaButton label={l.newClient} selected={isNewClient} disabled={disabled} onPress={()=>set({client:''})}/>
        </View>
        {isNewClient&&field(l.clientName,form.newClient,v=>set({newClient:v}),{maxLength:150,autoCapitalize:'words'})}
        {field(l.date,form.date,v=>set({date:v}),{maxLength:10,autoCapitalize:'none',keyboardType:'numbers-and-punctuation'})}
        <Text style={s.label}>{l.responsible}</Text>
        {team.length>0&&<View style={s.row}>
          {team.map(u=><AgendaButton key={u.id} label={u.name} selected={form.responsibleUser===u.id} disabled={disabled} onPress={()=>set({responsibleUser:u.id,responsible:u.name})}/>)}
          <AgendaButton label={l.typed} selected={!form.responsibleUser} disabled={disabled} onPress={()=>set({responsibleUser:''})}/>
        </View>}
        {!form.responsibleUser&&<TextInput accessibilityLabel={l.responsible} placeholder={l.responsiblePlaceholder} style={s.input} value={form.responsible} onChangeText={v=>set({responsible:v})} editable={!disabled} maxLength={120}/>}

        <Text accessibilityRole="header" style={s.title}>{l.animal}</Text>
        <Text style={s.muted}>{l.animalHint}</Text>
        <TextInput accessibilityLabel={l.animal} placeholder={l.animalPlaceholder} style={s.input} value={form.animal} onChangeText={v=>set({animal:v,category:'',diagnosis:'',conduct:'',stepDone:''})} editable={!disabled} maxLength={60} autoCorrect={false} autoCapitalize="none"/>
        {!isNewClient&&typed&&lookup.isFetching&&<Text style={s.muted}>{l.checking}</Text>}
        {!isNewClient&&lookupFor&&(lookupFor.found
          ?<View style={s.card}><View style={s.row}><StatusPill label={l.known} tone="success"/><StatusPill label={t.status[lookupFor.status]}/></View><Text style={s.body}>{l.nextStep}: {fill(t.nextCode[lookupFor.next.code]??lookupFor.next.code,{day:lookupFor.next.day??''})}{lookupFor.next.date?` · ${date(lookupFor.next.date)}`:''}</Text></View>
          :<Text style={s.muted}>{l.isNew}</Text>)}
        {(isNewClient||form.animal.trim())&&<>
          {branch==='step'&&found?.pending_step&&<View style={s.card}>
            <Text style={s.title}>{fill(l.stepTitle,{step:fill(t.nextCode[`alert_${found.pending_step.kind}`]??found.pending_step.kind,{day:found.pending_step.day??''})})}</Text>
            <Text style={s.muted}>{fill(l.plannedOn,{date:date(found.pending_step.date)})}</Text>
            {chips(['yes','no'] as const,form.stepDone,v=>v==='yes'?l.done:l.notDone,v=>set({stepDone:v}))}
            {form.stepDone==='yes'&&field(l.doneDate,form.stepDate,v=>set({stepDate:v}),{maxLength:10,autoCapitalize:'none',keyboardType:'numbers-and-punctuation'})}
          </View>}
          {branch==='iatf'&&<View style={s.card}>
            <Text style={s.title}>{l.iatfTitle}</Text>
            {chips(['yes','no'] as const,form.stepDone,v=>v==='yes'?l.done:l.notDone,v=>set({stepDone:v}))}
            {form.stepDone==='yes'&&<>{field(l.doneDate,form.stepDate,v=>set({stepDate:v}),{maxLength:10,autoCapitalize:'none',keyboardType:'numbers-and-punctuation'})}{field(l.bull,form.stepBull,v=>set({stepBull:v}),{maxLength:120})}</>}
          </View>}
          {branch==='diagnosis'&&<>
            <Text style={s.label}>{l.category}</Text>
            {found&&<Text style={s.muted}>{l.categoryHint}</Text>}
            {chips(vetCategories,form.category,v=>t.category[v]??v,v=>set({category:v}))}
            <Text style={s.label}>{l.diagnosis}</Text>
            {chips(['pregnant','open'] as const,form.diagnosis,v=>v==='pregnant'?l.pregnant:l.open,v=>set({diagnosis:v}))}
            {form.diagnosis==='open'&&<>
              <Text style={s.label}>{l.conduct}</Text>
              {chips(vetConducts,form.conduct,v=>l.conducts[v]??v,v=>set({conduct:v}))}
              {form.conduct==='iatf_protocol'&&<View style={s.card}>
                <Text style={s.label}>{l.management}</Text>
                {chips(['10','11'] as const,String(form.management),v=>v,v=>set({management:v==='11'?11:10}))}
                {chips(['cycling','not_cycling'] as const,form.cycling,v=>v==='cycling'?l.cycling:l.notCycling,v=>set({cycling:v}))}
                {field(l.protocolStart,form.protocolStart||form.date,v=>set({protocolStart:v}),{maxLength:10,autoCapitalize:'none',keyboardType:'numbers-and-punctuation'})}
                <Text style={s.muted}>{l.protocolAlerts}</Text>
                {/^\d{4}-\d{2}-\d{2}$/.test(form.protocolStart||form.date)&&protocolSteps(form.management,form.protocolStart||form.date).map(step=><Text key={step.kind} style={s.muted}>• {date(step.date)} · {fill(t.nextCode[step.kind]??step.kind,{day:step.day})}</Text>)}
              </View>}
              {(form.conduct==='observe_heat'||form.conduct==='induction')&&field(l.returnDays,form.returnDays,v=>set({returnDays:v.replace(/\D/g,'')}),{keyboardType:'number-pad',maxLength:3,placeholder:form.conduct==='observe_heat'?'21':'10'})}
              {form.conduct==='discard'&&<><Text style={s.label}>{l.discardReason}</Text>{chips(vetDiscardReasons,form.discard,v=>l.discard[v]??v,v=>set({discard:v}))}</>}
            </>}
            {form.diagnosis==='pregnant'&&<>
              <Text style={s.label}>{l.method}</Text>
              {chips(vetMethods,form.method,v=>l.methods[v]??v,v=>set({method:v}))}
              {proposal
                ?<View style={s.card}><Text style={s.body}>{fill(l.proposed,{date:date(proposal.coverage),calving:date(proposal.calving),bull:proposal.bull?fill(l.proposedBull,{bull:proposal.bull}):''})}</Text><AgendaButton label={l.fix} disabled={disabled} onPress={()=>set({edit:true})}/></View>
                :<>
                  {field(l.gestation,form.gestation,v=>set({gestation:v.replace(/\D/g,'')}),{keyboardType:'number-pad',maxLength:3})}
                  {/^\d+$/.test(form.gestation)&&/^\d{4}-\d{2}-\d{2}$/.test(form.date)&&<Text style={s.muted}>{fill(l.calving,{date:date(addDays(addDays(form.date,-parseInt(form.gestation,10)),283))})}</Text>}
                  {form.edit&&found?.source&&<AgendaButton label={l.useProposed} disabled={disabled} onPress={()=>set({edit:false})}/>}
                </>}
            </>}
          </>}
        </>}

        {field(l.notes,form.notes,v=>set({notes:v}),{maxLength:500,multiline:true,style:[s.input,{minHeight:80,textAlignVertical:'top'}]})}
        <Text style={s.muted}>{l.inputsWeb}</Text>
        {!!problem&&<Text accessibilityRole="alert" style={s.error}>{problem}</Text>}
        {outcome?.kind==='unknown'&&<View style={s.card}><Text accessibilityRole="alert" style={s.error}>{l.unknown}</Text><AgendaButton label={l.check} onPress={()=>router.replace('/veterinary')}/></View>}
        <AgendaButton variant="primary" busy={busy} label={busy?l.saving:l.save} disabled={disabled} onPress={()=>void save()}/>
      </ScrollView>
    </KeyboardAvoidingView>
  </AgendaShell>;
}
