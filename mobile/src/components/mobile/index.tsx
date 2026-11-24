// Native interaction primitives shared by operational screens.
// They complement `features/agenda/ui.tsx` (buttons, fields, pills, tiles) with list-first,
// touch-first patterns: tappable rows, search with clear, chip filters, bottom sheets,
// KPI strips, pull-to-refresh/infinite lists and explicit empty/error states.
import {type PropsWithChildren,type ReactNode,useEffect,useState} from 'react';
import {ActivityIndicator,FlatList,Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View,type StyleProp,type ViewStyle} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg,{Circle,Path} from 'react-native-svg';
import type {Language} from '../../i18n/messages';
import {colors,radius,space,touchTarget,type} from '../../theme/tokens';
import {StatusPill,type StatusTone} from '../../features/agenda/ui';

const pt={clear:'Limpar busca',close:'Fechar',retry:'Tentar novamente',loadingMore:'Carregando mais…',end:'Fim da lista',filter:'Filtrar',open:'Abrir',today:'Voltar para hoje',more:'Ver mais',less:'Ver menos',actions:'O que fazer',details:'Dados do registro',filters:'Filtros',anyPeriod:'Todo o período',last7:'Últimos 7 dias',last30:'Últimos 30 dias',last90:'Últimos 90 dias',thisYear:'Últimos 12 meses',apply:'Aplicar',clearFilters:'Limpar filtros',byDay:'Escolher dia',newRecord:'Novo registro'};
type Copy=Record<keyof typeof pt,string>;
export const mobileUiMessages:Record<Language,Copy>={
 'pt-BR':pt,'pt-PT':{...pt,loadingMore:'A carregar mais…',today:'Voltar a hoje'},
 en:{clear:'Clear search',close:'Close',retry:'Try again',loadingMore:'Loading more…',end:'End of list',filter:'Filter',open:'Open',today:'Back to today',more:'Show more',less:'Show less',actions:'Actions',details:'Record details',filters:'Filters',anyPeriod:'Any time',last7:'Last 7 days',last30:'Last 30 days',last90:'Last 90 days',thisYear:'Last 12 months',apply:'Apply',clearFilters:'Clear filters',byDay:'Pick a day',newRecord:'New record'},
 es:{clear:'Borrar búsqueda',close:'Cerrar',retry:'Reintentar',loadingMore:'Cargando más…',end:'Fin de la lista',filter:'Filtrar',open:'Abrir',today:'Volver a hoy',more:'Ver más',less:'Ver menos',actions:'Acciones',details:'Datos del registro',filters:'Filtros',anyPeriod:'Todo el período',last7:'Últimos 7 días',last30:'Últimos 30 días',last90:'Últimos 90 días',thisYear:'Últimos 12 meses',apply:'Aplicar',clearFilters:'Borrar filtros',byDay:'Elegir día',newRecord:'Nuevo registro'},
};

const toneText:Record<StatusTone,string>={success:colors.success,warning:colors.warning,info:colors.info,danger:colors.error,neutral:colors.neutral};
const toneSurface:Record<StatusTone,string>={success:colors.successSurface,warning:colors.warningSurface,info:colors.infoSurface,danger:colors.errorSurface,neutral:colors.neutralSurface};

export function Chevron({color=colors.muted,size=18}:{color?:string;size?:number}){
 return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden={true}><Path d="m9 5 7 7-7 7"/></Svg>;
}

/** Screen intro inside the shell: where am I + the one primary action of the context. */
export function ScreenIntro({title,subtitle,badge,action}:{title:string;subtitle?:string;badge?:ReactNode;action?:ReactNode}){
 return <View style={m.intro}><View style={m.introText}><Text accessibilityRole="header" style={m.introTitle}>{title}</Text>{!!subtitle&&<Text style={m.introSubtitle}>{subtitle}</Text>}{badge}</View>{action}</View>;
}

/** Compact primary button for headers (e.g. "+ Novo produto"). Full-width form actions keep `AgendaButton variant="primary"`. */
export function HeaderAction({label,onPress,icon='plus'}:{label:string;onPress:()=>void;icon?:'plus'|'none'}){
 return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({pressed})=>[m.headerAction,pressed&&m.pressed]}>{icon==='plus'&&<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.surface} strokeWidth={2.4} strokeLinecap="round" aria-hidden={true}><Path d="M12 5v14M5 12h14"/></Svg>}<Text style={m.headerActionText} numberOfLines={1}>{label}</Text></Pressable>;
}

