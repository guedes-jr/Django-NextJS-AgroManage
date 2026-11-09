import {useQuery} from '@tanstack/react-query';
import {canReadNotifications} from '../notifications/contracts';
import {canWriteDailyFeeding} from '../feeding/contracts';
import {type ReactNode,useEffect,useState} from 'react';
import {Image,Keyboard,Linking,Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,useWindowDimensions,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import {useRouter} from 'expo-router';
import Svg,{Defs,LinearGradient,Path,Rect,Stop} from 'react-native-svg';
import {useAuth} from '../auth/AuthProvider';
import {canOpenModule,canLoadFinancialHome,modulePaths,type ModuleKey} from '../home/contracts';
import {HomeIcon,type HomeIconName} from '../home/HomeIcon';
import {homeMessages} from '../home/messages';
import {homeStyles as s} from '../home/styles';
import {parseApiUrl} from '../../config/environment';
import {moduleKeys,iconFor,nativeDestination} from './navigation';
type Open=(key:ModuleKey)=>void;
export function WorkspaceShell({active,title,children}:{active:'home'|'agenda'|'beef'|'dairy'|'milk'|'inventory'|'feeding'|'notifications'|'clinic'|'search'|'profile';title?:string;children:ReactNode|((open:Open)=>ReactNode)}){
 const {state,language,controller}=useAuth();const router=useRouter();const {width}=useWindowDimensions();const t=homeMessages[language];
 const unread=useQuery({queryKey:['notifications-count'],enabled:state.status==='signedIn'&&canReadNotifications(state.session.user),queryFn:({signal})=>controller.notificationCount(signal),staleTime:30000});
 const [panel,setPanel]=useState<'modules'|'create'|ModuleKey|null>(null);const [query,setQuery]=useState('');const [linkFailed,setLinkFailed]=useState(false);const [keyboard,setKeyboard]=useState(false);
 useEffect(()=>{const show=Keyboard.addListener('keyboardDidShow',()=>setKeyboard(true));const hide=Keyboard.addListener('keyboardDidHide',()=>setKeyboard(false));return()=>{show.remove();hide.remove();};},[]);
 if(state.status!=='signedIn')return null;const {session}=state;
 const allowed=moduleKeys.filter(key=>canOpenModule(session.user.access,key));const writable=allowed.filter(key=>['agenda','crops','swine','beef','dairy','feeding','clinic','inventory','finance','structure'].includes(key)&&(key!=='feeding'||canWriteDailyFeeding(session.user)));const financial=canLoadFinancialHome(session.user.access);
 const open:Open=key=>{if(!canOpenModule(session.user.access,key))return;setLinkFailed(false);const destination=nativeDestination(key,panel==='create');if(destination){const same=panel!=='create'&&(key===active);setPanel(null);if(!same)router.navigate(destination);}else setPanel(key);};
 const goWeb=async(key:ModuleKey)=>{const site=parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL??'https://fazendamais.com',__DEV__);if(!site||!canOpenModule(session.user.access,key)){setLinkFailed(true);return;}try{await Linking.openURL(new URL(modulePaths[key],site).href);}catch{setLinkFailed(true);}};
 const button=(label:string,onPress:()=>void,icon?:HomeIconName)=><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({pressed})=>[s.button,pressed&&s.pressed]}>{icon&&<HomeIcon name={icon}/>}<Text style={s.buttonText}>{label}</Text></Pressable>;
 const currentModule=panel&&panel!=='modules'&&panel!=='create'?panel:null;const listed=(panel==='create'?writable:allowed).filter(key=>t[key].toLocaleLowerCase(language).includes(query.trim().toLocaleLowerCase(language)));
 const modulesSelected=panel==='modules'||(!panel&&!['home','agenda'].includes(active));
 return <SafeAreaView style={s.safe} edges={['top','left','right','bottom']}><StatusBar style="light"/><View style={{flex:1}} aria-hidden={!!panel} accessibilityElementsHidden={!!panel} importantForAccessibility={panel?'no-hide-descendants':'auto'} pointerEvents={panel?'none':'auto'}>
      <View testID="home-header" style={s.hero}>
        <Image source={require('../../../assets/auth-landscape.png')} style={[s.heroImage,{width,height:width * 1.5,top:-width * 0.025}]}/>
        <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill} aria-hidden={true}>
          <Defs><LinearGradient id="home-header-shade" x1="0%" x2="100%"><Stop stopColor="#00451D"/><Stop offset="0.45" stopColor="#00451D" stopOpacity={0.85}/><Stop offset="1" stopColor="#003E22" stopOpacity={0.05}/></LinearGradient></Defs>
          <Rect width="100%" height="100%" fill="url(#home-header-shade)"/>
        </Svg>
        <View style={s.header}><View accessibilityLabel="Fazenda Mais" style={s.brand}><Image source={require('../../../assets/brand-mark.png')} style={s.mark}/><Text style={s.brandText}>Fazenda<Text style={s.plus}>+</Text></Text></View><Pressable accessibilityRole="button" accessibilityLabel={t.notifications} style={s.headerButton} onPress={() => open('notifications')}><HomeIcon name="bell" size={27} color="#FFF"/>{!unread.isError&&!!unread.data?.unread_count&&<Text style={{position:'absolute',right:0,top:0,borderRadius:10,paddingHorizontal:4,backgroundColor:'#D93636',color:'#FFF',fontSize:11,fontWeight:'700'}}>{unread.data.unread_count>99?'99+':unread.data.unread_count}</Text>}</Pressable><Pressable accessibilityRole="button" accessibilityLabel={t.profile} style={s.avatar} onPress={() => open('profile')}><Text style={s.avatarText}>{(session.user.full_name || session.user.email).split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase()}</Text></Pressable></View>
        <Svg pointerEvents="none" width="100%" height={37} viewBox="0 0 780 100" preserveAspectRatio="none" style={s.wave} aria-hidden={true}>
          <Path d="M0 70C140-25 230-2 390 60S610 40 780 9V100H0Z" fill="#A8E000"/>
          <Path d="M0 85C140 6 230 28 390 75S615 60 780 32V100H0Z" fill="#F6F8F1"/>
        </Svg>
      </View>
