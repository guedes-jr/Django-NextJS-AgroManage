import {useQuery} from '@tanstack/react-query';
import {canReadNotifications} from '../notifications/contracts';
import {type ReactNode,useEffect,useState} from 'react';
import {Image,Keyboard,Linking,Modal,Pressable,ScrollView,StyleSheet,Text,useWindowDimensions,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import {useRouter} from 'expo-router';
import Svg,{Defs,LinearGradient,Path,Rect,Stop} from 'react-native-svg';
import {useAuth} from '../auth/AuthProvider';
import {canOpenModule,canLoadFinancialHome,modulePaths,type ModuleKey} from '../home/contracts';
import {HomeIcon,type HomeIconName} from '../home/HomeIcon';
import {homeMessages} from '../home/messages';
import {homeStyles as s} from '../home/styles';
import {colors} from '../../theme/tokens';
import {parseApiUrl} from '../../config/environment';
import {ModuleMenu} from './ModuleMenu';
import {quickActions,quickActionMessages,type QuickAction} from './quickActions';
import {ActionTile,styles as ui} from '../agenda/ui';
import {balanceNavSlots,moduleKeys,nativeDestination,type NavSlot} from './navigation';
import {canSearch,searchKinds} from './contracts';
type Open=(key:ModuleKey)=>void;
export type WorkspaceArea='home'|'agenda'|'beef'|'dairy'|'swine'|'milk'|'inventory'|'feeding'|'notifications'|'clinic'|'search'|'profile'|'veterinary'|'finance'|'crops'|'structure'|'support'|'assistant'|'reports'|'settings'|'other';
type WorkspaceShellProps={active:WorkspaceArea;title?:string;children:ReactNode|((open:Open)=>ReactNode);onBack?:()=>void;layout?:'wide'|'form'};
const shellStyles=StyleSheet.create({
 bodyBackdrop:{flex:1,width:'100%',backgroundColor:colors.background},
 pageBody:{flex:1,minWidth:0,width:'100%',maxWidth:1600,alignSelf:'center',backgroundColor:colors.background},
 formBody:{flex:1,minWidth:0,width:'100%',maxWidth:880,alignSelf:'center',backgroundColor:colors.background},
});
export function WorkspaceShell({active,title,children,onBack,layout='wide'}:WorkspaceShellProps){
 const {state,language,controller}=useAuth();const router=useRouter();const {width}=useWindowDimensions();const t=homeMessages[language];
 const unread=useQuery({queryKey:['notifications-count'],enabled:state.status==='signedIn'&&canReadNotifications(state.session.user),queryFn:({signal})=>controller.notificationCount(signal),staleTime:30000});
 const [panel,setPanel]=useState<'modules'|'create'|ModuleKey|null>(null);const [query,setQuery]=useState('');const [linkFailed,setLinkFailed]=useState(false);const [keyboard,setKeyboard]=useState(false);
 useEffect(()=>{const show=Keyboard.addListener('keyboardDidShow',()=>setKeyboard(true));const hide=Keyboard.addListener('keyboardDidHide',()=>setKeyboard(false));return()=>{show.remove();hide.remove();};},[]);
 if(state.status!=='signedIn')return null;const {session}=state;
 const allowed=moduleKeys.filter(key=>canOpenModule(session.user.access,key));const actions=quickActions(session.user);const searchable=searchKinds.some(kind=>canSearch(session.user,kind));const qa=quickActionMessages[language];const financial=canLoadFinancialHome(session.user.access);
 const open:Open=key=>{if(!canOpenModule(session.user.access,key))return;setLinkFailed(false);const destination=nativeDestination(key,panel==='create');if(destination){const same=panel!=='create'&&(key===active);setPanel(null);if(!same)router.navigate(destination);}else setPanel(key);};
 const goWeb=async(key:ModuleKey)=>{const site=parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL??'https://fazendamais.com',__DEV__);if(!site||!canOpenModule(session.user.access,key)){setLinkFailed(true);return;}try{await Linking.openURL(new URL(modulePaths[key],site).href);}catch{setLinkFailed(true);}};
 const button=(label:string,onPress:()=>void,icon?:HomeIconName)=><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({pressed})=>[s.button,pressed&&s.pressed]}>{icon&&<HomeIcon name={icon}/>}<Text style={s.buttonText}>{label}</Text></Pressable>;
 const currentModule=panel&&panel!=='modules'&&panel!=='create'?panel:null;
 const runAction=(action:QuickAction)=>{setLinkFailed(false);if(action.destination){setPanel(null);router.navigate(action.destination);}else setPanel(action.module);};
 const modulesSelected=panel==='modules'||(!panel&&!['home','agenda','search','finance'].includes(active));
 const closePanel=()=>{Keyboard.dismiss();setPanel(null);};
 const handleBack=()=>{if(onBack){onBack();return;}if(router.canGoBack())router.back();else router.navigate('/');};
 return <SafeAreaView style={s.safe} edges={['top','left','right','bottom']}><StatusBar style="light"/><View style={{flex:1}} aria-hidden={!!panel} accessibilityElementsHidden={!!panel} importantForAccessibility={panel?'no-hide-descendants':'auto'} pointerEvents={panel?'none':'auto'}>
      <View testID="home-header" style={s.hero}>
        <Image source={require('../../../assets/auth-landscape.png')} style={[s.heroImage,{width,height:width * 1.5,top:-width * 0.025}]}/>
        <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill} aria-hidden={true}>
          <Defs><LinearGradient id="home-header-shade" x1="0%" x2="100%"><Stop stopColor="#00451D"/><Stop offset="0.45" stopColor="#00451D" stopOpacity={0.85}/><Stop offset="1" stopColor="#003E22" stopOpacity={0.05}/></LinearGradient></Defs>
          <Rect width="100%" height="100%" fill="url(#home-header-shade)"/>
        </Svg>
        <View style={s.header}>
          {active !== 'home' ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t.previous ?? 'Voltar'} style={s.backButton} onPress={handleBack}>
              <HomeIcon name="back" size={20} color="#FFF"/>
              <Text numberOfLines={1} style={s.backText}>{title || 'Voltar'}</Text>
            </Pressable>
          ) : (
            <View accessibilityLabel="Fazenda Mais" style={s.brand}>
              <Image source={require('../../../assets/brand-mark.png')} style={s.mark}/>
              <Text style={s.brandText}>Fazenda<Text style={s.plus}>+</Text></Text>
            </View>
          )}
          <View style={s.grow}/>
          <Pressable accessibilityRole="button" accessibilityLabel={t.notifications} style={s.headerButton} onPress={() => open('notifications')}>
            <HomeIcon name="bell" size={24} color="#FFF"/>
            {!unread.isError&&!!unread.data?.unread_count&&<Text style={s.unreadBadge}>{unread.data.unread_count>99?'99+':unread.data.unread_count}</Text>}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t.profile} hitSlop={4} style={s.avatar} onPress={() => open('profile')}>
            <Text style={s.avatarText}>{(session.user.full_name || session.user.email).split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase()}</Text>
          </Pressable>
        </View>
        <Svg pointerEvents="none" width="100%" height={14} viewBox="0 0 780 100" preserveAspectRatio="none" style={s.wave} aria-hidden={true}>
          <Path d="M0 70C140-25 230-2 390 60S610 40 780 9V100H0Z" fill="#A8E000"/>
          <Path d="M0 85C140 6 230 28 390 75S615 60 780 32V100H0Z" fill={colors.background}/>
        </Svg>
      </View>
