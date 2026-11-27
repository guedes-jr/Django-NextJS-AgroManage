import {useState} from 'react';
import {Modal,Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {AgendaButton} from '../agenda/ui';
import {colors,radius,space,type} from '../../theme/tokens';
import {fill,onboardingMessages} from './messages';

const steps=['Welcome','Home','Modules','Agenda','Change'] as const;

/** Short welcome tour shown once after the first access; the last step explains how to change segments. */
export function WelcomeTour(){
 const {controller,language}=useAuth();const t=onboardingMessages[language];
 const [index,setIndex]=useState(0);const [closed,setClosed]=useState(false);
 // Best effort: if the server call fails, the tour shows again on the next visit.
 const close=()=>{setClosed(true);void controller.finishWelcomeTour().catch(()=>{});};
 const key=steps[index]!;const last=index===steps.length-1;
 const title=t[`tour${key}Title`];const text=t[`tour${key}Text`];
 return <Modal visible={!closed} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
  <SafeAreaView style={{flex:1,backgroundColor:'rgba(15,30,20,0.45)',justifyContent:'center',padding:space.lg}}>
   <View accessibilityViewIsModal style={{width:'100%',maxWidth:440,maxHeight:'100%',alignSelf:'center',backgroundColor:colors.surface,borderRadius:radius.lg,padding:space.lg}}>
    <ScrollView contentContainerStyle={{gap:space.md}}>
     <View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:space.sm}}>
      <Text style={[type.meta,type.numeric]}>{t.tourLabel} · {fill(t.tourStep,{current:index+1,total:steps.length})}</Text>
      <Pressable accessibilityRole="button" onPress={close} hitSlop={12} style={{minHeight:44,justifyContent:'center'}}><Text style={[type.meta,{color:colors.primary,fontWeight:'700'}]}>{t.tourSkip}</Text></Pressable>
     </View>
     <Text accessibilityRole="header" style={type.sectionTitle}>{title}</Text>
     <Text style={type.body}>{text}</Text>
     <View style={{flexDirection:'row',gap:6}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {steps.map((step,position)=><View key={step} style={{width:8,height:8,borderRadius:4,backgroundColor:position===index?colors.primary:colors.border}}/>)}
     </View>
     <AgendaButton variant="primary" label={last?t.tourFinish:t.tourNext} onPress={()=>last?close():setIndex(index+1)}/>
     {index>0&&<AgendaButton label={t.tourBack} onPress={()=>setIndex(index-1)}/>}
    </ScrollView>
   </View>
  </SafeAreaView>
 </Modal>;
}