/** Search field with icon and clear button; reports the debounced value. */
export function SearchBar({value,onChange,placeholder,language,debounce=350}:{value:string;onChange:(value:string)=>void;placeholder:string;language:Language;debounce?:number}){
 const [draft,setDraft]=useState(value),[synced,setSynced]=useState(value);
 // Parent reset (e.g. switching tabs) replaces the draft during render, without an effect.
 if(value!==synced){setSynced(value);if(value!==draft.trim())setDraft(value);}
 useEffect(()=>{const next=draft.trim();if(next===value)return;const id=setTimeout(()=>onChange(next),debounce);return()=>clearTimeout(id);},[draft,value,onChange,debounce]);
 return <View style={m.search}><Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth={2} strokeLinecap="round" aria-hidden={true}><Circle cx={10.5} cy={10.5} r={6.5}/><Path d="m15.5 15.5 5 5"/></Svg>
  <TextInput accessibilityLabel={placeholder} placeholder={placeholder} placeholderTextColor={colors.muted} value={draft} onChangeText={setDraft} onSubmitEditing={()=>onChange(draft.trim())} returnKeyType="search" maxLength={100} autoCorrect={false} style={m.searchInput}/>
  {!!draft&&<Pressable accessibilityRole="button" accessibilityLabel={mobileUiMessages[language].clear} hitSlop={8} onPress={()=>{setDraft('');onChange('');}} style={m.searchClear}><Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth={2.4} strokeLinecap="round" aria-hidden={true}><Path d="M6 6l12 12M18 6 6 18"/></Svg></Pressable>}
 </View>;
}

export type ChipOption<T extends string>={value:T;label:string;count?:number};
/** Horizontally scrollable single-select chips. `trailing` hosts a "more filters" chip. */
export function FilterChips<T extends string>({options,value,onChange,trailing,label}:{options:ChipOption<T>[];value:T;onChange:(value:T)=>void;trailing?:ReactNode;label?:string}){
 return <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={label} style={m.chipScroll} contentContainerStyle={m.chipRow}>{options.map(option=>{const selected=option.value===value;return <Pressable key={option.value} accessibilityRole="button" accessibilityState={{selected}} onPress={()=>onChange(option.value)} style={({pressed})=>[m.chip,selected&&m.chipSelected,pressed&&m.pressed]}><Text style={[m.chipText,selected&&m.chipTextSelected]}>{option.label}{option.count!==undefined?` · ${option.count}`:''}</Text></Pressable>;})}{trailing}</ScrollView>;
}
/** Chip that opens a sheet; shows the current choice so the filter state stays visible. */
export function SelectChip({label,value,active,onPress}:{label:string;value?:string;active:boolean;onPress:()=>void}){
 return <Pressable accessibilityRole="button" accessibilityLabel={value?`${label}: ${value}`:label} onPress={onPress} style={({pressed})=>[m.chip,m.selectChip,active&&m.chipSelected,pressed&&m.pressed]}><Text style={[m.chipText,active&&m.chipTextSelected]} numberOfLines={1}>{value&&active?value:label}</Text><Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={active?colors.surface:colors.textSoft} strokeWidth={2.4} strokeLinecap="round" aria-hidden={true}><Path d="m6 9 6 6 6-6"/></Svg></Pressable>;
}

/** Segmented control for 2–4 short exclusive views. */
export function Segmented<T extends string>({options,value,onChange}:{options:{value:T;label:string}[];value:T;onChange:(value:T)=>void}){
 return <View accessibilityRole="tablist" style={m.segmented}>{options.map(option=>{const selected=option.value===value;return <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{selected}} onPress={()=>onChange(option.value)} style={[m.segment,selected&&m.segmentActive]}><Text style={[m.segmentText,selected&&m.segmentTextActive]} numberOfLines={1}>{option.label}</Text></Pressable>;})}</View>;
}

