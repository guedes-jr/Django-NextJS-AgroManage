import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { isAxiosError } from 'axios';
import { z } from 'zod';
import { useAuth } from '../auth/AuthProvider';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { organizationDay } from '../workspace/contracts';
import { workspaceMessages } from '../workspace/messages';
import { AgendaButton, AgendaFormShell as AgendaShell, Busy, styles as s } from '../agenda/ui';
import { AuthFailure, DairyFeedingSaveUnconfirmed, authError } from '../../services/authApi';
import {
  canReadDairyFeeding,
  canWriteDairyFeeding,
  dairyFeedEstimate,
  dairyFeedingCatalogQuerySchema,
  dairyFeedingCommandSchema,
  dairyFeedingDays,
  dairyFeedingGroupSchema,
  type DairyFeedingCatalog,
  type DairyFeedingGroup,
  type DairyFeedingWrite,
} from './dairyFeedingContracts';
import { dairyFeedingFormMessages, dairyFeedingMessages } from './dairyFeedingMessages';

const routeSchema = z.object({ farm: z.uuid().optional() });
type FeedDraft = { item: string; quantity_kg: string; mode: 'total' | 'per_head_day'; search: string };
const emptyFeed = (): FeedDraft => ({ item: '', quantity_kg: '', mode: 'per_head_day', search: '' });

export function DairyFeedingFormScreen() {
  const params = useLocalSearchParams<{ farm?: string }>();
  const route = routeSchema.safeParse(params);
  const { state, controller, language } = useAuth();
  const { farm } = useWorkspace();
  const router = useRouter();
  const t = dairyFeedingFormMessages[language];
  const w = workspaceMessages[language];
  const farmId = farm?.id;
  const contextChanged = route.success && !!route.data.farm && route.data.farm !== farmId;
  const canRead = route.success && state.status === 'signedIn' && canReadDairyFeeding(state.session.user);
  const canWrite = canRead && state.status === 'signedIn' && canWriteDairyFeeding(state.session.user);
  const options = useQuery({
    queryKey: ['dairy-feeding-form-day', state.status === 'signedIn' ? state.session.user.id : 'signed-out'],
    enabled: canWrite && !!farmId && !contextChanged,
    queryFn: async ({ signal }) => {
      const value = await controller.agendaOptions(signal);
      if (state.status !== 'signedIn' || value.user_id !== state.session.user.id || value.read_only) throw new AuthFailure('unsupported');
      return organizationDay(value.timezone);
    },
  });
  const { refetch } = options;
  const back = () => router.canGoBack()
    ? router.back()
    : router.replace({ pathname: '/milk/group-feeding-history', params: farmId ? { farm: farmId } : {} });

  if (!route.success || !canRead) {
    return <AgendaShell title={t.title} backLabel={w.back} onBack={back}><View style={s.content}><Text style={s.error}>{w.noAccess}</Text></View></AgendaShell>;
  }
  if (!canWrite) {
    return <AgendaShell title={t.title} backLabel={w.back} onBack={back}><View style={s.content}><Text style={s.error}>{w.noAccess}</Text></View></AgendaShell>;
  }
  if (contextChanged) {
    return <AgendaShell title={t.title} backLabel={w.back} onBack={back}><View style={s.content}><Text style={s.error}>{dairyFeedingMessages[language].contextChanged}</Text></View></AgendaShell>;
  }
  if (!farmId) {
    return <AgendaShell title={t.title} backLabel={w.back} onBack={back}><View style={s.content}><Text style={s.muted}>{dairyFeedingMessages[language].selectFarm}</Text></View></AgendaShell>;
  }
  if (!options.data && (options.isPending || options.isFetching)) {
    return <AgendaShell title={t.title} backLabel={w.back} onBack={back}><Busy label={w.loading} /></AgendaShell>;
  }
  if (!options.data) {
    return <AgendaShell title={t.title} backLabel={w.back} onBack={back}><View style={s.content}><Text accessibilityRole="alert" style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={() => void refetch()} /></View></AgendaShell>;
  }
  return <DairyFeedingForm key={farmId} farmId={farmId} farmName={farm?.name ?? ''} today={options.data} />;
}

