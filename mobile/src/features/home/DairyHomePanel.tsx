import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import { AgendaButton, Busy, styles as ui } from '../agenda/ui';
import { dairyMessages } from '../cattle/dairyMessages';
import { organizationDay } from '../workspace/contracts';
import { workspaceMessages } from '../workspace/messages';
import { colors, radius, space, touchTarget, type } from '../../theme/tokens';

// Compact month snapshot of the dairy herd; the full overview stays in /cattle/dairy.
export function DairyHomePanel() {
  const { controller, language, state } = useAuth();
  const t = dairyMessages[language], w = workspaceMessages[language];
  const router = useRouter();
  const userId = state.status === 'signedIn' ? state.session.user.id : null;
  const query = useQuery({
    queryKey: ['home-dairy', userId],
    enabled: !!userId,
    staleTime: 60000,
    queryFn: async ({ signal }) => {
      const options = await controller.agendaOptions(signal);
      if (options.user_id !== userId) throw new Error('actor');
      return controller.dairyOverview(organizationDay(options.timezone), signal);
    },
  });
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });
  const liters = (value: string | null) => value === null ? '—' : `${number.format(Number(value))} L`;
  const open = () => router.push({ pathname: '/cattle/[production]', params: { production: 'dairy' } });
  return <View style={p.wrap}>
    <View style={ui.sectionHeader}><Text accessibilityRole="header" style={ui.sectionHeading}>{t.summary}</Text><Pressable accessibilityRole="link" accessibilityLabel={t.overview} onPress={open} hitSlop={6} style={p.link}><Text style={p.linkText}>{t.overview} ›</Text></Pressable></View>
    {query.isPending ? <Busy label={w.loading}/> : query.isError || !query.data ? <View style={ui.card}><Text accessibilityRole="alert" style={ui.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={() => void query.refetch()}/></View> :
      <Pressable accessibilityRole="button" accessibilityLabel={t.overview} onPress={open} style={({ pressed }) => [p.panel, pressed && p.pressed]}>
        {[
          [t.monthlyProduction, liters(query.data.monthly_produced_liters)],
          [t.lactating, `${number.format(query.data.lactating_cows)} / ${number.format(query.data.total_cows)}`],
          [t.monthlyAverage, liters(query.data.monthly_average_per_lactating_cow)],
          [t.monthlyDiscard, liters(query.data.monthly_discarded_liters)],
        ].map(([label, value]) => <View key={label} style={p.cell}><Text style={p.label} numberOfLines={2}>{label}</Text><Text style={p.value} numberOfLines={1} adjustsFontSizeToFit>{value}</Text></View>)}
      </Pressable>}
  </View>;
}
const p = StyleSheet.create({
  wrap: { gap: space.sm },
  link: { minHeight: touchTarget, justifyContent: 'center' }, linkText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  panel: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, overflow: 'hidden' },
  pressed: { backgroundColor: colors.primarySoft },
  cell: { flexBasis: '50%', flexGrow: 1, minWidth: 140, padding: space.md, gap: 4, borderColor: colors.divider, borderBottomWidth: 1 },
  label: { ...type.caption, fontWeight: '600' },
  value: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: colors.forest, ...type.numeric },
});