export type Kpi={key:string;label:string;value:string;tone?:StatusTone;selected?:boolean;onPress?:()=>void;hint?:string};
/** Short row of indicators; a pressable KPI applies the matching filter. */
export function KpiStrip({items}:{items:Kpi[]}){
 return <View style={m.kpis}>{items.map(item=>{const tone=item.tone??'neutral';const body=<><Text style={m.kpiLabel} numberOfLines={2}>{item.label}</Text><Text style={[m.kpiValue,item.tone&&item.tone!=='neutral'&&{color:toneText[tone]}]} numberOfLines={1} adjustsFontSizeToFit>{item.value}</Text>{!!item.hint&&<Text style={m.kpiHint} numberOfLines={2}>{item.hint}</Text>}</>;
  return item.onPress?<Pressable key={item.key} accessibilityRole="button" accessibilityState={{selected:!!item.selected}} accessibilityLabel={`${item.label}: ${item.value}`} onPress={item.onPress} style={({pressed})=>[m.kpi,item.tone&&item.tone!=='neutral'&&{backgroundColor:toneSurface[tone],borderColor:toneSurface[tone]},item.selected&&m.kpiSelected,pressed&&m.pressed]}>{body}</Pressable>:<View key={item.key} style={m.kpi}>{body}</View>;})}</View>;
}

/** Tappable record row: discreet meta, bold identifier, status text, trailing value and chevron. */
export function ListRow({title,meta,subtitle,value,valueCaption,status,leading,onPress,accessibilityLabel,style,extra,disabled=false,selected=false}:{title:string;meta?:string;subtitle?:string;value?:string;valueCaption?:string;status?:{label:string;tone:StatusTone};leading?:ReactNode;onPress?:()=>void;accessibilityLabel?:string;style?:StyleProp<ViewStyle>;extra?:ReactNode;disabled?:boolean;selected?:boolean}){
 const content=<>{leading&&<View style={m.rowLeading}>{leading}</View>}<View style={m.rowBody}>{!!meta&&<Text style={m.rowMeta} numberOfLines={1}>{meta}</Text>}<Text style={m.rowTitle}>{title}</Text>{!!subtitle&&<Text style={m.rowSubtitle} numberOfLines={2}>{subtitle}</Text>}{status&&<View style={m.rowStatus}><StatusPill label={status.label} tone={status.tone}/></View>}{extra}</View>{(!!value||!!valueCaption)&&<View style={m.rowValue}>{!!value&&<Text style={m.rowValueText}>{value}</Text>}{!!valueCaption&&<Text style={m.rowValueCaption}>{valueCaption}</Text>}</View>}{onPress&&<Chevron/>}</>;
 if(!onPress)return <View style={[m.row,selected&&m.rowSelected,style]}>{content}</View>;
 return <Pressable accessibilityRole="button" accessibilityState={{disabled,selected}} disabled={disabled} accessibilityLabel={accessibilityLabel??[meta,title,subtitle,value,valueCaption,status?.label].filter(Boolean).join(', ')} onPress={onPress} style={({pressed})=>[m.row,selected&&m.rowSelected,pressed&&m.rowPressed,disabled&&{opacity:0.55},style]}>{content}</Pressable>;
}

/** Rounded icon tile for list leading slots; categorical tone allowed in soft tiles. */
export function IconTile({children,tone='neutral'}:PropsWithChildren<{tone?:StatusTone|'brand'}>){
 return <View style={[m.iconTile,{backgroundColor:tone==='brand'?colors.primarySoft:toneSurface[tone]}]}>{children}</View>;
}

/** Shortcut chips to related screens ("Movimentações", "Rações"). */
export function Shortcut({label,onPress,icon}:{label:string;onPress:()=>void;icon?:ReactNode}){
 return <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={({pressed})=>[m.shortcut,pressed&&m.pressed]}>{icon}<Text style={m.shortcutText} numberOfLines={1}>{label}</Text><Chevron color={colors.primary} size={14}/></Pressable>;
}

export function SectionLabel({title,trailing}:{title:string;trailing?:ReactNode}){
 return <View style={m.sectionLabel}><Text accessibilityRole="header" style={m.sectionLabelText}>{title}</Text>{trailing}</View>;
}

