import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, radius, space, touchTarget, type } from '../../theme/tokens';
export function AgendaShell({title,backLabel,onBack,children}:PropsWithChildren<{title:string;backLabel:string;onBack:()=>void}>) {
  return <SafeAreaView style={styles.safe}><StatusBar style="dark"/><View style={styles.header}><AgendaButton label={`‹ ${backLabel}`} onPress={onBack}/><Text accessibilityRole="header" style={styles.heading}>{title}</Text></View>{children}</SafeAreaView>;
}
// `primary` is reserved for the one main action of a screen (save/confirm/send): full width and prominent.
export function AgendaButton({label,onPress,selected=false,disabled=false,busy=false,variant='secondary',accessibilityLabel,style}:{label:string;onPress:()=>void;selected?:boolean;disabled?:boolean;busy?:boolean;variant?:'primary'|'secondary';accessibilityLabel?:string;style?:StyleProp<ViewStyle>}) {
  const primary=variant==='primary';
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel??label} accessibilityState={{selected,disabled,busy}} disabled={disabled} onPress={onPress} style={({pressed})=>[styles.button,primary&&styles.primaryButton,selected&&styles.selected,pressed&&styles.pressed,disabled&&styles.dim,style]}>{busy&&<ActivityIndicator size="small" color={primary?colors.surface:colors.primary}/>}<Text style={[styles.buttonText,primary&&styles.primaryButtonText,selected&&styles.selectedText]} numberOfLines={primary?2:1}>{label}</Text></Pressable>;
}
export function Busy({label}:{label:string}) { return <View style={styles.state}><ActivityIndicator color={colors.primary}/><Text style={styles.body}>{label}</Text></View>; }

export type StatusTone='success'|'warning'|'info'|'danger'|'neutral';
const toneColors:Record<StatusTone,{bg:string;fg:string}>={
  success:{bg:colors.successSurface,fg:colors.success},warning:{bg:colors.warningSurface,fg:colors.warning},
  info:{bg:colors.infoSurface,fg:colors.info},danger:{bg:colors.errorSurface,fg:colors.error},neutral:{bg:colors.neutralSurface,fg:colors.neutral},
};
// Status is always text; the dot and tone only reinforce it.
export function StatusPill({label,tone='neutral'}:{label:string;tone?:StatusTone}) {
  const c=toneColors[tone];
  return <View style={[styles.pill,{backgroundColor:c.bg}]}><View aria-hidden style={[styles.pillDot,{backgroundColor:c.fg}]}/><Text style={[styles.pillText,{color:c.fg}]}>{label}</Text></View>;
}

// Label stays visible, the unit sits beside the value and the error is attached to the input.
export function FormField({label,unit,hint,error,children}:PropsWithChildren<{label:string;unit?:string;hint?:string;error?:string}>) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={[styles.fieldRow,!!error&&styles.fieldInvalid]}><View style={styles.fieldInput}>{children}</View>{!!unit&&<Text aria-hidden style={styles.unit}>{unit}</Text>}</View>{!!error?<Text accessibilityRole="alert" style={styles.fieldError}>{error}</Text>:!!hint&&<Text style={styles.muted}>{hint}</Text>}</View>;
}

