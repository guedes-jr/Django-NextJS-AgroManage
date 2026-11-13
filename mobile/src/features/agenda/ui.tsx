import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
export function AgendaShell({title,backLabel,onBack,children}:PropsWithChildren<{title:string;backLabel:string;onBack:()=>void}>) {
  return <SafeAreaView style={styles.safe}><StatusBar style="dark"/><View style={styles.header}><AgendaButton label={`‹ ${backLabel}`} onPress={onBack}/><Text accessibilityRole="header" style={styles.heading}>{title}</Text></View>{children}</SafeAreaView>;
}
export function AgendaButton({label,onPress,selected=false,disabled=false,accessibilityLabel,style}:{label:string;onPress:()=>void;selected?:boolean;disabled?:boolean;accessibilityLabel?:string;style?:StyleProp<ViewStyle>}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel??label} accessibilityState={{selected,disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[styles.button,selected&&styles.selected,(pressed||disabled)&&styles.dim,style]}><Text style={[styles.buttonText,selected&&styles.selectedText]} numberOfLines={1}>{label}</Text></Pressable>;
}
export function Busy({label}:{label:string}) { return <View style={styles.state}><ActivityIndicator color="#267338"/><Text style={styles.body}>{label}</Text></View>; }
export const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:'#F6F8F1'},header:{flexDirection:'row',alignItems:'center',gap:12,padding:12,borderBottomWidth:1,borderColor:'#DCE5D6'},heading:{fontSize:22,fontWeight:'800',color:'#205D32',flex:1},content:{width:'100%',maxWidth:720,alignSelf:'center',padding:16,gap:12,paddingBottom:32},row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8},button:{minHeight:44,minWidth:44,justifyContent:'center',alignItems:'center',paddingHorizontal:12,paddingVertical:8,borderRadius:14,backgroundColor:'#E7EFDF'},buttonText:{fontSize:14,fontWeight:'600',color:'#245D34'},selected:{backgroundColor:'#205D32'},selectedText:{color:'#FFF'},dim:{opacity:0.6},body:{fontSize:15,lineHeight:23,color:'#435B47'},title:{fontSize:17,fontWeight:'700',color:'#205D32'},card:{padding:16,gap:8,borderRadius:18,borderWidth:1,borderColor:'#DCE5D6',backgroundColor:'#FFF'},muted:{fontSize:13,lineHeight:20,color:'#5D705E'},badge:{fontSize:13,color:'#346D29',fontWeight:'600'},state:{padding:24,gap:12,alignItems:'center'},input:{minHeight:46,borderWidth:1,borderColor:'#92AF89',borderRadius:12,paddingHorizontal:12,fontSize:16,color:'#193C27',backgroundColor:'#FFF',flexGrow:1},label:{fontSize:13,fontWeight:'600',color:'#48604C'},error:{fontSize:14,lineHeight:21,color:'#9A3028'},range:{fontSize:16,fontWeight:'700',color:'#205D32',textAlign:'center',flex:1},check:{minHeight:44,flexDirection:'row',alignItems:'center',gap:9},checkText:{fontSize:15,color:'#34563B',flexShrink:1},divider:{height:1,backgroundColor:'#E1E8DC',marginVertical:4},
 calendarCard:{padding:12,borderRadius:18,borderWidth:1,borderColor:'#DCE5D6',backgroundColor:'#FFF',gap:10},
 calendarHeader:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:8,paddingBottom:4},
 calendarPeriod:{minWidth:100,fontSize:16,fontWeight:'700',color:'#205D32',flex:1,textAlign:'center',textTransform:'capitalize'},
 navButton:{width:44,height:44,borderRadius:22,backgroundColor:'#F0F4EC',alignItems:'center',justifyContent:'center'},
 navButtonText:{fontSize:18,fontWeight:'700',color:'#245D34'},
 viewTabs:{flexDirection:'row',backgroundColor:'#EAEFE6',borderRadius:12,padding:3,gap:3,alignSelf:'center'},
 viewTab:{minWidth:44,minHeight:44,justifyContent:'center',alignItems:'center',paddingHorizontal:14,paddingVertical:6,borderRadius:10},
 viewTabActive:{backgroundColor:'#FFF',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'},
 viewTabText:{fontSize:13,fontWeight:'600',color:'#506B54'},
 viewTabTextActive:{color:'#16472C',fontWeight:'700'},
 weekdayRow:{flexDirection:'row',justifyContent:'space-around',borderBottomWidth:1,borderColor:'#EDF2E9',paddingBottom:6},
 weekdayText:{textAlign:'center',fontSize:12,fontWeight:'600',color:'#718A75'},
 calendarGrid:{gap:0},
 dayCell:{alignItems:'center',justifyContent:'center',paddingVertical:4,minHeight:44},
 dayCircle:{width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center'},
 dayNumber:{fontSize:13,fontWeight:'600',color:'#223E28'},
 dayToday:{borderWidth:1.5,borderColor:'#205D32'},
 daySelected:{backgroundColor:'#205D32'},
 daySelectedText:{color:'#FFF',fontWeight:'700'},
 dayOutside:{opacity:0.3},
 dayDot:{width:4,height:4,borderRadius:2,backgroundColor:'#205D32',marginTop:2},
 dayDotSelected:{backgroundColor:'#FFF'},
 chipScroll:{flexGrow:0,marginVertical:2},
 chipContent:{flexDirection:'row',alignItems:'center',gap:6,paddingVertical:2},
 chip:{minWidth:44,minHeight:44,justifyContent:'center',alignItems:'center',paddingHorizontal:12,paddingVertical:7,borderRadius:16,backgroundColor:'#EBF0E6',borderWidth:1,borderColor:'#D7E1D2'},
 chipSelected:{backgroundColor:'#205D32',borderColor:'#205D32'},
 chipText:{fontSize:13,fontWeight:'600',color:'#35583B'},
 chipTextSelected:{color:'#FFF'},
 daySummaryHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingTop:6},
 daySummaryTitle:{fontSize:15,fontWeight:'700',color:'#205D32'},
 daySummaryCount:{fontSize:13,color:'#627C67'},
 createButton:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'#205D32',paddingVertical:10,paddingHorizontal:16,borderRadius:14,minHeight:44},
 createButtonText:{color:'#FFF',fontSize:14,fontWeight:'700'},
});