export function EmptyState({title,description,action}:{title:string;description?:string;action?:ReactNode}){
 return <View style={m.state}><View style={m.stateIcon}><Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden={true}><Path d="M4 7h16v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Zm0 0 2-4h12l2 4M9 12h6"/></Svg></View><Text style={m.stateTitle}>{title}</Text>{!!description&&<Text style={m.stateText}>{description}</Text>}{action}</View>;
}
export function ErrorState({message,onRetry,language}:{message:string;onRetry?:()=>void;language:Language}){
 return <View accessibilityRole="alert" style={[m.state,m.errorState]}><Text style={m.errorText}>{message}</Text>{onRetry&&<Pressable accessibilityRole="button" onPress={onRetry} style={({pressed})=>[m.retry,pressed&&m.pressed]}><Text style={m.retryText}>{mobileUiMessages[language].retry}</Text></Pressable>}</View>;
}
/** Static placeholder rows (no animation: respects reduced motion and low-end devices). */
export function SkeletonList({rows=4}:{rows?:number}){
 return <View aria-hidden style={{gap:space.sm}}>{Array.from({length:rows},(_,i)=><View key={i} style={m.skeletonRow}><View style={m.skeletonIcon}/><View style={{flex:1,gap:6}}><View style={[m.skeletonLine,{width:'40%'}]}/><View style={[m.skeletonLine,{width:'75%',height:14}]}/></View></View>)}</View>;
}
export function ListFooter({loading,end,language}:{loading:boolean;end:boolean;language:Language}){
 const t=mobileUiMessages[language];
 if(loading)return <View style={m.footer}><ActivityIndicator color={colors.primary}/><Text style={m.footerText}>{t.loadingMore}</Text></View>;
 return end?<Text style={[m.footerText,m.footer]}>{t.end}</Text>:null;
}

/** Bottom sheet for short choices; long forms use a full screen. */
export function BottomSheet({visible,title,onClose,children,language}:PropsWithChildren<{visible:boolean;title:string;onClose:()=>void;language:Language}>){
 return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={m.sheetBackdrop}><Pressable style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden onPress={onClose}/><SafeAreaView edges={['bottom']} accessibilityViewIsModal style={m.sheet}><View style={m.sheetHandle}/><View style={m.sheetHeader}><Text accessibilityRole="header" style={m.sheetTitle}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel={mobileUiMessages[language].close} onPress={onClose} style={m.sheetClose}><Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textSoft} strokeWidth={2.2} strokeLinecap="round" aria-hidden={true}><Path d="M6 6l12 12M18 6 6 18"/></Svg></Pressable></View><ScrollView contentContainerStyle={m.sheetContent} keyboardShouldPersistTaps="handled">{children}</ScrollView></SafeAreaView></View></Modal>;
}
/** Selectable option row inside a sheet. */
export function SheetOption({label,selected,onPress}:{label:string;selected:boolean;onPress:()=>void}){
 return <Pressable accessibilityRole="radio" accessibilityState={{checked:selected}} onPress={onPress} style={({pressed})=>[m.option,pressed&&m.rowPressed]}><Text style={[m.optionText,selected&&m.optionTextSelected]}>{label}</Text>{selected&&<Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden={true}><Path d="m5 12 5 5 9-10"/></Svg>}</Pressable>;
}

/** Discreet link to the web alternative; never styled as a native operation. */
export function WebFallback({hint,label,onPress,failed}:{hint:string;label:string;onPress:()=>void;failed?:string}){
 return <View style={m.web}><Text style={m.webHint}>{hint}</Text><Pressable accessibilityRole="link" onPress={onPress} style={({pressed})=>[m.webLink,pressed&&m.pressed]}><Text style={m.webLinkText}>{label} ↗</Text></Pressable>{!!failed&&<Text accessibilityRole="alert" style={m.errorText}>{failed}</Text>}</View>;
}

