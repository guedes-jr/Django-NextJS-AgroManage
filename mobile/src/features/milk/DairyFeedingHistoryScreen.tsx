import { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, Platform, RefreshControl, Text, TextInput, View } from 'react-native';
import { colors } from '../../theme/tokens';
import { BottomSheet, EmptyState, ErrorState, HeaderAction, InfoList, Notice, ScreenIntro, Shortcut, SkeletonList, mobileStyles as ms } from '../../components/mobile';
import { useFocusEffect, useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { isAxiosError } from 'axios';
import { z } from 'zod';
import { useAuth } from '../auth/AuthProvider';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { workspaceMessages } from '../workspace/messages';
import { AgendaButton, FormField, StatusPill, styles as s } from '../agenda/ui';
import { AgendaShell } from '../workspace/AppShell';
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
        contentContainerStyle={ms.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
        ListHeaderComponent={
          <View style={ms.header}>
            <ScreenIntro title={t.history} subtitle={farm?.name} action={writable && farmId ? <HeaderAction label={f.openForm} onPress={() => { if (!busy && !pending && !query.isFetching) router.push({ pathname: '/milk/group-feeding', params: { farm: farmId } }); }} /> : undefined} />
            {!allowed && <EmptyState title={routeFarmChanged ? t.contextChanged : w.noAccess} />}
            {allowed && !farmId && <Notice tone="info" text={t.selectFarm} />}
            {allowed && !farmId && <Shortcut label={w.farms} onPress={() => router.push('/farms')} />}
            {!!writeMessage && <Notice tone="success" text={writeMessage} />}
            {busy && pending && <SkeletonList rows={1} />}
            {!!pending && !busy && (
              <View style={{ gap: 8 }}>
                <Notice tone="warning" text={writeError || f.uncertain} />
                <Text selectable style={{ fontSize: 12, color: colors.muted }}>{pending.command.request_key}</Text>
                <AgendaButton variant="primary" label={f.checkReceipt} disabled={busy} onPress={() => void reconcileCancellation()} />
                <AgendaButton label={f.retrySame} disabled={busy} onPress={() => void submitCancellation(pending)} />
              </View>
            )}
            {!!writeError && !cancelTarget && !pending && <Notice tone="danger" text={writeError} />}
            {query.isFetching && !data && <SkeletonList rows={2} />}
            {query.isError && <ErrorState message={w.error} language={language} onRetry={() => void refetch()} />}
            {query.isError && page > 1 && <AgendaButton label={`${w.page} 1`} onPress={() => setPaging({ farm: farmId ?? '', page: 1 })} />}
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ gap: 10, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface }}>
            <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '800', color: colors.forest }}>
              {item.period_start === item.date ? dayLabel(item.date, language) : `${dayLabel(item.period_start, language)} – ${dayLabel(item.date, language)}`}
            </Text>
            {!!item.notes && <Text style={{ fontSize: 13, color: colors.muted }}>{t.notes}: {item.notes}</Text>}
            {item.groups.map((group, index) => (
              <View key={`${item.request_key}:${index}`} style={{ gap: 6, borderTopWidth: 1, borderColor: colors.divider, paddingTop: 10 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.forest, flexShrink: 1 }}>{group.name} · {group.head_count} {t.heads.toLowerCase()}</Text>
                  <StatusPill label={group.cancelled ? t.cancelled : t.supplied} tone={group.cancelled ? 'neutral' : 'success'} />
                </View>
                <InfoList rows={group.feeds.map(feed => [feed.name, `${number(feed.quantity_kg, language)} kg ${feed.mode === 'per_head_day' ? t.perHeadDay : t.periodTotal} · ${t.total}: ${number(feed.total_kg, language)} kg`] as [string, string])} />
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
        ListEmptyComponent={Boolean(allowed && farmId && !query.isPending && !query.isError && data?.count === 0) ? <EmptyState title={t.empty} /> : undefined}
        ListFooterComponent={data && (data.previous || data.next) ? (
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, paddingVertical: 12 }}>
            <AgendaButton label="‹" accessibilityLabel={w.previous} disabled={!data.previous || query.isFetching} style={{ width: 44, borderRadius: 22, paddingHorizontal: 0 }} onPress={() => setPaging({ farm: farmId ?? '', page: Math.max(1, page - 1) })} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.muted }}>{w.page} {page}</Text>
            <AgendaButton label="›" accessibilityLabel={w.next} disabled={!data.next || query.isFetching} style={{ width: 44, borderRadius: 22, paddingHorizontal: 0 }} onPress={() => setPaging({ farm: farmId ?? '', page: page + 1 })} />
          </View>
        ) : undefined}
      />
      <BottomSheet visible={!!cancelTarget && !pending} title={cancelTarget ? `${f.cancelGroup}: ${cancelTarget.name}` : f.cancelGroup} onClose={() => { if (!busy) setCancelTarget(null); }} language={language}>
        <View style={{ gap: 12 }}>
          <FormField label={f.cancelReason} error={writeError || undefined}>
            <TextInput accessibilityLabel={f.cancelReason} style={[s.fieldControl, { minHeight: 88, textAlignVertical: 'top', paddingTop: 12 }]} value={reason} maxLength={500} multiline editable={!busy} onChangeText={setReason} />
          </FormField>
          <AgendaButton variant="primary" busy={busy} label={f.confirmCancel} disabled={busy || !reason.trim()} onPress={confirmCancellation} />
          <AgendaButton label={f.stay} disabled={busy} onPress={() => setCancelTarget(null)} />
        </View>
      </BottomSheet>
    </AgendaShell>
  );
}
