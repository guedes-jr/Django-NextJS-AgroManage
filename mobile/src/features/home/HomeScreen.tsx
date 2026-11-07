import { HomePriorities } from '../workspace/HomePriorities';
import { FarmContextButton } from '../workspace/FarmContextButton';
import { workspaceMessages } from '../workspace/messages';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useAuth } from '../auth/AuthProvider';
import type { Session } from '../auth/contracts';
import { parseApiUrl } from '../../config/environment';
import { canLoadFinancialHome, canOpenModule, modulePaths, type Dashboard, type ModuleKey } from './contracts';
import { homeMessages } from './messages';
import { HomeIcon, type HomeIconName } from './HomeIcon';
const moduleKeys: ModuleKey[] = ['agenda', 'crops', 'swine', 'beef', 'dairy', 'feeding', 'clinic', 'inventory', 'finance', 'structure', 'assistant', 'settings', 'profile', 'notifications', 'support'];
const iconFor = (key: ModuleKey): HomeIconName => key === 'agenda' ? 'agenda' : key === 'finance' ? 'wallet' : key === 'inventory' ? 'box' : key === 'notifications' ? 'bell' : 'leaf';
export function HomeScreen({ session }: { session: Session }) {
  const { language, controller } = useAuth();
  const router = useRouter();
  const t = homeMessages[language];
  const { width } = useWindowDimensions();
  const [period, setPeriod] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; });
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [panel, setPanel] = useState<'modules' | 'create' | ModuleKey | null>(null);
  const [query, setQuery] = useState('');
  const [linkFailed, setLinkFailed] = useState(false);
  const financial = canLoadFinancialHome(session.user.access);
  const allowed = moduleKeys.filter(key => canOpenModule(session.user.access, key));
  const writable = allowed.filter(key => ['agenda','crops','swine','beef','dairy','feeding','clinic','inventory','finance','structure'].includes(key));
  const money = new Intl.NumberFormat(language, { style:'currency', currency:'BRL' });
  const number = new Intl.NumberFormat(language);
  useEffect(() => {
    if (!financial) return;
    const abort = new AbortController();
    let active = true;
    void controller.dashboard(period, abort.signal).then(result => { if (active) { setData(result); setFailed(false); } }).catch(() => { if (active) { setData(null); setFailed(true); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; abort.abort(); };
  }, [controller, financial, period, reload]);
  const refresh = () => { setData(null); setFailed(false); setLoading(true); setReload(x => x+1); };
  const changeMonth = (offset: number) => { const [y = 2026,m = 1] = period.split('-').map(Number); const next = new Date(y,m-1+offset,1); setData(null); setLoading(true); setFailed(false); setPeriod(`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`); };
  const open = (key: ModuleKey) => { if (canOpenModule(session.user.access,key)) { setLinkFailed(false); if (key === 'agenda') { setPanel(null); router.push(panel==='create'?'/agenda/task-form':'/agenda'); } else if(key==='beef'||key==='dairy'){setPanel(null);router.push(panel==='create'?{pathname:'/cattle/[production]/form',params:{production:key,mode:'create'}}:{pathname:'/cattle/[production]',params:{production:key}});}else if(key==='profile'){setPanel(null);router.push('/profile');}else setPanel(key); } };
  const goWeb = async (key: ModuleKey) => {
    const site = parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL ?? 'https://fazendamais.com', __DEV__);
    if (!site || !canOpenModule(session.user.access,key)) { setLinkFailed(true); return; }
    try { await Linking.openURL(new URL(modulePaths[key],site).href); } catch { setLinkFailed(true); }
  };
  const button = (label: string, onPress: () => void, icon?: HomeIconName, accessibilityLabel?: string) => <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress} style={({pressed}) => [s.button,pressed && s.pressed]}>{icon && <HomeIcon name={icon}/>}<Text style={s.buttonText}>{label}</Text></Pressable>;
  const title = (text: string) => <Text accessibilityRole="header" style={s.sectionTitle}>{text}</Text>;
  const metric = (label: string, value: string, icon: HomeIconName, note?: string) => <View key={label} style={[s.metric, width < 350 && { width:'100%' }]}><View style={s.metricHeading}><View style={s.iconTile}><HomeIcon name={icon} size={22}/></View><Text style={[s.caption,s.grow]}>{label}</Text></View><Text style={s.amount}>{value}</Text>{note && <Text style={s.note}>{note}</Text>}</View>;
  const segments = data ? [...(canOpenModule(session.user.access,'crops') ? [{ key:'crops' as ModuleKey, label:t.crops,...data.segments.crops }] : []), ...(data.segments.livestock_by_species?.map(segment => ({...segment,key:(segment.code === 'suinos' ? 'swine' : segment.code === 'bovinos' ? 'beef' : null) as ModuleKey | null,label:segment.code === 'suinos' ? t.swine : segment.code === 'bovinos' ? `${t.beef} / ${t.dairy}` : segment.name })) ?? [])] : [];
  const currentModule = panel && panel !== 'modules' && panel !== 'create' ? panel : null;
  const listed = (panel === 'create' ? writable : allowed).filter(key => t[key].toLocaleLowerCase(language).includes(query.trim().toLocaleLowerCase(language)));
  return <SafeAreaView style={s.safe} edges={['top','left','right','bottom']}>
    <StatusBar style="light"/>
    <ScrollView testID="home-scroll" contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" refreshControl={financial ? <RefreshControl refreshing={loading} onRefresh={refresh}/> : undefined}>
      <View testID="home-header" style={s.hero}>
        <Image source={require('../../../assets/auth-landscape.png')} style={[s.heroImage,{width,height:width * 1.5,top:-width * 0.025}]}/>
        <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill} aria-hidden={true}>
          <Defs><LinearGradient id="home-header-shade" x1="0%" x2="100%"><Stop stopColor="#00451D"/><Stop offset="0.45" stopColor="#00451D" stopOpacity={0.85}/><Stop offset="1" stopColor="#003E22" stopOpacity={0.05}/></LinearGradient></Defs>
          <Rect width="100%" height="100%" fill="url(#home-header-shade)"/>
        </Svg>
        <View style={s.header}><View accessibilityLabel="Fazenda Mais" style={s.brand}><Image source={require('../../../assets/brand-mark.png')} style={s.mark}/><Text style={s.brandText}>Fazenda<Text style={s.plus}>+</Text></Text></View><Pressable accessibilityRole="button" accessibilityLabel={t.notifications} style={s.headerButton} onPress={() => open('notifications')}><HomeIcon name="bell" size={27} color="#FFF"/></Pressable><Pressable accessibilityRole="button" accessibilityLabel={t.profile} style={s.avatar} onPress={() => open('profile')}><Text style={s.avatarText}>{(session.user.full_name || session.user.email).split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase()}</Text></Pressable></View>
        <Svg pointerEvents="none" width="100%" height={37} viewBox="0 0 780 100" preserveAspectRatio="none" style={s.wave} aria-hidden={true}>
          <Path d="M0 70C140-25 230-2 390 60S610 40 780 9V100H0Z" fill="#A8E000"/>
          <Path d="M0 85C140 6 230 28 390 75S615 60 780 32V100H0Z" fill="#F6F8F1"/>
        </Svg>
      </View>
      <View style={s.content}>
        {session.user.access.role!=='feeder'&&<Pressable accessibilityRole="button" accessibilityLabel={workspaceMessages[language].search} onPress={() => router.push('/search')} style={s.search}><HomeIcon name="search"/><Text style={s.searchText}>{workspaceMessages[language].search}</Text></Pressable>}
        <View style={s.intro}><Text accessibilityRole="header" style={s.greeting}>{t.hello} <Text style={s.green}>{session.user.full_name.split(' ')[0] || session.organization.name}!</Text></Text><Text style={s.subtitle}>{financial ? t.summary : t.operational}</Text><Text style={s.organization}>{session.organization.name}</Text></View>
        {session.user.access.read_only && <Text style={s.notice}>{t.readonly}</Text>}
        <FarmContextButton/>
        <HomePriorities/>
        {financial && <>
          <Text style={s.caption}>{workspaceMessages[language].financialScope}</Text>
          <View style={s.period}>{button('‹',() => changeMonth(-1),undefined,t.previous)}<Text accessibilityLabel={t.period} style={s.periodText}>{new Intl.DateTimeFormat(language,{month:'long',year:'numeric'}).format(new Date(`${period}-15T12:00:00`))}</Text>{button('›',() => changeMonth(1),undefined,t.next)}</View>
          {loading ? <View style={s.state}><ActivityIndicator color="#247638"/><Text>{t.loading}</Text></View> : failed ? <View style={s.state}><Text accessibilityRole="alert">{t.error}</Text>{button(t.retry,refresh)}</View> : data && <>
            <View style={s.metrics}>{metric(t.costs,money.format(data.segments.crops.cost+data.segments.livestock.cost),'wallet')}{metric(t.expenses,money.format(data.kpis.month_expense),'wallet')}{metric(t.revenue,money.format(data.kpis.month_revenue),'trend')}{metric(t.balance,money.format(data.kpis.month_revenue-data.kpis.month_expense),'trend',t.balanceHint)}</View>
            {title(t.performance)}
            {segments.map((seg,index) => <View key={index} style={s.segment}><View style={s.row}><HomeIcon name="leaf"/><Text style={s.segmentTitle}>{seg.label}</Text>{seg.key && canOpenModule(session.user.access,seg.key) && <Pressable accessibilityRole="button" accessibilityLabel={seg.label} style={s.smallButton} onPress={() => open(seg.key!)}><HomeIcon name="arrow"/></Pressable>}</View><View style={s.stats}>{[[t.income,seg.revenue],[t.cost,seg.cost],[t.result,seg.profit]].map(([label,value]) => <View key={label} style={s.stat}><Text style={s.caption}>{label}</Text><Text style={s.statValue}>{money.format(Number(value))}</Text></View>)}</View></View>)}
            <View style={s.card}>{title(t.alerts)}{data.kpis.low_stock_items > 0 && button(`${t.lowStock}: ${number.format(data.kpis.low_stock_items)}`,() => open('inventory'),'box')}{!data.kpis.low_stock_items && <Text style={s.subtitle}>{t.noTasks}</Text>}</View>
            <View style={s.card}>{title(t.movements)}{!data.recent_activities.length && <Text style={s.subtitle}>{t.empty}</Text>}{data.recent_activities.slice(0,4).map((item,index) => <View key={index} style={s.activity}><Text style={s.grow}>{item.title}</Text><Text style={s.green}>{item.type === 'expense' ? '−' : '+'} {money.format(item.amount)}</Text></View>)}</View>
            <View style={s.card}><View style={s.row}><HomeIcon name="box"/>{title(t.inventory)}</View><View style={s.stats}>{[[t.stockValue,money.format(data.kpis.total_inventory_value)],[t.items,number.format(data.kpis.inventory_items)],[t.farms,number.format(data.kpis.farms_count)]].map(([label,value]) => <View style={s.inventoryStat} key={label}><Text style={s.caption}>{label}</Text><Text style={s.statValue}>{value}</Text></View>)}</View></View>
          </>}
        </>}
        {!financial && <View style={s.card}>{title(t.modules)}{allowed.filter(key => !['profile','notifications','support'].includes(key)).map(key => <View key={key}>{button(t[key],() => open(key),iconFor(key))}</View>)}</View>}
      </View>
    </ScrollView>
    <View pointerEvents="box-none" style={s.navBackdrop}>
    <View testID="home-navigation" style={s.nav}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill,s.navFill]}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} aria-hidden={true}>
        <Defs><LinearGradient id="home-navigation-fill" x1="0%" y1="0%" x2="100%" y2="100%"><Stop stopColor="#005626"/><Stop offset="1" stopColor="#00391D"/></LinearGradient></Defs>
        <Rect width="100%" height="100%" fill="url(#home-navigation-fill)"/>
      </Svg>
      </View>
      <Pressable accessibilityRole="tab" accessibilityState={{selected:!panel}} style={s.tab} onPress={() => setPanel(null)}><View style={[s.tabInner,!panel && s.tabSelected]}><HomeIcon name="home" size={28} color="#FFFFFF"/><Text style={!panel ? s.activeTab : s.tabText}>{t.home}</Text></View></Pressable>
      {canOpenModule(session.user.access,'agenda') && <Pressable accessibilityRole="tab" style={s.tab} onPress={() => open('agenda')}><View style={s.tabInner}><HomeIcon name="agenda" size={26} color="#FFF"/><Text style={s.tabText}>{t.agenda}</Text></View></Pressable>}
      {!session.user.access.read_only && writable.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={t.create} style={s.create} onPress={() => {setQuery('');setPanel('create');}}><View style={s.createCircle}><Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill} aria-hidden={true}><Defs><LinearGradient id="home-create-fill" x1="0%" y1="0%" x2="100%" y2="100%"><Stop stopColor="#EDFF2C"/><Stop offset="1" stopColor="#B9F000"/></LinearGradient></Defs><Rect width="100%" height="100%" rx={30} fill="url(#home-create-fill)"/></Svg><View style={s.createIcon}><HomeIcon name="plus" size={32} color="#123A1D"/></View></View><Text style={s.createText}>{t.create}</Text></Pressable>}
      {financial && <Pressable accessibilityRole="tab" style={s.tab} onPress={() => open('finance')}><View style={s.tabInner}><HomeIcon name="chart" size={26} color="#FFF"/><Text style={s.tabText}>{t.finance}</Text></View></Pressable>}
      <Pressable accessibilityRole="tab" style={s.tab} onPress={() => {setQuery('');setPanel('modules');}}><View style={s.tabInner}><HomeIcon name="modules" size={26} color="#FFF"/><Text style={s.tabText}>{t.modules}</Text></View></Pressable>
    </View>
    </View>
    <Modal visible={!!panel} transparent animationType="fade" onRequestClose={() => setPanel(null)}><SafeAreaView style={s.overlay}><View accessibilityViewIsModal style={s.sheet}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.sheetContent}><View style={s.row}><Text accessibilityRole="header" style={[s.sectionTitle,s.grow]}>{currentModule ? t[currentModule] : panel === 'create' ? t.create : t.modules}</Text>{button(t.close,() => setPanel(null))}</View>
      {currentModule ? <><Text style={s.subtitle}>{t.pending}</Text>{linkFailed && <Text accessibilityRole="alert">{t.failedLink}</Text>}{button(t.web,() => void goWeb(currentModule),'arrow')}{currentModule === 'profile' && button(t.logout,() => void controller.signOut())}</> : <>{panel === 'create' && <Text style={s.subtitle}>{t.choose}</Text>}<TextInput accessibilityLabel={t.search} placeholder={t.search} placeholderTextColor="#657268" value={query} onChangeText={setQuery} style={s.searchInput}/>{listed.map(key => <View key={key}>{button(t[key],() => open(key),iconFor(key))}</View>)}{!listed.length && <Text>{t.noResults}</Text>}</>}
    </ScrollView></View></SafeAreaView></Modal>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  brand:{flex:1,flexDirection:'row',alignItems:'center',gap:4,minWidth:0},mark:{width:39,height:42,resizeMode:'contain'},brandText:{fontSize:25,fontWeight:'800',color:'#FFF',flexShrink:1},plus:{color:'#FFD600',fontSize:29},safe:{flex:1,backgroundColor:'#003E22'},scroll:{flexGrow:1,backgroundColor:'#F6F8F1',paddingBottom:68},heroImage:{position:'absolute',left:0,opacity:1},hero:{minHeight:92,paddingBottom:22,backgroundColor:'#004329',overflow:'hidden'},header:{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:10,paddingBottom:16,gap:6},headerButton:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},avatar:{width:44,minHeight:44,borderRadius:22,backgroundColor:'#FFF',alignItems:'center',justifyContent:'center'},avatarText:{fontSize:16,fontWeight:'700',color:'#164B26'},wave:{position:'absolute',bottom:-1,left:0},content:{width:'100%',maxWidth:720,alignSelf:'center',paddingHorizontal:16,gap:12},search:{flexDirection:'row',gap:10,alignItems:'center',minHeight:48,padding:12,backgroundColor:'#EBF0E7',borderWidth:1,borderColor:'#D4DED1',borderRadius:24},searchText:{fontSize:16,color:'#526456',flex:1},intro:{gap:3,paddingVertical:3},greeting:{fontSize:27,fontWeight:'800',color:'#142719'},green:{color:'#1D752D',fontWeight:'700'},subtitle:{fontSize:14,lineHeight:21,color:'#536353'},organization:{fontSize:12,color:'#536353'},period:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:6},periodText:{flex:1,textAlign:'center',fontSize:14,fontWeight:'700',color:'#24472C'},metrics:{flexDirection:'row',flexWrap:'wrap',gap:10},metricHeading:{flexDirection:'row',alignItems:'center',gap:8},metric:{width:'48%',flexGrow:1,gap:8,padding:12,borderRadius:17,backgroundColor:'#FFF',borderWidth:1,borderColor:'#E0E5D9',boxShadow:'0 3px 8px rgba(38,60,25,0.06)'},iconTile:{padding:7,backgroundColor:'#EFF6E6',borderRadius:10},caption:{fontSize:12,color:'#536353',lineHeight:18},amount:{fontSize:20,fontWeight:'800',color:'#122B1A',flexShrink:1},note:{fontSize:11,color:'#1D752D',lineHeight:16},grow:{flex:1,minWidth:0},sectionTitle:{fontSize:18,fontWeight:'800',color:'#162D1D',marginVertical:5},segment:{padding:12,backgroundColor:'#FFF',borderRadius:16,borderWidth:1,borderColor:'#E0E5D9',gap:6},row:{flexDirection:'row',alignItems:'center',gap:10,flexWrap:'wrap'},segmentTitle:{fontSize:16,fontWeight:'700',flex:1,color:'#142719'},smallButton:{minWidth:44,minHeight:44,justifyContent:'center',alignItems:'center'},stats:{flexDirection:'row',flexWrap:'wrap',gap:10},stat:{flex:1,minWidth:76},statValue:{fontSize:14,fontWeight:'700',color:'#193B24'},inventoryStat:{flexGrow:1,minWidth:100},card:{padding:14,backgroundColor:'#FFF',borderWidth:1,borderColor:'#E0E5D9',borderRadius:16,gap:8},task:{fontSize:14,color:'#34543C',paddingVertical:8},activity:{flexDirection:'row',gap:8,borderTopWidth:1,borderColor:'#EDF0E8',paddingVertical:10},notice:{padding:12,backgroundColor:'#EAF2DB',color:'#28452B',borderRadius:10},state:{padding:24,gap:12,alignItems:'center'},button:{minWidth:44,minHeight:44,paddingVertical:10,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:9,borderRadius:10,backgroundColor:'#F0F5E9',flexShrink:1},buttonText:{fontSize:14,fontWeight:'600',color:'#235D30',flexShrink:1},pressed:{opacity:0.65},navBackdrop:{backgroundColor:'transparent',paddingTop:20,marginTop:-48},navFill:{backgroundColor:'#00451F',borderTopLeftRadius:28,borderTopRightRadius:28,overflow:'hidden'},nav:{flexDirection:'row',alignItems:'center',justifyContent:'space-around',backgroundColor:'transparent',borderTopLeftRadius:28,borderTopRightRadius:28,paddingHorizontal:10,paddingTop:5,paddingBottom:8,gap:2,minHeight:82},tab:{flex:1,minHeight:64,alignItems:'center',justifyContent:'center'},tabInner:{minHeight:58,minWidth:44,paddingHorizontal:8,paddingVertical:6,borderRadius:15,alignItems:'center',justifyContent:'center',gap:3},tabSelected:{backgroundColor:'#337F00',borderWidth:1,borderColor:'#4E9905',boxShadow:'inset 0 0 12px rgba(175,245,0,0.14)'},tabText:{fontSize:11,color:'#FFF',textAlign:'center'},activeTab:{fontSize:11,color:'#DFFF48',fontWeight:'700',textAlign:'center'},create:{flex:1.05,minWidth:60,minHeight:80,alignItems:'center',justifyContent:'flex-start',marginTop:-27,gap:3},createIcon:{zIndex:1},createCircle:{width:66,height:66,borderRadius:33,borderWidth:5,borderColor:'#00451F',backgroundColor:'#D1F900',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 8px rgba(0,24,10,0.25)'},createText:{fontSize:10,fontWeight:'600',color:'#FFF',textAlign:'center'},overlay:{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(0,25,12,.5)'},sheet:{maxHeight:'85%',width:'100%',maxWidth:640,alignSelf:'center',borderTopLeftRadius:24,borderTopRightRadius:24,backgroundColor:'#FFF'},sheetContent:{padding:20,gap:12},searchInput:{fontSize:16,minHeight:48,borderWidth:1,borderColor:'#CDD9C6',padding:12,borderRadius:12,color:'#142719'},
});