/** Record header on detail screens: identity, context and situation before complementary fields. */
export function DetailHeader({title,meta,status,leading,children}:PropsWithChildren<{title:string;meta?:string;status?:{label:string;tone:StatusTone}[];leading?:ReactNode}>){
 return <View style={m.detail}><View style={m.detailTop}>{leading}<View style={m.rowBody}>{!!meta&&<Text style={m.rowMeta}>{meta}</Text>}<Text accessibilityRole="header" style={m.detailTitle}>{title}</Text></View></View>{!!status?.length&&<View style={m.pills}>{status.map(s=><StatusPill key={s.label} label={s.label} tone={s.tone}/>)}</View>}{children}</View>;
}
export type Metric={label:string;value:string;unit?:string;tone?:StatusTone};
/** Quantities with unit; wraps to 2 columns on narrow screens. */
export function MetricGrid({items,columns=3}:{items:Metric[];columns?:2|3|4}){
 const basis=columns===4?'22%':columns===2?'45%':'30%';
 return <View style={m.metrics}>{items.map(item=><View key={item.label} style={[m.metric,{flexBasis:basis}]}><Text style={m.kpiLabel} numberOfLines={2}>{item.label}</Text><Text style={[m.metricValue,item.tone&&item.tone!=='neutral'&&{color:toneText[item.tone]}]}>{item.value}{!!item.unit&&<Text style={m.metricUnit}> {item.unit}</Text>}</Text></View>)}</View>;
}
/** Label/value pairs for complementary fields of a record. */
export function InfoList({rows}:{rows:[string,string|null|undefined][]}){
 const visible=rows.filter((r):r is [string,string]=>!!r[1]);
 if(!visible.length)return null;
 return <View style={m.info}>{visible.map(([label,value],i)=><View key={`${i}:${label}`} style={[m.infoRow,i>0&&m.infoDivider]}><Text style={m.infoLabel}>{label}</Text><Text style={m.infoValue} selectable>{value}</Text></View>)}</View>;
}
/** Grouped navigation/actions on a detail: icon, verb label, optional description, chevron. */
export function ActionGroup({children}:PropsWithChildren){
 return <View style={m.actionGroup}>{children}</View>;
}
export function ActionRow({label,description,icon,onPress,tone='brand',disabled=false}:{label:string;description?:string;icon?:ReactNode;onPress:()=>void;tone?:StatusTone|'brand';disabled?:boolean}){
 return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} accessibilityLabel={description?`${label}. ${description}`:label} onPress={onPress} style={({pressed})=>[m.actionRow,pressed&&m.rowPressed,disabled&&{opacity:0.5}]}>{icon&&<IconTile tone={tone}>{icon}</IconTile>}<View style={m.rowBody}><Text style={m.actionLabel}>{label}</Text>{!!description&&<Text style={m.rowSubtitle}>{description}</Text>}</View><Chevron/></Pressable>;
}
/** Inline notice with semantic tone (read-only, aggregated data, warnings). */
export function Notice({text,tone='info'}:{text:string;tone?:StatusTone}){
 return <View accessibilityRole={tone==='danger'?'alert':undefined} style={[m.notice,{backgroundColor:toneSurface[tone]}]}><Text style={[m.noticeText,{color:toneText[tone]}]}>{text}</Text></View>;
}
const isoDay=(value:Date)=>value.toISOString().slice(0,10);
export type PeriodPreset='any'|'7'|'30'|'90'|'365';
/** Rolling period ending today (device date) as ISO start/end; 'any' clears the period. */
export function presetRange(preset:PeriodPreset){if(preset==='any')return {start:'',end:''};const end=new Date(),start=new Date();start.setDate(start.getDate()-(Number(preset)-1));return {start:isoDay(start),end:isoDay(end)};}
export function presetOptions(language:Language):ChipOption<PeriodPreset>[]{const t=mobileUiMessages[language];return [{value:'any',label:t.anyPeriod},{value:'7',label:t.last7},{value:'30',label:t.last30},{value:'90',label:t.last90},{value:'365',label:t.thisYear}];}
const shiftDay=(day:string,delta:number)=>{const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+delta);return isoDay(d);};
/** Day navigation (‹ date ›) with a shortcut back to today; no free typing of ISO dates. */
export function DateStepper({value,onChange,max,min,language,format}:{value:string;onChange:(day:string)=>void;max?:string;min?:string;language:Language;format?:(day:string)=>string}){
 const prev=shiftDay(value,-1),next=shiftDay(value,1);
 const canPrev=!min||prev>=min,canNext=!max||next<=max;
 const label=format?format(value):new Intl.DateTimeFormat(language,{weekday:'short',day:'2-digit',month:'long',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
 const arrow=(dir:'prev'|'next',enabled:boolean,target:string)=><Pressable accessibilityRole="button" accessibilityLabel={`${dir==='prev'?'‹':'›'} ${target}`} accessibilityState={{disabled:!enabled}} disabled={!enabled} onPress={()=>onChange(target)} style={({pressed})=>[m.stepper,pressed&&m.pressed,!enabled&&{opacity:0.35}]}><Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden={true}><Path d={dir==='prev'?'m15 18-6-6 6-6':'m9 5 7 7-7 7'}/></Svg></Pressable>;
 return <View style={m.dateRow}>{arrow('prev',canPrev,prev)}<View style={m.dateCenter}><Text style={m.dateLabel} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>{!!max&&value!==max&&<Pressable accessibilityRole="button" onPress={()=>onChange(max)} hitSlop={10}><Text style={m.dateToday}>{mobileUiMessages[language].today}</Text></Pressable>}</View>{arrow('next',canNext,next)}</View>;
}

type PickerList<T>={rows:T[];isPending:boolean;isError:boolean;refetch:()=>unknown;loadMore:()=>void;isFetchingNextPage:boolean;hasNextPage:boolean};
/** Full-screen selection for long catalogs (animals, batches, products): close bar, search, infinite list. */
export function PickerModal<T>({title,language,onClose,search,onSearch,searchPlaceholder,list,renderItem,keyExtractor,emptyLabel,errorLabel,header}:{title:string;language:Language;onClose:()=>void;search?:string;onSearch?:(value:string)=>void;searchPlaceholder?:string;list:PickerList<T>;renderItem:(item:T)=>ReactNode;keyExtractor:(item:T)=>string;emptyLabel:string;errorLabel:string;header?:ReactNode}){
 const t=mobileUiMessages[language];
 return <Modal animationType="slide" onRequestClose={onClose}><SafeAreaView style={m.pickerSafe} edges={['top','left','right','bottom']}>
  <View style={m.pickerBar}><Pressable accessibilityRole="button" accessibilityLabel={t.close} onPress={onClose} style={m.sheetClose}><Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.forest} strokeWidth={2.2} strokeLinecap="round" aria-hidden={true}><Path d="M6 6l12 12M18 6 6 18"/></Svg></Pressable><Text accessibilityRole="header" style={m.pickerTitle} numberOfLines={2}>{title}</Text></View>
  <FlatList<T> data={list.isError?[]:list.rows} keyExtractor={keyExtractor} renderItem={({item})=><>{renderItem(item)}</>} contentContainerStyle={[mobileStyles.list,{paddingBottom:space.xxl}]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" onEndReached={list.loadMore} onEndReachedThreshold={0.4}
   ListHeaderComponent={<View style={mobileStyles.header}>{header}{onSearch&&<SearchBar value={search??''} onChange={onSearch} placeholder={searchPlaceholder??title} language={language}/>}</View>}
   ListEmptyComponent={list.isPending?<SkeletonList/>:list.isError?<ErrorState message={errorLabel} language={language} onRetry={()=>void list.refetch()}/>:<EmptyState title={emptyLabel}/>}
   ListFooterComponent={list.rows.length?<ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/>:undefined}/>
 </SafeAreaView></Modal>;
}

/** Device-local ISO day (YYYY-MM-DD). */
export const localToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
/** Optional single-day filter: "all dates" chip or a day stepper capped at today. */
export function DayFilter({value,onChange,language,allLabel}:{value:string;onChange:(day:string)=>void;language:Language;allLabel:string}){
 const today=localToday();
 return <View style={{gap:space.sm}}><FilterChips value={value?'day':'all'} onChange={v=>onChange(v==='all'?'':value||today)} options={[{value:'all',label:allLabel},{value:'day',label:value?new Intl.DateTimeFormat(language,{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`)):mobileUiMessages[language].byDay}]}/>{!!value&&<DateStepper value={value} max={today} onChange={onChange} language={language}/>}</View>;
}

export const mobileStyles=StyleSheet.create({
 list:{width:'100%',maxWidth:720,alignSelf:'center',paddingHorizontal:space.lg,paddingTop:space.md,paddingBottom:96,gap:space.sm},
 header:{gap:space.md,paddingBottom:space.xs},
 wrap:{flexDirection:'row',flexWrap:'wrap',gap:space.sm},
});
const m=StyleSheet.create({
 pressed:{opacity:0.7},
 intro:{flexDirection:'row',alignItems:'flex-start',gap:space.md},
 introText:{flex:1,minWidth:0,gap:2},
 introTitle:{...type.screenTitle},
 introSubtitle:{...type.meta},
 headerAction:{flexDirection:'row',alignItems:'center',gap:6,minHeight:touchTarget,paddingHorizontal:14,borderRadius:radius.pill,backgroundColor:colors.primary,maxWidth:200},
 headerActionText:{fontSize:14,fontWeight:'700',color:colors.surface,flexShrink:1},
 search:{flexDirection:'row',alignItems:'center',gap:space.sm,minHeight:48,paddingLeft:14,paddingRight:6,borderRadius:radius.md,borderWidth:1,borderColor:colors.inputBorder,backgroundColor:colors.surface},
 searchInput:{flex:1,minWidth:0,minHeight:46,fontSize:16,color:colors.text},
 searchClear:{width:touchTarget-8,height:touchTarget-8,alignItems:'center',justifyContent:'center',borderRadius:radius.pill,backgroundColor:colors.track},
 chipScroll:{flexGrow:0,marginHorizontal:-space.lg},
 chipRow:{flexDirection:'row',alignItems:'center',gap:space.sm,paddingHorizontal:space.lg},
 chip:{minHeight:touchTarget-4,minWidth:touchTarget,justifyContent:'center',alignItems:'center',paddingHorizontal:14,borderRadius:radius.pill,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.inputBorder},
 selectChip:{flexDirection:'row',gap:4,maxWidth:220},
 chipSelected:{backgroundColor:colors.primary,borderColor:colors.primary},
 chipText:{fontSize:14,fontWeight:'600',color:colors.textSoft,...type.numeric},
 chipTextSelected:{color:colors.surface},
 segmented:{flexDirection:'row',backgroundColor:colors.track,borderRadius:radius.md,padding:3,gap:3},
 segment:{flex:1,minHeight:touchTarget-4,justifyContent:'center',alignItems:'center',paddingHorizontal:space.sm,borderRadius:9},
 segmentActive:{backgroundColor:colors.surface,boxShadow:'0 1px 3px rgba(22,63,44,0.12)'},
 segmentText:{fontSize:14,fontWeight:'600',color:colors.muted},
 segmentTextActive:{color:colors.forest,fontWeight:'700'},
 kpis:{flexDirection:'row',gap:space.sm},
 kpi:{flex:1,minWidth:0,gap:2,padding:space.md,borderRadius:radius.lg,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface},
 kpiSelected:{borderColor:colors.primary,borderWidth:2},
 kpiLabel:{...type.caption,fontWeight:'600'},
 kpiValue:{fontSize:22,fontWeight:'800',letterSpacing:-0.4,color:colors.forest,...type.numeric},
 kpiHint:{...type.caption},
 row:{flexDirection:'row',alignItems:'center',gap:space.md,minHeight:64,paddingVertical:space.md,paddingHorizontal:14,borderRadius:radius.lg,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface},
 rowPressed:{backgroundColor:colors.primarySoft},
 rowSelected:{borderColor:colors.primary,borderWidth:2,backgroundColor:colors.primarySoft},
 rowLeading:{alignSelf:'flex-start'},
 rowBody:{flex:1,minWidth:0,gap:2},
 rowMeta:{...type.caption,fontWeight:'600',textTransform:'uppercase',letterSpacing:0.3},
 rowTitle:{fontSize:16,lineHeight:21,fontWeight:'700',color:colors.forest},
 rowSubtitle:{...type.meta},
 rowStatus:{marginTop:4},
 rowValue:{alignItems:'flex-end',maxWidth:'40%'},
 rowValueText:{fontSize:16,fontWeight:'800',color:colors.forest,textAlign:'right',...type.numeric},
 rowValueCaption:{...type.caption,textAlign:'right'},
 iconTile:{width:40,height:40,borderRadius:radius.md,alignItems:'center',justifyContent:'center'},
 shortcut:{flexDirection:'row',alignItems:'center',gap:6,minHeight:touchTarget,paddingHorizontal:space.md,borderRadius:radius.md,backgroundColor:colors.primarySoft,flexShrink:1},
 shortcutText:{fontSize:14,fontWeight:'600',color:colors.primary,flexShrink:1},
 sectionLabel:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:space.sm,marginTop:space.sm},
 sectionLabelText:{...type.caption,fontWeight:'700',textTransform:'uppercase',letterSpacing:0.4},
 state:{alignItems:'center',gap:space.sm,paddingVertical:space.xl,paddingHorizontal:space.lg},
 stateIcon:{width:52,height:52,borderRadius:26,alignItems:'center',justifyContent:'center',backgroundColor:colors.primarySoft},
 stateTitle:{...type.recordTitle,textAlign:'center'},
 stateText:{...type.meta,textAlign:'center'},
 errorState:{borderRadius:radius.lg,backgroundColor:colors.errorSurface},
 errorText:{fontSize:14,lineHeight:20,color:colors.error,textAlign:'center'},
 retry:{minHeight:touchTarget,justifyContent:'center',paddingHorizontal:space.lg,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.error},
 retryText:{fontSize:14,fontWeight:'700',color:colors.error},
 skeletonRow:{flexDirection:'row',alignItems:'center',gap:space.md,padding:14,borderRadius:radius.lg,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.divider},
 skeletonIcon:{width:40,height:40,borderRadius:radius.md,backgroundColor:colors.track},
 skeletonLine:{height:10,borderRadius:5,backgroundColor:colors.track},
 footer:{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:space.sm,paddingVertical:space.lg},
 footerText:{...type.caption,textAlign:'center'},
 sheetBackdrop:{flex:1,justifyContent:'flex-end',backgroundColor:colors.overlay},
 sheet:{maxHeight:'80%',backgroundColor:colors.surface,borderTopLeftRadius:radius.sheet,borderTopRightRadius:radius.sheet,paddingTop:space.sm},
 sheetHandle:{alignSelf:'center',width:40,height:4,borderRadius:2,backgroundColor:colors.border,marginBottom:space.xs},
 sheetHeader:{flexDirection:'row',alignItems:'center',paddingLeft:space.lg,paddingRight:space.xs},
 sheetTitle:{...type.sectionTitle,flex:1},
 sheetClose:{width:touchTarget,height:touchTarget,alignItems:'center',justifyContent:'center'},
 sheetContent:{paddingHorizontal:space.lg,paddingBottom:space.lg},
 option:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:space.md,minHeight:52,paddingHorizontal:space.xs,borderBottomWidth:1,borderColor:colors.divider},
 optionText:{fontSize:16,color:colors.text,flexShrink:1},
 optionTextSelected:{color:colors.primary,fontWeight:'700'},
 detail:{gap:space.md,padding:space.lg,borderRadius:radius.lg,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface},
 detailTop:{flexDirection:'row',alignItems:'center',gap:space.md},
 detailTitle:{fontSize:20,lineHeight:26,fontWeight:'800',letterSpacing:-0.3,color:colors.forest},
 pills:{flexDirection:'row',flexWrap:'wrap',gap:6},
 metrics:{flexDirection:'row',flexWrap:'wrap',gap:space.sm},
 metric:{flexGrow:1,minWidth:92,gap:2,paddingVertical:10,paddingHorizontal:space.md,borderRadius:radius.md,backgroundColor:colors.background},
 metricValue:{fontSize:18,fontWeight:'800',letterSpacing:-0.2,color:colors.forest,...type.numeric},
 metricUnit:{fontSize:13,fontWeight:'600',color:colors.muted},
 info:{borderRadius:radius.lg,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface,paddingHorizontal:space.lg},
 infoRow:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:space.sm,paddingVertical:space.md},
 infoDivider:{borderTopWidth:1,borderColor:colors.divider},
 infoLabel:{...type.meta,flexShrink:0,maxWidth:'45%'},
 infoValue:{fontSize:15,lineHeight:21,fontWeight:'600',color:colors.text,flexShrink:1,textAlign:'right',...type.numeric},
 actionGroup:{borderRadius:radius.lg,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface,overflow:'hidden'},
 actionRow:{flexDirection:'row',alignItems:'center',gap:space.md,minHeight:56,paddingVertical:10,paddingHorizontal:14,borderBottomWidth:1,borderColor:colors.divider},
 actionLabel:{fontSize:15,lineHeight:20,fontWeight:'700',color:colors.forest},
 notice:{paddingVertical:10,paddingHorizontal:space.md,borderRadius:radius.md},
 noticeText:{fontSize:13,lineHeight:19,fontWeight:'600'},
 dateRow:{flexDirection:'row',alignItems:'center',gap:space.sm,padding:4,borderRadius:radius.lg,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.borderSoft},
 stepper:{width:touchTarget,height:touchTarget,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:colors.primarySoft},
 dateCenter:{flex:1,minWidth:0,alignItems:'center'},
 dateLabel:{fontSize:16,fontWeight:'700',color:colors.forest,textTransform:'capitalize',...type.numeric},
 dateToday:{fontSize:13,fontWeight:'700',color:colors.primary,textDecorationLine:'underline'},
 pickerSafe:{flex:1,backgroundColor:colors.background},
 pickerBar:{flexDirection:'row',alignItems:'center',gap:space.xs,paddingHorizontal:space.xs,paddingVertical:space.xs,borderBottomWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface},
 pickerTitle:{...type.sectionTitle,flex:1},
 web:{gap:space.xs,paddingTop:space.lg,alignItems:'center'},
 webHint:{...type.caption,textAlign:'center'},
 webLink:{minHeight:touchTarget,justifyContent:'center',paddingHorizontal:space.md},
 webLinkText:{fontSize:14,fontWeight:'600',color:colors.primary,textDecorationLine:'underline'},
});
