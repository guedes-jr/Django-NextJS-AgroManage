import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { canReadCattle } from '../cattle/contracts';
import { AgendaButton, styles as s } from '../agenda/ui';
import { parseApiUrl } from '../../config/environment';
import { isPeriodMilkTotal, milkCalendarDate, milkTotalDateLabel, type MilkTotal } from './contracts';
import { milkMessages } from './messages';

export function MilkPeriodDetails({ record }: { record: MilkTotal }) {
  const { state, language } = useAuth();
  const t = milkMessages[language];
  const [failed, setFailed] = useState(false);
  if (!isPeriodMilkTotal(record)) return null;
  const allowed = state.status === 'signedIn' && canReadCattle(state.session.user);
  const open = async () => {
    const site = parseApiUrl(process.env.EXPO_PUBLIC_SITE_URL ?? 'https://fazendamais.com', __DEV__);
    if (!allowed || !site) { setFailed(true); return; }
    try {
      setFailed(false);
      await Linking.openURL(new URL('home/seguimento/pecuaria-leiteira/leite', site).href);
    } catch { setFailed(true); }
  };
  return <View style={{ gap: 8 }}>
    <Text style={s.label}>{t.period}</Text>
    <Text style={s.body}>{milkTotalDateLabel(record, language)}</Text>
    <Text style={s.muted}>{t.bookedOn}: {milkCalendarDate(record.date, language)}</Text>
    <Text style={s.body}>{t.periodReadonly}</Text>
    {allowed && <><AgendaButton label={t.openWeb} onPress={() => void open()} /><Text style={s.muted}>{t.webHint}</Text></>}
    {failed && <Text accessibilityRole="alert" style={s.error}>{t.webFailed}</Text>}
  </View>;
}
