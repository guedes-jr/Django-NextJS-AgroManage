import { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, Platform, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { isAxiosError } from 'axios';
import { z } from 'zod';
import { useAuth } from '../auth/AuthProvider';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { FarmContextButton } from '../workspace/FarmContextButton';
import { workspaceMessages } from '../workspace/messages';
import { AgendaButton, AgendaShell, Busy, styles as s } from '../agenda/ui';
import { DairyFeedingSaveUnconfirmed, authError } from '../../services/authApi';
import { canReadDairyFeeding, canWriteDairyFeeding, dairyFeedingCancellationSchema, dairyFeedingHistoryQuerySchema, type DairyFeedingWrite } from './dairyFeedingContracts';
import { dairyFeedingFormMessages, dairyFeedingMessages } from './dairyFeedingMessages';

const routeSchema = z.object({ farm: z.uuid().optional() });

function dayLabel(day: string, language: string) {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
}

function number(value: string, language: string) {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(Number(value));
}

export function DairyFeedingHistoryScreen() {
  const params = useLocalSearchParams<{ farm?: string }>();
  const route = routeSchema.safeParse(params);
  const { state, controller, language } = useAuth();
  const { farm } = useWorkspace();
  const router = useRouter();
  const client = useQueryClient();
  const t = dairyFeedingMessages[language];
  const f = dairyFeedingFormMessages[language];
  const w = workspaceMessages[language];
  const [paging, setPaging] = useState({ farm: '', page: 1 });
  const farmId = farm?.id;
  const page = paging.farm === farmId ? paging.page : 1;
  const routeFarmChanged = route.success && !!route.data.farm && route.data.farm !== farmId;
  const allowed = route.success && state.status === 'signedIn' && canReadDairyFeeding(state.session.user) && !routeFarmChanged;
  const writable = allowed && state.status === 'signedIn' && canWriteDairyFeeding(state.session.user);
  const [cancelTarget, setCancelTarget] = useState<{ source: string; index: number; name: string } | null>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<DairyFeedingWrite | null>(null);
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState('');
  const [writeMessage, setWriteMessage] = useState('');
  const lock = useRef(false);

  const query = useQuery({
    queryKey: ['dairy-feeding-history', farmId, page],
    enabled: allowed && !!farmId,
    staleTime: 0,
    queryFn: ({ signal }) => {
      if (!farmId) throw new Error('farm required');
      const query = dairyFeedingHistoryQuerySchema.parse({ farm: farmId, page });
      return controller.dairyFeedingHistory(query.farm, query.page, signal);
    },
  });
  const { refetch } = query;
  usePreventRemove(!!cancelTarget || !!pending, ({ repeat }) => {
    if (lock.current) return;
    const body = pending ? f.leaveUncertain : f.draftWarning;
    const leave = () => repeat();
    if (Platform.OS === 'web') {
      if (window.confirm(body)) leave();
    } else {
      Alert.alert(f.cancelGroup, body, [
        { text: f.stay, style: 'cancel' },
        { text: f.discard, style: 'destructive', onPress: leave },
      ]);
    }
  });
  useFocusEffect(useCallback(() => {
    if (allowed && farmId) void refetch();
  }, [allowed, farmId, refetch]));

  const back = () => router.canGoBack() ? router.back() : router.replace('/milk');
  const data = !allowed || !farmId || query.isError ? undefined : query.data;
  async function submitCancellation(write: DairyFeedingWrite) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setWriteError('');
    setWriteMessage('');
    try {
      await controller.saveDairyFeeding(write);
      setPending(null);
      setCancelTarget(null);
      setReason('');
      setWriteMessage(f.cancelSuccess);
      void client.invalidateQueries({ queryKey: ['dairy-feeding-history', farmId] });
    } catch (error) {
      if (error instanceof DairyFeedingSaveUnconfirmed) {
        setPending(write);
        setWriteError(f.uncertain);
      } else {
        setPending(null);
        setWriteError(error instanceof z.ZodError ? f.cancelReason : authError(error).detail ?? w.error);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function reconcileCancellation() {
    if (!pending || lock.current) return;
    lock.current = true;
    setBusy(true);
    setWriteError('');
    try {
      await controller.dairyFeedingReceipt(pending);
      setPending(null);
      setCancelTarget(null);
      setReason('');
      setWriteMessage(f.cancelSuccess);
      void client.invalidateQueries({ queryKey: ['dairy-feeding-history', farmId] });
    } catch (error) {
      setWriteError(isAxiosError(error) && error.response?.status === 404 ? f.noReceipt : authError(error).detail ?? w.error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function startCancellation(source: string, index: number, name: string) {
    setCancelTarget({ source, index, name });
    setReason('');
    setWriteError('');
    setWriteMessage('');
  }
  function confirmCancellation() {
    if (!cancelTarget || !farmId) return;
    const parsed = dairyFeedingCancellationSchema.safeParse({
      farm: farmId,
      request_key: randomUUID(),
      source_key: cancelTarget.source,
      group_index: cancelTarget.index,
      reason,
    });
    if (!parsed.success) {
      setWriteError(f.cancelReason);
      return;
    }
    const write = { kind: 'cancel', command: parsed.data } satisfies DairyFeedingWrite;
    setPending(write);
    void submitCancellation(write);
  }

  return (
    <AgendaShell title={t.history} backLabel={w.back} onBack={back}>
      <FlatList
        data={data?.results ?? []}
        keyExtractor={row => row.request_key}
        contentContainerStyle={s.content}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 12 }}>
            <FarmContextButton />
            {!allowed && <Text style={s.error}>{routeFarmChanged ? t.contextChanged : w.noAccess}</Text>}
            {allowed && !farmId && <Text style={s.muted}>{t.selectFarm}</Text>}
            {writable && farmId && <AgendaButton label={f.openForm} disabled={busy || !!pending || query.isFetching} onPress={() => router.push({ pathname: '/milk/group-feeding', params: { farm: farmId } })} />}
            {!!writeMessage && <Text accessibilityRole="alert" style={s.badge}>{writeMessage}</Text>}
            {busy && pending && <Busy label={w.loading} />}
            {!!pending && !busy && (
              <View style={[s.card, { borderColor: '#B78024' }]}>
                <Text accessibilityRole="alert" style={s.error}>{writeError || f.uncertain}</Text>
                <Text selectable style={s.muted}>{pending.command.request_key}</Text>
                <AgendaButton label={busy ? w.loading : f.checkReceipt} disabled={busy} onPress={() => void reconcileCancellation()} />
                <AgendaButton label={busy ? w.loading : f.retrySame} disabled={busy} onPress={() => void submitCancellation(pending)} />
              </View>
            )}
            {!!cancelTarget && !pending && (
              <View style={s.card}>
                <Text accessibilityRole="header" style={s.title}>{f.cancelGroup}: {cancelTarget.name}</Text>
                <TextInput
                  accessibilityLabel={f.cancelReason}
                  style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
                  value={reason}
                  maxLength={500}
                  multiline
                  editable={!busy}
                  placeholder={f.cancelReason}
                  onChangeText={setReason}
                />
                {!!writeError && <Text accessibilityRole="alert" style={s.error}>{writeError}</Text>}
                <View style={s.row}>
                  <AgendaButton label={f.stay} disabled={busy} onPress={() => setCancelTarget(null)} />
                  <AgendaButton label={busy ? w.loading : f.confirmCancel} disabled={busy || !reason.trim()} onPress={confirmCancellation} />
                </View>
              </View>
            )}
            {!!writeError && !cancelTarget && !pending && <Text accessibilityRole="alert" style={s.error}>{writeError}</Text>}
            {query.isFetching && <Busy label={w.loading} />}
            {query.isError && (
              <View style={s.card}>
                <Text accessibilityRole="alert" style={s.error}>{w.error}</Text>
                <AgendaButton label={w.retry} onPress={() => void refetch()} />
                {page > 1 && <AgendaButton label={`${w.page} 1`} onPress={() => setPaging({ farm: farmId ?? '', page: 1 })} />}
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={[s.card, { gap: 10 }]}>
            <Text accessibilityRole="header" style={s.title}>
              {item.period_start === item.date ? dayLabel(item.date, language) : `${dayLabel(item.period_start, language)} – ${dayLabel(item.date, language)}`}
            </Text>
            {!!item.notes && <Text style={s.body}>{t.notes}: {item.notes}</Text>}
            {item.groups.map((group, index) => (
              <View key={`${item.request_key}:${index}`} style={{ gap: 6, borderTopWidth: 1, borderColor: '#DCE5D7', paddingTop: 8 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 }}>
                  <Text style={s.heading}>{group.name}</Text>
                  <Text style={s.badge}>{group.cancelled ? t.cancelled : t.supplied}</Text>
                </View>
                <Text style={s.muted}>{group.head_count} {t.heads.toLowerCase()}</Text>
                {group.feeds.map(feed => (
                  <View key={feed.item} style={{ gap: 2 }}>
                    <Text style={s.body}>{t.feed}: {feed.name}</Text>
                    <Text style={s.muted}>
                      {number(feed.quantity_kg, language)} kg {feed.mode === 'per_head_day' ? t.perHeadDay : t.periodTotal}
                      {' · '}{t.total}: {number(feed.total_kg, language)} kg
                    </Text>
                  </View>
                ))}
                {writable && !group.cancelled && (
                  <AgendaButton
                    label={f.cancelGroup}
                    disabled={busy || !!pending || !!cancelTarget || query.isFetching}
                    onPress={() => startCancellation(item.request_key, index, group.name)}
                  />
                )}
              </View>
            ))}
          </View>
        )}
        ListEmptyComponent={Boolean(allowed && farmId && !query.isPending && !query.isError && data?.count === 0)
          ? <View style={[s.card, { alignItems: 'center' }]}><Text style={s.body}>{t.empty}</Text></View>
          : undefined}
        ListFooterComponent={data && (data.previous || data.next) ? (
          <View style={[s.row, { justifyContent: 'center' }]}>
            <AgendaButton label={w.previous} disabled={!data.previous || query.isFetching} onPress={() => setPaging({ farm: farmId ?? '', page: Math.max(1, page - 1) })} />
            <Text style={s.muted}>{w.page} {page}</Text>
            <AgendaButton label={w.next} disabled={!data.next || query.isFetching} onPress={() => setPaging({ farm: farmId ?? '', page: page + 1 })} />
          </View>
        ) : undefined}
      />
    </AgendaShell>
  );
}