<View style={shellStyles.bodyBackdrop}><View style={layout==='form'?shellStyles.formBody:shellStyles.pageBody}>{typeof children==='function'?children(open):children}</View></View>
{!keyboard&&<><View pointerEvents="box-none" style={s.navBackdrop}>
    <View testID="home-navigation" accessibilityRole="tablist" style={s.nav}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill,s.navFill]}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} aria-hidden={true}>
        <Defs><LinearGradient id="home-navigation-fill" x1="0%" y1="0%" x2="100%" y2="100%"><Stop stopColor="#005626"/><Stop offset="1" stopColor="#00391D"/></LinearGradient></Defs>
        <Rect width="100%" height="100%" fill="url(#home-navigation-fill)"/>
      </Svg>
      </View>
      {(()=>{const tab=(key:NavSlot,label:string,icon:HomeIconName,selected:boolean,onPress:()=>void)=><Pressable key={key} accessibilityRole="tab" accessibilityState={{selected}} aria-selected={selected} style={s.tab} onPress={onPress}><View style={[s.tabInner,selected&&s.tabSelected]}><HomeIcon name={icon} size={key==='home'?24:22} color="#FFF"/><Text style={selected?s.activeTab:s.tabText}>{label}</Text></View></Pressable>;
       const render=(slot:NavSlot,index:number)=>slot==='home'?tab('home',t.home,'home',active==='home'&&!panel,()=>{setPanel(null);if(active!=='home')router.navigate('/');}):slot==='agenda'?tab('agenda',t.agenda,'agenda',active==='agenda'&&!panel,()=>open('agenda')):slot==='search'?tab('search',t.searchTab,'search',active==='search'&&!panel,()=>{setPanel(null);if(active!=='search')router.navigate('/search');}):slot==='finance'?tab('finance',t.finance,'chart',active==='finance'&&!panel,()=>open('finance')):slot==='modules'?tab('modules',t.modules,'modules',modulesSelected,()=>{setQuery('');setPanel('modules');}):<View key={`spacer-${index}`} aria-hidden style={s.tab}/>;
       const creating=!session.user.access.read_only&&actions.length>0;
       const slots=balanceNavSlots(['home',...(canOpenModule(session.user.access,'agenda')?['agenda' as const]:[])],[...(financial?['finance' as const]:[]),'modules'],searchable?'search':null,creating);
       return <>{slots.left.map(render)}{creating&&<Pressable accessibilityRole="button" accessibilityLabel={t.create} style={s.create} onPress={() => {setQuery('');setPanel('create');}}><View style={s.createCircle}><Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill} aria-hidden={true}><Defs><LinearGradient id="home-create-fill" x1="0%" y1="0%" x2="100%" y2="100%"><Stop stopColor="#EDFF2C"/><Stop offset="1" stopColor="#B9F000"/></LinearGradient></Defs><Rect width="100%" height="100%" rx={24} fill="url(#home-create-fill)"/></Svg><View style={s.createIcon}><HomeIcon name="plus" size={26} color="#123A1D"/></View></View><Text style={s.createText}>{t.create}</Text></Pressable>}{slots.right.map(render)}</>;})()}
    </View>
    </View>
    </>}
    </View>
    <Modal visible={!!panel} transparent animationType="fade" onRequestClose={closePanel}><SafeAreaView style={s.overlay}>
     <Pressable style={StyleSheet.absoluteFill} focusable={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden onPress={closePanel}/>
     {panel==='modules'?<ModuleMenu allowed={allowed} language={language} active={active} query={query} onQuery={setQuery} onClose={closePanel} onOpen={open}/>:<View accessibilityViewIsModal style={s.sheet}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.sheetContent}><View style={s.row}><Text accessibilityRole="header" style={[s.sectionTitle,s.grow]}>{currentModule?t[currentModule]:t.create}</Text>{button(t.close,closePanel)}</View>
      {currentModule?<><Text style={s.subtitle}>{t.pending}</Text>{linkFailed&&<Text accessibilityRole="alert" style={s.sheetError}>{t.failedLink}</Text>}{button(t.web,()=>void goWeb(currentModule),'arrow')}{currentModule==='profile'&&button(t.logout,()=>void controller.signOut())}</>:<><Text style={s.subtitle}>{qa.hint}</Text><View style={ui.tileGrid}>{actions.map(action=>{const copy=qa.actions[action.id];return <ActionTile key={action.id} label={copy.label} description={action.destination?copy.description:qa.web} icon={<HomeIcon name={action.icon} size={22}/>} onPress={()=>runAction(action)}/>;})}</View></>}
     </ScrollView></View>}
    </SafeAreaView></Modal>
</SafeAreaView>;
}
export function WorkspaceFormShell(props:Omit<WorkspaceShellProps,'layout'>){
 return <WorkspaceShell {...props} layout="form"/>;
}
