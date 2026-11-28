import {Switch, Text, TextInput, View} from 'react-native';
import {AgendaButton, styles as s} from '../agenda/ui';
import type {Language} from '../../i18n/messages';
import type {UserContact} from './contactContracts';
import {contactMessages} from './contactMessages';

export function UserContacts({contacts, defaults, onChange, disabled, language}: {
  contacts?: UserContact[] | null;
  defaults: () => UserContact[];
  onChange: (contacts: UserContact[]) => void;
  disabled: boolean;
  language: Language;
}) {
  const t = contactMessages[language];
  const rows = contacts ?? [];
  function update(index: number, next: UserContact) {
    onChange(rows.map((row, current) => current === index ? next : row));
  }
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.title}>{t.title}</Text>
    <Text style={s.body}>{t.hint}</Text>
    {rows.map((row, index) => {
      const channels: UserContact['notifications'] = row.kind === 'email' ? ['email'] : [
        ...(row.is_whatsapp ? ['whatsapp' as const] : []), ...(row.is_telegram ? ['telegram' as const] : []),
      ];
      return <View key={index} style={s.card}>
        <TextInput accessibilityLabel={t.name} placeholder={t.name} style={s.input} editable={!disabled} value={row.name} maxLength={150} onChangeText={name => update(index, {...row, name})} />
        <View style={[s.row, {flexWrap: 'wrap'}]}>
          {(['phone', 'email'] as const).map(kind => <AgendaButton key={kind} label={kind === 'phone' ? t.phone : 'E-mail'} selected={row.kind === kind} disabled={disabled} onPress={() => {
            if (row.kind !== kind) update(index, {...row, kind, value: '', is_whatsapp: false, is_telegram: false, notifications: []});
          }} />)}
        </View>
        <TextInput accessibilityLabel={t.value} placeholder={t.value} style={s.input} editable={!disabled} maxLength={255} keyboardType={row.kind === 'email' ? 'email-address' : 'phone-pad'} value={row.value} onChangeText={value => update(index, {...row, value})} />
        {row.kind === 'phone' && (['whatsapp', 'telegram'] as const).map(channel => {
          const label = channel === 'telegram' ? t.hasTelegram : t.hasWhatsApp;
          return <View key={channel} style={s.row}><Text style={[s.body, {flex: 1}]}>{label}</Text><Switch accessibilityLabel={label} disabled={disabled} value={row[`is_${channel}`]} onValueChange={value => update(index, {...row, [`is_${channel}`]: value, notifications: value ? row.notifications : row.notifications.filter(item => item !== channel)})} /></View>;
        })}
        {channels.map(channel => <View key={channel} style={s.row}><Text style={[s.body, {flex: 1}]}>{t[`notify.${channel}`]}</Text><Switch accessibilityLabel={t[`notify.${channel}`]} disabled={disabled || rows.some((other, current) => current !== index && other.notifications.includes(channel))} value={row.notifications.includes(channel)} onValueChange={value => update(index, {...row, notifications: value ? [...row.notifications, channel] : row.notifications.filter(item => item !== channel)})} /></View>)}
        <AgendaButton label={t.remove} disabled={disabled} onPress={() => onChange(rows.filter((_, current) => current !== index))} />
      </View>;
    })}
    <AgendaButton label={t.add} disabled={disabled} onPress={() => onChange([...(contacts ?? defaults()), {name: '', kind: 'phone', value: '', is_whatsapp: false, is_telegram: false, notifications: []}])} />
  </View>;
}
