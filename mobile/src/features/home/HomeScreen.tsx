import {WorkspaceShell} from '../workspace/WorkspaceShell';
import {moduleKeys,iconFor} from '../workspace/navigation';
import {homeStyles as s} from './styles';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import type { Session } from '../auth/contracts';
import { canLoadFinancialHome, canOpenModule, type Dashboard, type ModuleKey } from './contracts';
import { homeMessages } from './messages';
import { HomeIcon, type HomeIconName } from './HomeIcon';
export function HomeScreen({ session }: { session: Session }) {
  const { language, controller } = useAuth();
  const t = homeMessages[language];
  const { width } = useWindowDimensions();
  const [period, setPeriod] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; });
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const financial = canLoadFinancialHome(session.user.access);
  const allowed = moduleKeys.filter(key => canOpenModule(session.user.access, key));
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
  const button = (label: string, onPress: () => void, icon?: HomeIconName, accessibilityLabel?: string) => <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress} style={({pressed}) => [s.button,pressed && s.pressed]}>{icon && <HomeIcon name={icon}/>}<Text style={s.buttonText}>{label}</Text></Pressable>;
  const title = (text: string) => <Text accessibilityRole="header" style={s.sectionTitle}>{text}</Text>;
  const metric = (label: string, value: string, icon: HomeIconName, note?: string) => <View key={label} style={[s.metric, width < 350 && { width:'100%' }]}><View style={s.metricHeading}><View style={s.iconTile}><HomeIcon name={icon} size={22}/></View><Text style={[s.caption,s.grow]}>{label}</Text></View><Text style={s.amount}>{value}</Text>{note && <Text style={s.note}>{note}</Text>}</View>;
  const segments = data ? [...(canOpenModule(session.user.access,'crops') ? [{ key:'crops' as ModuleKey, label:t.crops,...data.segments.crops }] : []), ...(data.segments.livestock_by_species?.map(segment => ({...segment,key:(segment.code === 'suinos' ? 'swine' : segment.code === 'bovinos' ? 'beef' : null) as ModuleKey | null,label:segment.code === 'suinos' ? t.swine : segment.code === 'bovinos' ? `${t.beef} / ${t.dairy}` : segment.name })) ?? [])] : [];
  return <WorkspaceShell active="home">{open=><>
    <ScrollView testID="home-scroll" contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" refreshControl={financial ? <RefreshControl refreshing={loading} onRefresh={refresh}/> : undefined}>
      <View style={s.content}>
        <View style={s.intro}><Text accessibilityRole="header" style={s.greeting}>{t.hello} <Text style={s.green}>{session.user.full_name.split(' ')[0] || session.organization.name}!</Text></Text></View>
        {session.user.access.read_only && <Text style={s.notice}>{t.readonly}</Text>}
        {financial && <>
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
  </>}</WorkspaceShell>;
}
