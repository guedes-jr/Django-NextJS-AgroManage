import {useCallback, useRef, useState} from 'react';
import {Alert, Platform, Switch, Text, TextInput, View} from 'react-native';
import type {z} from 'zod';
import {AgendaButton, styles as s} from '../agenda/ui';
import {useAuth} from '../auth/AuthProvider';
import {initialContacts, type UserContact} from '../auth/contactContracts';
import {contactMessages} from '../auth/contactMessages';
import {UserContacts} from '../auth/UserContacts';
import type {OrganizationContact, OrganizationContactDraft, profileSchema} from './contracts';
import {workspaceMessages} from './messages';
import {useRead} from './useRead';

export function PersonalContacts({profile, onSaved}: {profile: z.infer<typeof profileSchema>; onSaved: () => void}) {
  const {controller, language} = useAuth();
  const t = contactMessages[language];
  const w = workspaceMessages[language];
  const [draft, setDraft] = useState<UserContact[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const save = async () => {
    if (!draft || busy) return;
    setFailed(false);
    setBusy(true);
    try {
      await controller.saveProfileContacts(draft);
      setDraft(null);
      onSaved();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return <View style={s.card}>
    <UserContacts contacts={draft ?? profile.contacts} defaults={() => initialContacts(profile.email, profile.phone ?? '', !!profile.phone_is_whatsapp, !!profile.phone_is_telegram)}
      onChange={setDraft} disabled={busy} language={language} />
    {draft !== null && <View style={s.row}>
      <AgendaButton label={t.save} disabled={busy} onPress={() => void save()} />
      <AgendaButton label={t.cancel} disabled={busy} onPress={() => {setDraft(null); setFailed(false);}} />
    </View>}
    {failed && <Text accessibilityRole="alert" style={s.error}>{w.error}</Text>}
  </View>;
}

const blank: OrganizationContactDraft = {name: '', value: '', contact_type: 'phone', is_main: false};
const types = ['phone', 'email', 'whatsapp', 'telegram', 'other'] as const;

export function OrganizationContacts({canEdit}: {canEdit: boolean}) {
  const {controller, language} = useAuth();
  const t = contactMessages[language];
  const w = workspaceMessages[language];
  const [version, setVersion] = useState(0);
  const [draft, setDraft] = useState<OrganizationContactDraft | null>(null);
  const [editing, setEditing] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const load = useCallback((signal: AbortSignal) => controller.organizationContacts(signal), [controller]);
  const result = useRead(String(version), load);

  const labels = {phone: t.phone, email: 'E-mail', whatsapp: 'WhatsApp', telegram: 'Telegram', other: t.other};
  function open(contact?: OrganizationContact) {
    setEditing(contact?.id);
    setDraft(contact ? {name: contact.name, value: contact.value, contact_type: contact.contact_type, is_main: contact.is_main} : blank);
    setFailed(false);
  }
  async function apply(operation: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await operation();
      setDraft(null);
      setVersion(value => value + 1);
    } catch {
      setFailed(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function remove(contact: OrganizationContact) {
    const action = () => void apply(() => controller.removeOrganizationContact(contact.id));
    if (Platform.OS === 'web') {
      if (window.confirm(t.removeQuestion)) action();
    } else {
      Alert.alert(t.removeQuestion, contact.name, [{text: t.cancel, style: 'cancel'}, {text: t.remove, style: 'destructive', onPress: action}]);
    }
  }
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.title}>{t.organization}</Text>
    {result.loading && <Text style={s.body}>{w.loading}</Text>}
    {result.failed && <><Text style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={() => setVersion(value => value + 1)} /></>}
    {result.data?.length === 0 && <Text style={s.muted}>{w.empty}</Text>}
    {result.data?.map(contact => <View key={contact.id} style={s.card}>
      <Text style={s.body}>{contact.name} · {labels[contact.contact_type]}</Text>
      <Text style={s.muted}>{contact.value}{contact.is_main ? ` · ${t.primary}` : ''}</Text>
      {canEdit && <View style={s.row}>
        <AgendaButton label={t.edit} disabled={busy} onPress={() => open(contact)} />
        <AgendaButton label={t.remove} disabled={busy} onPress={() => remove(contact)} />
      </View>}
    </View>)}
    {canEdit && !draft && <AgendaButton label={t.add} disabled={busy} onPress={() => open()} />}
    {canEdit && draft && <View style={s.card}>
      <TextInput style={s.input} accessibilityLabel={t.name} placeholder={t.name} editable={!busy} maxLength={150} value={draft.name} onChangeText={name => setDraft({...draft, name})} />
      <View style={s.row}>{types.map(type => <AgendaButton key={type} label={labels[type]} selected={draft.contact_type === type} disabled={busy} onPress={() => setDraft({...draft, contact_type: type})} />)}</View>
      <TextInput style={s.input} accessibilityLabel={t.value} placeholder={t.value} editable={!busy} maxLength={255} value={draft.value} onChangeText={value => setDraft({...draft, value})} />
      <View style={s.row}><Text style={s.body}>{t.primary}</Text><Switch accessibilityLabel={t.primary} disabled={busy} value={draft.is_main} onValueChange={is_main => setDraft({...draft, is_main})} /></View>
      <View style={s.row}>
        <AgendaButton label={t.save} disabled={busy || !draft.name.trim() || !draft.value.trim()} onPress={() => void apply(() => controller.saveOrganizationContact({...draft, name: draft.name.trim(), value: draft.value.trim()}, editing))} />
        <AgendaButton label={t.cancel} disabled={busy} onPress={() => {setDraft(null); setFailed(false);}} />
      </View>
    </View>}
    {failed && <Text accessibilityRole="alert" style={s.error}>{w.error}</Text>}
  </View>;
}