function DairyFeedingForm({ farmId, farmName, today }: { farmId: string; farmName: string; today: string }) {
  const { controller, language } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const w = workspaceMessages[language];
  const t = dairyFeedingFormMessages[language];
  const history = dairyFeedingMessages[language];
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [search, setSearch] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<string, DairyFeedingCatalog['results'][number]>>({});
  const [animalLabels, setAnimalLabels] = useState<Record<string, string>>({});
  const [feedLabels, setFeedLabels] = useState<Record<string, string>>({});
  const [groupName, setGroupName] = useState('');
  const [feeds, setFeeds] = useState<FeedDraft[]>([emptyFeed()]);
  const [groups, setGroups] = useState<DairyFeedingGroup[]>([]);
  const [notes, setNotes] = useState('');
  const [review, setReview] = useState(false);
  const [pending, setPending] = useState<DairyFeedingWrite | null>(null);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState('');
  const [writeMessage, setWriteMessage] = useState('');
  const lock = useRef(false);
  const dirtyDraft = !!groups.length || !!Object.keys(selected).length || !!notes.trim()
    || start !== today || end !== today || !!groupName.trim()
    || feeds.some(feed => !!feed.item || !!feed.quantity_kg || !!feed.search.trim());

  useEffect(() => {
    const timer = setTimeout(() => setSearchValue(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const catalog = useQuery({
    queryKey: ['dairy-feeding-catalog', farmId, page, searchValue],
    enabled: !pending && !completed,
    staleTime: 30_000,
    queryFn: ({ signal }) => controller.dairyFeedingCatalog(
      dairyFeedingCatalogQuerySchema.parse({ farm: farmId, page, search: searchValue }),
      signal,
    ),
  });
  const searching = search.trim() !== searchValue;
  const data = catalog.isError || searching ? undefined : catalog.data;
  const products = catalog.isError ? [] : catalog.data?.products ?? [];
  const used = new Set(groups.flatMap(group => group.animals));
  const selectedIds = Object.keys(selected);
  const days = z.iso.date().safeParse(start).success && z.iso.date().safeParse(end).success && start <= end
    ? dairyFeedingDays(start, end)
    : 0;
  const datesValid = days > 0 && end <= today;
  const draftHasValues = !!groupName.trim() || feeds.some(feed => !!feed.item || !!feed.quantity_kg || !!feed.search.trim());
  const unfinishedDraft = selectedIds.length > 0 || draftHasValues;
  const estimatesValid = groups.every(group => group.feeds.every(feed =>
    dairyFeedEstimate(feed.quantity_kg, feed.mode, group.animals.length, days) !== null,
  ));
  const canReview = !pending && !completed && groups.length > 0 && !unfinishedDraft && datesValid && estimatesValid;

  usePreventRemove(!completed && (!!pending || dirtyDraft) && !discarding, ({ repeat }) => {
    if (lock.current) return;
    const body = pending ? t.leaveUncertain : t.draftWarning;
    const discard = () => { setDiscarding(true); repeat(); };
    if (Platform.OS === 'web') {
      if (window.confirm(body)) discard();
    } else {
      Alert.alert(t.draftWarning, body, [
        { text: t.stay, style: 'cancel' },
        { text: t.discard, style: 'destructive', onPress: discard },
      ]);
    }
  });

  function updateFeed(index: number, patch: Partial<FeedDraft>) {
    setError('');
    setFeeds(current => current.map((feed, position) => position === index ? { ...feed, ...patch } : feed));
  }

  function addGroup() {
    setError('');
    if (!selectedIds.length) { setError(t.selectAnimals); return; }
    if (groups.length >= 10) { setError(t.groupLimit); return; }
    if (!datesValid) { setError(t.dateInvalid); return; }
    if (feeds.some(feed => !feed.item)) { setError(t.chooseProduct); return; }
    if (feeds.some(feed => !dairyFeedEstimate(feed.quantity_kg, feed.mode, selectedIds.length, days))) {
      setError(t.quantityRequired);
      return;
    }
    if (new Set(feeds.map(feed => feed.item)).size !== feeds.length) { setError(t.duplicateFeed); return; }
    const parsed = dairyFeedingGroupSchema.safeParse({
      name: groupName.trim() || `${t.groupDefault} ${groups.length + 1}`,
      animals: selectedIds,
      feeds: feeds.map(({ item, quantity_kg, mode }) => ({ item, quantity_kg: quantity_kg.trim().replace(',', '.'), mode })),
    });
    if (!parsed.success) { setError(t.quantityRequired); return; }
    setGroups(current => [...current, parsed.data]);
    setSelected({});
    setGroupName('');
    setFeeds([emptyFeed()]);
  }

  function makeSupplyWrite(): DairyFeedingWrite | null {
    const result = dairyFeedingCommandSchema.safeParse({
      farm: farmId,
      date: end,
      period_start: start,
      request_key: randomUUID(),
      groups,
      notes: notes.trim(),
    });
    if (!result.success) {
      setError(datesValid ? w.error : t.dateInvalid);
      return null;
    }
    return { kind: 'supply', command: result.data };
  }

  function complete(write: DairyFeedingWrite) {
    setPending(null);
    setBusy(false);
    setCompleted(true);
    setWriteMessage(write.kind === 'supply' ? t.success : t.cancelSuccess);
    void client.invalidateQueries({ queryKey: ['dairy-feeding-history', farmId] });
  }

  async function submit(write: DairyFeedingWrite) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setWriteMessage('');
    try {
      await controller.saveDairyFeeding(write);
      complete(write);
    } catch (reason) {
      if (reason instanceof DairyFeedingSaveUnconfirmed) {
        setPending(write);
        setError(t.uncertain);
      } else {
        setPending(null);
        setError(reason instanceof z.ZodError ? w.error : authError(reason).detail ?? w.error);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function reconcile() {
    if (!pending || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await controller.dairyFeedingReceipt(pending);
      complete(pending);
    } catch (reason) {
      setError(isAxiosError(reason) && reason.response?.status === 404 ? t.noReceipt : authError(reason).detail ?? w.error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const back = () => router.canGoBack()
    ? router.back()
    : router.replace({ pathname: '/milk/group-feeding-history', params: { farm: farmId } });
  const number = (value: string) => new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(Number(value));
  const productName = (id: string) => feedLabels[id] ?? products.find(product => product.id === id)?.name ?? id;
  const renderFeed = (feed: FeedDraft, index: number, heads: number) => {
    const matchingProducts = products.filter(product =>
      product.name.toLocaleLowerCase(language).includes(feed.search.toLocaleLowerCase(language)),
    ).slice(0, 8);
    const showProducts = !feed.item || feed.search !== productName(feed.item);
    const estimate = days > 0 ? dairyFeedEstimate(feed.quantity_kg, feed.mode, heads, days) : null;
    return (
      <View key={index} style={[s.card, { gap: 8 }]}>
        <Text style={s.label}>{history.feed}</Text>
        <TextInput
          accessibilityLabel={history.feed}
          style={s.input}
          value={feed.search}
          maxLength={100}
          editable={!pending && !completed && !review}
          onChangeText={value => updateFeed(index, { item: '', search: value })}
        />
        {showProducts && matchingProducts.map(product => (
          <Pressable
            key={product.id}
            accessibilityRole="button"
            style={[s.check, { paddingHorizontal: 8 }]}
            disabled={!!pending || completed || review}
            onPress={() => {
              updateFeed(index, { item: product.id, search: product.name });
              setFeedLabels(current => ({ ...current, [product.id]: product.name }));
            }}
          >
            <Text style={s.body}>{product.name}</Text>
          </Pressable>
        ))}
        <Text style={s.label}>{t.feedMode}</Text>
        <View style={s.row}>
          <AgendaButton label={history.perHeadDay} selected={feed.mode === 'per_head_day'} disabled={!!pending || completed || review} onPress={() => updateFeed(index, { mode: 'per_head_day' })} />
          <AgendaButton label={history.periodTotal} selected={feed.mode === 'total'} disabled={!!pending || completed || review} onPress={() => updateFeed(index, { mode: 'total' })} />
        </View>
        <Text style={s.label}>{history.quantity} (kg)</Text>
        <TextInput
          accessibilityLabel={`${history.quantity} ${history.feed}`}
          style={s.input}
          value={feed.quantity_kg}
          keyboardType="decimal-pad"
          maxLength={12}
          editable={!pending && !completed && !review}
          onChangeText={value => updateFeed(index, { quantity_kg: value.replace(',', '.') })}
        />
        <Text style={s.muted}>{t.estimate}: {estimate === null ? '—' : `${number(estimate)} kg`}</Text>
        {feeds.length > 1 && <AgendaButton label={t.remove} disabled={!!pending || completed || review} onPress={() => setFeeds(current => current.filter((_, position) => position !== index))} />}
      </View>
    );
  };

  return (
    <AgendaShell title={t.title} backLabel={w.back} onBack={back}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.muted}>{t.hint}</Text>
          <View style={s.card}>
            <Text style={s.heading}>{farmName}</Text>
            <Text style={s.label}>{t.start}</Text>
            <TextInput accessibilityLabel={t.start} style={s.input} value={start} maxLength={10} placeholder="YYYY-MM-DD" editable={!pending && !completed && !review} onChangeText={value => { setStart(value); setError(''); }} />
            <Text style={s.label}>{t.end}</Text>
            <TextInput accessibilityLabel={t.end} style={s.input} value={end} maxLength={10} placeholder="YYYY-MM-DD" editable={!pending && !completed && !review} onChangeText={value => { setEnd(value); setError(''); }} />
            {!datesValid && <Text accessibilityRole="alert" style={s.error}>{t.dateInvalid}</Text>}
            <Text style={s.muted}>{datesValid ? `${days} ${t.days}` : ''}</Text>
          </View>

          {busy && pending && <Busy label={w.loading} />}
          {!!pending && !busy && (
            <View style={[s.card, { borderColor: '#B78024' }]}>
              <Text accessibilityRole="alert" style={s.error}>{t.uncertain}</Text>
              <Text selectable style={s.muted}>{pending.command.request_key}</Text>
              <AgendaButton label={busy ? w.loading : t.checkReceipt} disabled={busy} onPress={() => void reconcile()} />
              <AgendaButton label={busy ? w.loading : t.retrySame} disabled={busy} onPress={() => void submit(pending)} />
            </View>
          )}
          {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
          {!!writeMessage && (
            <View style={s.card}>
              <Text accessibilityRole="alert" style={s.badge}>{writeMessage}</Text>
              <AgendaButton label={history.history} onPress={back} />
            </View>
          )}

          {!review && !completed && (
            <>
              <View style={s.card}>
                <Text accessibilityRole="header" style={s.title}>{history.heads}</Text>
                <Text style={s.muted}>{t.searchHint}</Text>
                <TextInput accessibilityLabel={t.search} style={s.input} value={search} maxLength={100} editable={!pending} placeholder={t.search} onChangeText={value => { setSearch(value); setPage(1); setError(''); }} />
                <Text style={s.muted}>{t.selected}: {selectedIds.length}</Text>
                <View style={s.row}>
                  <AgendaButton
                    label={t.selectPage}
                    disabled={!!pending || !data?.results.length}
                    onPress={() => {
                      const candidates = (data?.results ?? []).filter(animal => !used.has(animal.id) && !selected[animal.id]);
                      const remaining = Math.max(0, 1000 - selectedIds.length);
                      const pageAnimals = candidates.slice(0, remaining);
                      setError(candidates.length > remaining ? t.animalLimit : '');
                      setSelected(current => ({ ...current, ...Object.fromEntries(pageAnimals.map(animal => [animal.id, animal])) }));
                      setAnimalLabels(current => ({
                        ...current,
                        ...Object.fromEntries(pageAnimals.map(animal => [animal.id, `${animal.identifier} · ${animal.name || animal.category || '—'}`])),
                      }));
                    }}
                  />
                  <AgendaButton label={t.clearSelection} disabled={!!pending || !selectedIds.length} onPress={() => { setSelected({}); setError(''); }} />
                </View>
                {(catalog.isFetching || searching) && <Busy label={w.loading} />}
                {catalog.isError && <View style={s.card}><Text accessibilityRole="alert" style={s.error}>{w.error}</Text><AgendaButton label={w.retry} onPress={() => void catalog.refetch()} /></View>}
                {data?.results.map(animal => {
                  const checked = !!selected[animal.id] || used.has(animal.id);
                  const selectionFull = selectedIds.length >= 1000 && !selected[animal.id];
                  const disabled = !!pending || used.has(animal.id) || selectionFull;
                  return (
                    <Pressable
                      key={animal.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked, disabled }}
                      style={s.check}
                      disabled={disabled}
                      onPress={() => {
                        if (selected[animal.id]) {
                          setError('');
                          setSelected(current => {
                            const next = { ...current };
                            delete next[animal.id];
                            return next;
                          });
                        } else {
                          if (selectedIds.length >= 1000) {
                            setError(t.animalLimit);
                            return;
                          }
                          setSelected(current => ({ ...current, [animal.id]: animal }));
                          setAnimalLabels(labels => ({ ...labels, [animal.id]: `${animal.identifier} · ${animal.name || animal.category || '—'}` }));
                        }
                      }}
                    >
                      <Text style={s.checkText}>{checked ? '[x]' : '[ ]'} {animal.identifier} · {animal.name || animal.category || '—'} · {animal.batch_code || '—'}</Text>
                    </Pressable>
                  );
                })}
                {data && data.results.length === 0 && <Text style={s.muted}>{t.noAnimals}</Text>}
                {!!data?.products.length && <Text style={s.muted}>{data.products.length} · {history.feed}</Text>}
                {data && (data.next || page > 1) && (
                  <View style={[s.row, { justifyContent: 'center' }]}>
                    <AgendaButton label={w.previous} disabled={page <= 1 || catalog.isFetching} onPress={() => setPage(value => Math.max(1, value - 1))} />
                    <Text style={s.muted}>{w.page} {page} · {data.count}</Text>
                    <AgendaButton label={w.next} disabled={!data.next || catalog.isFetching} onPress={() => setPage(value => value + 1)} />
                  </View>
                )}
              </View>

              <View style={s.card}>
                <Text accessibilityRole="header" style={s.title}>{t.groupBuilder}</Text>
                <TextInput accessibilityLabel={t.groupName} style={s.input} value={groupName} maxLength={80} editable={!pending} placeholder={t.groupName} onChangeText={setGroupName} />
                {products.length
                  ? feeds.map((feed, index) => renderFeed(feed, index, selectedIds.length))
                  : !catalog.isFetching && !searching && <Text style={s.muted}>{t.noProducts}</Text>}
                <View style={s.row}>
                  <AgendaButton label={t.addFeed} disabled={!!pending || feeds.length >= 10 || !products.length} onPress={() => { setError(''); setFeeds(current => [...current, emptyFeed()]); }} />
                  <AgendaButton label={t.addGroup} disabled={!!pending || groups.length >= 10 || !selectedIds.length || !products.length} onPress={addGroup} />
                </View>
              </View>

              <View style={s.card}>
                <Text accessibilityRole="header" style={s.title}>{t.groupsReview}</Text>
                {!groups.length && <Text style={s.muted}>{t.noGroups}</Text>}
                {groups.map((group, index) => (
                  <View key={`${group.name}:${index}`} style={[s.card, { gap: 6 }]}>
                    <Text style={s.heading}>{group.name} · {group.animals.length} {history.heads.toLowerCase()}</Text>
                    {group.feeds.map(feed => {
                      const estimate = dairyFeedEstimate(feed.quantity_kg, feed.mode, group.animals.length, days);
                      return <Text key={feed.item} style={s.body}>{productName(feed.item)} · {estimate === null ? '—' : `${number(estimate)} kg`} ({t.estimate.toLowerCase()})</Text>;
                    })}
                    <Text numberOfLines={2} style={s.muted}>{group.animals.slice(0, 5).map(id => animalLabels[id] ?? id).join(', ')}{group.animals.length > 5 ? ` +${group.animals.length - 5}` : ''}</Text>
                    <AgendaButton label={t.remove} disabled={!!pending} onPress={() => setGroups(current => current.filter((_, position) => position !== index))} />
                  </View>
                ))}
                <TextInput accessibilityLabel={history.notes} style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]} value={notes} maxLength={1000} multiline editable={!pending} placeholder={history.notes} onChangeText={setNotes} />
                <Text style={s.muted}>{t.estimateWarning}</Text>
                <AgendaButton variant="primary" label={t.review} disabled={!canReview} onPress={() => { setError(''); setReview(true); }} />
              </View>
            </>
          )}

          {review && !completed && (
            <View style={s.card}>
              <Text accessibilityRole="header" style={s.title}>{t.review}</Text>
              <Text style={s.body}>{start} — {end} · {days} {t.days}</Text>
              <Text style={s.muted}>{t.estimateWarning}</Text>
              {groups.map((group, index) => (
                <View key={`${group.name}:${index}`} style={[s.card, { gap: 6 }]}>
                  <Text style={s.heading}>{group.name} · {group.animals.length} {history.heads.toLowerCase()}</Text>
                  {group.feeds.map(feed => {
                    const estimate = dairyFeedEstimate(feed.quantity_kg, feed.mode, group.animals.length, days);
                    return <Text key={feed.item} style={s.body}>{productName(feed.item)} · {feed.quantity_kg} {feed.mode === 'per_head_day' ? `${history.perHeadDay} × ${days}` : history.periodTotal} · {t.estimate.toLowerCase()}: {estimate === null ? '—' : `${number(estimate)} kg`}</Text>;
                  })}
                </View>
              ))}
              {!!notes.trim() && <Text style={s.body}>{history.notes}: {notes.trim()}</Text>}
              {!!pending && <Text style={s.muted}>{pending.command.request_key}</Text>}
              {!pending && <View style={s.row}>
                <AgendaButton label={t.edit} disabled={busy} onPress={() => setReview(false)} />
                <AgendaButton
                  variant="primary"
                  busy={busy}
                  label={busy ? w.loading : t.confirm}
                  disabled={busy || !canReview}
                  onPress={() => {
                    const write = makeSupplyWrite();
                    if (write) {
                      setPending(write);
                      void submit(write);
                    }
                  }}
                />
              </View>}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </AgendaShell>
  );
}
