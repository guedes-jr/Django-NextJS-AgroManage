import {useEffect, useState, type ReactNode} from 'react';
import {Linking, Text, View} from 'react-native';
import {useAuth} from '../auth/AuthProvider';
import {AgendaButton, styles as s} from '../agenda/ui';
import type {TelegramConnection, TelegramConnectionAction} from './contracts';
import {telegramMessages} from './messages';

export function TelegramPreferences({children}: {children?: ReactNode}) {
  const {controller, language} = useAuth();
  const t = telegramMessages[language];
  const [connection, setConnection] = useState<TelegramConnection | null>(null);
  const [link, setLink] = useState<string>();
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    void controller.telegramConnection(abort.signal)
      .then(setConnection)
      .catch(() => { if (!abort.signal.aborted) setFailed(true); })
      .finally(() => { if (!abort.signal.aborted) setBusy(false); });
    return () => abort.abort();
  }, [controller]);

  async function run(action?: TelegramConnectionAction) {
    setBusy(true);
    setFailed(false);
    try {
      const result = action
        ? await controller.updateTelegramConnection(action)
        : await controller.telegramConnection();
      setConnection(result);
      if (result.status !== 'awaiting_telegram' || result.link) setLink(result.link);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const status = connection?.status;
  if (status === 'unavailable') return null;
  return (
    <View style={s.card} accessibilityState={{busy}}>
      <Text style={s.title}>Telegram</Text>
      {status && <Text style={s.body} accessibilityLiveRegion="polite">{t[status]}</Text>}
      {!status && busy && <Text style={s.body}>{t.loading}</Text>}
      {connection?.requires_phone_verification && <Text style={s.body}>{t.awaiting_phone}</Text>}
      {failed && <Text style={s.error} accessibilityRole="alert">{t.failed}</Text>}
      {status === 'connected' && children}
      <View style={[s.row, {flexWrap: 'wrap'}]}>
        {(status === 'disconnected' || status === 'awaiting_telegram') &&
          <AgendaButton label={status === 'disconnected' ? t.connect : t.newLink} disabled={busy} onPress={() => void run('start')} />}
        {status === 'awaiting_telegram' && link &&
          <AgendaButton label={t.open} disabled={busy} onPress={() => void Linking.openURL(link).catch(() => setFailed(true))} />}
        {status === 'ready_to_confirm' &&
          <AgendaButton label={t.confirm} disabled={busy} onPress={() => void run('confirm')} />}
        {status && status !== 'disconnected' &&
          <AgendaButton label={status === 'connected' ? t.disconnect : t.cancel} disabled={busy} onPress={() => void run('remove')} />}
        {(failed || status === 'awaiting_telegram' || status === 'awaiting_phone' || status === 'connected') &&
          <AgendaButton label={t.refresh} disabled={busy} onPress={() => void run()} />}
      </View>
    </View>
  );
}