<View style={{flex:1,backgroundColor:'#F6F8F1'}}>{title&&<Text accessibilityRole="header" style={[s.sectionTitle,{paddingHorizontal:16,paddingVertical:4,maxWidth:720,width:'100%',alignSelf:'center'}]}>{title}</Text>}{typeof children==='function'?children(open):children}</View>
{!keyboard&&<>    <View pointerEvents="box-none" style={[s.navBackdrop,{marginTop:0,backgroundColor:'#F6F8F1'}]}>
    <View testID="home-navigation" accessibilityRole="tablist" style={s.nav}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill,s.navFill]}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} aria-hidden={true}>
        <Defs><LinearGradient id="home-navigation-fill" x1="0%" y1="0%" x2="100%" y2="100%"><Stop stopColor="#005626"/><Stop offset="1" stopColor="#00391D"/></LinearGradient></Defs>
        <Rect width="100%" height="100%" fill="url(#home-navigation-fill)"/>
      </Svg>
      </View>
      <Pressable accessibilityRole="tab" accessibilityState={{selected:active==='home'&&!panel}} aria-selected={active==='home'&&!panel} style={s.tab} onPress={() => {setPanel(null);if(active!=='home')router.navigate('/');}}><View style={[s.tabInner,active==='home'&&!panel && s.tabSelected]}><HomeIcon name="home" size={28} color="#FFFFFF"/><Text style={active==='home'&&!panel ? s.activeTab : s.tabText}>{t.home}</Text></View></Pressable>
      {canOpenModule(session.user.access,'agenda') && <Pressable accessibilityRole="tab" accessibilityState={{selected:active==='agenda'&&!panel}} aria-selected={active==='agenda'&&!panel} style={s.tab} onPress={() => open('agenda')}><View style={[s.tabInner,active==='agenda'&&!panel&&s.tabSelected]}><HomeIcon name="agenda" size={26} color="#FFF"/><Text style={s.tabText}>{t.agenda}</Text></View></Pressable>}
      {!session.user.access.read_only && writable.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={t.create} style={s.create} onPress={() => {setQuery('');setPanel('create');}}><View style={s.createCircle}><Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill} aria-hidden={true}><Defs><LinearGradient id="home-create-fill" x1="0%" y1="0%" x2="100%" y2="100%"><Stop stopColor="#EDFF2C"/><Stop offset="1" stopColor="#B9F000"/></LinearGradient></Defs><Rect width="100%" height="100%" rx={30} fill="url(#home-create-fill)"/></Svg><View style={s.createIcon}><HomeIcon name="plus" size={32} color="#123A1D"/></View></View><Text style={s.createText}>{t.create}</Text></Pressable>}
      {financial && <Pressable accessibilityRole="tab" accessibilityState={{selected:panel==='finance'}} aria-selected={panel==='finance'} style={s.tab} onPress={() => open('finance')}><View style={[s.tabInner,panel==='finance'&&s.tabSelected]}><HomeIcon name="chart" size={26} color="#FFF"/><Text style={s.tabText}>{t.finance}</Text></View></Pressable>}
      <Pressable accessibilityRole="tab" accessibilityState={{selected:modulesSelected}} aria-selected={modulesSelected} style={s.tab} onPress={() => {setQuery('');setPanel('modules');}}><View style={[s.tabInner,modulesSelected&&s.tabSelected]}><HomeIcon name="modules" size={26} color="#FFF"/><Text style={s.tabText}>{t.modules}</Text></View></Pressable>
    </View>
    </View>
    </>}
    </View>
    <Modal visible={!!panel} transparent animationType="fade" onRequestClose={() => setPanel(null)}><SafeAreaView style={s.overlay}><View accessibilityViewIsModal style={s.sheet}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.sheetContent}><View style={s.row}><Text accessibilityRole="header" style={[s.sectionTitle,s.grow]}>{currentModule ? t[currentModule] : panel === 'create' ? t.create : t.modules}</Text>{button(t.close,() => setPanel(null))}</View>
      {currentModule ? <><Text style={s.subtitle}>{t.pending}</Text>{linkFailed && <Text accessibilityRole="alert">{t.failedLink}</Text>}{button(t.web,() => void goWeb(currentModule),'arrow')}{currentModule === 'profile' && button(t.logout,() => void controller.signOut())}</> : <>{panel === 'create' && <Text style={s.subtitle}>{t.choose}</Text>}<TextInput accessibilityLabel={t.search} placeholder={t.search} placeholderTextColor="#657268" value={query} onChangeText={setQuery} style={s.searchInput}/>{listed.map(key => <View key={key}>{button(t[key],() => open(key),iconFor(key))}</View>)}{!listed.length && <Text>{t.noResults}</Text>}</>}
    </ScrollView></View></SafeAreaView></Modal>
</SafeAreaView>;
}