// Large, labelled shortcut for a frequent field routine.
// `compact` keeps the description for screen readers only, so frequent routines fit above the fold.
export function ActionTile({label,description,icon,onPress,accessibilityLabel,compact=false}:{label:string;description?:string;icon:ReactNode;onPress:()=>void;accessibilityLabel?:string;compact?:boolean}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel??(description?`${label}. ${description}`:label)} onPress={onPress} style={({pressed})=>[styles.tile,compact&&styles.tileCompact,pressed&&styles.tilePressed]}><View style={[styles.tileIcon,compact&&styles.tileIconCompact]}>{icon}</View><Text style={[styles.tileLabel,compact&&styles.tileLabelCompact]} numberOfLines={2}>{label}</Text>{!compact&&!!description&&<Text style={styles.tileDescription} numberOfLines={2}>{description}</Text>}</Pressable>;
}
export const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:colors.background},
 header:{flexDirection:'row',alignItems:'center',gap:space.md,paddingHorizontal:space.md,paddingVertical:space.sm,borderBottomWidth:1,borderColor:colors.borderSoft},
 heading:{...type.screenTitle,flex:1},
 content:{width:'100%',maxWidth:720,alignSelf:'center',padding:space.lg,gap:space.md,paddingBottom:space.xxl},
 row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:space.sm},
 button:{minHeight:touchTarget,minWidth:touchTarget,justifyContent:'center',alignItems:'center',paddingHorizontal:space.md,paddingVertical:space.sm,borderRadius:radius.md,backgroundColor:colors.softStrong},
 buttonText:{fontSize:14,fontWeight:'600',color:colors.primary},
 selected:{backgroundColor:colors.primary},selectedText:{color:colors.surface},
 pressed:{opacity:0.72},dim:{opacity:0.5},
 body:type.body,
 title:{...type.recordTitle,fontSize:17},
 card:{padding:space.lg,gap:space.sm,borderRadius:radius.lg,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface},
 muted:type.meta,
 badge:{fontSize:13,color:colors.primary,fontWeight:'600'},
 state:{padding:space.xl,gap:space.md,alignItems:'center'},
 input:{minHeight:46,borderWidth:1,borderColor:colors.inputBorder,borderRadius:radius.md,paddingHorizontal:space.md,fontSize:16,color:colors.text,backgroundColor:colors.surface,flexGrow:1},
 label:{fontSize:13,fontWeight:'600',color:colors.textSoft},
 error:{fontSize:14,lineHeight:21,color:colors.danger},
 range:{fontSize:16,fontWeight:'700',color:colors.forest,textAlign:'center',flex:1,...type.numeric},
 check:{minHeight:touchTarget,flexDirection:'row',alignItems:'center',gap:space.sm},
 checkText:{fontSize:15,color:colors.textSoft,flexShrink:1},
 divider:{height:1,backgroundColor:colors.divider,marginVertical:space.xs},
 calendarCard:{padding:space.md,borderRadius:radius.lg,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface,gap:10},
 calendarHeader:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:space.sm,paddingBottom:space.xs},
 calendarPeriod:{minWidth:100,fontSize:16,fontWeight:'700',letterSpacing:-0.2,color:colors.forest,flex:1,textAlign:'center',textTransform:'capitalize'},
 navButton:{width:touchTarget,height:touchTarget,borderRadius:touchTarget/2,backgroundColor:colors.primarySoft,alignItems:'center',justifyContent:'center'},
 navButtonText:{fontSize:18,fontWeight:'700',color:colors.primary},
 viewTabs:{flexDirection:'row',backgroundColor:colors.track,borderRadius:radius.md,padding:3,gap:3,alignSelf:'center'},
 viewTab:{minWidth:touchTarget,minHeight:touchTarget,justifyContent:'center',alignItems:'center',paddingHorizontal:14,paddingVertical:6,borderRadius:9},
 viewTabActive:{backgroundColor:colors.surface,boxShadow:'0 1px 3px rgba(22,63,44,0.10)'},
 viewTabText:{fontSize:13,fontWeight:'600',color:colors.muted},
 viewTabTextActive:{color:colors.forest,fontWeight:'700'},
 weekdayRow:{flexDirection:'row',justifyContent:'space-around',borderBottomWidth:1,borderColor:colors.divider,paddingBottom:6},
 weekdayText:{textAlign:'center',fontSize:12,fontWeight:'600',color:colors.muted},
 calendarGrid:{gap:0},
 dayCell:{alignItems:'center',justifyContent:'center',paddingVertical:space.xs,minHeight:touchTarget},
 dayCircle:{width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center'},
 dayNumber:{fontSize:13,fontWeight:'600',color:colors.text,...type.numeric},
 dayToday:{borderWidth:1.5,borderColor:colors.primary},
 daySelected:{backgroundColor:colors.primary},
 daySelectedText:{color:colors.surface,fontWeight:'700'},
 dayOutside:{opacity:0.4},
 dayDot:{width:4,height:4,borderRadius:2,backgroundColor:colors.primary,marginTop:2},
 dayDotSelected:{backgroundColor:colors.surface},
 chipScroll:{flexGrow:0,marginVertical:2},
 chipContent:{flexDirection:'row',alignItems:'center',gap:6,paddingVertical:2},
 chip:{minWidth:touchTarget,minHeight:touchTarget,justifyContent:'center',alignItems:'center',paddingHorizontal:space.md,paddingVertical:7,borderRadius:radius.lg,backgroundColor:colors.primarySoft,borderWidth:1,borderColor:colors.borderSoft},
 chipSelected:{backgroundColor:colors.primary,borderColor:colors.primary},
 chipText:{fontSize:13,fontWeight:'600',color:colors.textSoft},
 chipTextSelected:{color:colors.surface},
 daySummaryHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingTop:space.sm},
 daySummaryTitle:{fontSize:15,fontWeight:'700',letterSpacing:-0.1,color:colors.forest},
 daySummaryCount:{fontSize:13,color:colors.muted,...type.numeric},
 createButton:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:space.sm,backgroundColor:colors.primary,paddingVertical:10,paddingHorizontal:space.lg,borderRadius:radius.md,minHeight:touchTarget},
 createButtonText:{color:colors.surface,fontSize:14,fontWeight:'700'},
 primaryButton:{flexDirection:'row',gap:space.sm,alignSelf:'stretch',minHeight:52,marginTop:space.sm,paddingHorizontal:space.lg,backgroundColor:colors.primary,borderRadius:radius.md},
 primaryButtonText:{fontSize:16,fontWeight:'700',color:colors.surface,textAlign:'center'},
 pill:{flexDirection:'row',alignItems:'center',alignSelf:'flex-start',gap:6,paddingHorizontal:10,paddingVertical:3,borderRadius:radius.pill},
 pillDot:{width:6,height:6,borderRadius:3},
 pillText:{fontSize:12,fontWeight:'700'},
 field:{gap:6},
 fieldRow:{flexDirection:'row',alignItems:'center',minHeight:48,borderWidth:1,borderColor:colors.inputBorder,borderRadius:radius.md,backgroundColor:colors.surface,overflow:'hidden'},
 fieldInvalid:{borderColor:colors.danger,borderWidth:1.5},
 fieldInput:{flex:1,minWidth:0},
 // Inputs inside FormField drop their own border; the row draws it.
 fieldControl:{minHeight:46,paddingHorizontal:space.md,fontSize:16,color:colors.text},
 unit:{paddingHorizontal:space.md,alignSelf:'stretch',textAlignVertical:'center',lineHeight:46,fontSize:15,fontWeight:'700',color:colors.muted,backgroundColor:colors.primarySoft},
 fieldError:{fontSize:13,lineHeight:19,fontWeight:'600',color:colors.danger},
 tileGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},
 tile:{flexGrow:1,flexBasis:'45%',maxWidth:'50%',minWidth:140,minHeight:104,padding:14,gap:6,borderRadius:radius.lg,borderWidth:1,borderColor:colors.borderSoft,backgroundColor:colors.surface},
 tilePressed:{backgroundColor:colors.primarySoft,borderColor:colors.primary},
 tileIcon:{width:40,height:40,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:colors.primarySoft},
 tileLabel:{fontSize:15,lineHeight:20,fontWeight:'700',color:colors.forest},
 tileCompact:{flexDirection:'row',alignItems:'center',minHeight:60,paddingVertical:10,paddingHorizontal:space.md,gap:10},
 tileIconCompact:{width:36,height:36,borderRadius:10},
 tileLabelCompact:{flex:1,fontSize:14,lineHeight:19},
 tileDescription:{fontSize:12,lineHeight:17,color:colors.muted},
 sectionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:space.sm,marginTop:space.md},
 sectionHeading:{...type.sectionTitle,flexShrink:1},
});
