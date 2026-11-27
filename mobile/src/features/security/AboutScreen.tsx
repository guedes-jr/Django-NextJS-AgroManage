import {useState} from 'react';
import {Linking,Platform,Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useRouter} from 'expo-router';
import Constants from 'expo-constants';
import {useAuth} from '../auth/AuthProvider';
import {HomeIcon} from '../home/HomeIcon';
import {ActionGroup,ActionRow,InfoList,Notice,SectionLabel,mobileStyles as ms} from '../../components/mobile';
import {colors,space,type as typo} from '../../theme/tokens';
import {legalUrls,selectApiUrl} from '../../config/environment';
import {securityMessages} from './messages';

/** O03 — app information, legal documents and sign-in help. Reachable with or without a session. */
export function AboutScreen(){
 const {language}=useAuth();const t=securityMessages[language];const router=useRouter();const [failed,setFailed]=useState(false);
 const api=selectApiUrl({api:process.env.EXPO_PUBLIC_API_URL,devApi:process.env.EXPO_PUBLIC_DEV_API_URL},__DEV__);
 const urls=legalUrls(process.env.EXPO_PUBLIC_SITE_URL,__DEV__);
 const system=`${Platform.OS==='ios'?'iOS':Platform.OS==='android'?'Android':Platform.OS} ${String(Platform.Version)}`;
 const open=(url:string|undefined)=>{setFailed(false);if(!url){setFailed(true);return;}void Linking.openURL(url).catch(()=>setFailed(true));};
 const back=()=>{if(router.canGoBack())router.back();else router.replace('/');};
 return <SafeAreaView style={{flex:1,backgroundColor:colors.background}} edges={['top','left','right']}>
  <View style={{flexDirection:'row',alignItems:'center',gap:space.sm,paddingHorizontal:space.lg,paddingVertical:space.sm,borderBottomWidth:1,borderColor:colors.borderSoft}}>
   <Pressable accessibilityRole="button" accessibilityLabel={t.back} onPress={back} hitSlop={8} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}}>
    <HomeIcon name="back" size={22} color={colors.primary}/>
   </Pressable>
   <Text accessibilityRole="header" style={{...typo.sectionTitle,flex:1,color:colors.text}}>{t.about}</Text>
  </View>
  <ScrollView contentContainerStyle={ms.list}>
   <InfoList rows={[
    [t.version,Constants.expoConfig?.version??'—'],
    [t.system,system],
    [t.server,api?new URL(api).host:t.notConfigured],
    [t.environment,__DEV__?t.development:t.production],
   ]}/>
   <SectionLabel title={t.documents}/>
   <ActionGroup>
    <ActionRow label={`${t.terms} ↗`} icon={<HomeIcon name="arrow" size={20} color={colors.primary}/>} onPress={()=>open(urls?.terms)}/>
    <ActionRow label={`${t.privacy} ↗`} icon={<HomeIcon name="arrow" size={20} color={colors.primary}/>} onPress={()=>open(urls?.privacy)}/>
    <ActionRow label={`${t.license} ↗`} icon={<HomeIcon name="arrow" size={20} color={colors.primary}/>} onPress={()=>open(urls?.copyright)}/>
   </ActionGroup>
   {failed&&<Notice tone="danger" text={t.linkFailed}/>}
   <SectionLabel title={t.accessHelp}/>
   <Notice tone="neutral" text={t.accessHelpText}/>
   <Text style={{...typo.meta,color:colors.muted,textAlign:'center',marginTop:space.lg}}>{`© ${new Date().getFullYear()} Fazenda Mais`}</Text>
  </ScrollView>
 </SafeAreaView>;
}
