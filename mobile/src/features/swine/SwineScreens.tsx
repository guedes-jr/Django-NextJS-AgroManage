import { useRef, useState } from 'react';
import { colors as tokens } from '../../theme/tokens';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import { useAuth } from '../auth/AuthProvider';
import { AgendaButton, Busy, styles as s } from '../agenda/ui';
import { HomeIcon, type HomeIconName } from '../home/HomeIcon';
import { WorkspaceShell } from '../workspace/WorkspaceShell';
import { SwineBatchWeightUnconfirmed, SwineBirthContextChanged, SwineBirthUnconfirmed, SwineDiagnosisContextChanged, SwineDiagnosisUnconfirmed, SwineMatingUnconfirmed } from '../../services/authApi';
import { canReadSwine, canWriteSwine, matchesSwineBirth, matchesSwineDiagnosis, swineBirthInputSchema, swineBatchWeightCommandSchema, swineDiagnosisInputSchema, swineMatingCommandSchema, swinePhaseSchema, swinePhases, type SwineAnimalDetail, type SwineBatchHistoryEvent, type SwineBatchWeightCommand, type SwineBatchWeightReceipt, type SwineBirthInput, type SwineBirthReceipt, type SwineDiagnosisInput, type SwineDiagnosisReceipt, type SwineMatingCommand, type SwineMatingReceipt, type SwinePhase, type SwinePhaseRow, type SwineRecordDetail } from './contracts';
import { canReadSwineSales } from './sales';
import { salesTitle } from './SwineSalesScreen';
import { SwineTransitionForm } from './SwineTransitionForm';
import { swineMessages, swineStatusLabel } from './messages';
import { workspaceMessages } from '../workspace/messages';

const pageSize = 20;
const historyPageSize = 20;
type Copy = (typeof swineMessages)[keyof typeof swineMessages];
type RecordSummary = { title: string; status: string; fields: [string, string | null][] };
const phaseIcons: Record<SwinePhase, HomeIconName> = { marras: 'pig', matrizes: 'heart', gestacao: 'heart', maternidade: 'baby', creche: 'baby', crescimento: 'trend', engorda: 'group' };
const phaseColors: Record<SwinePhase, { background: string; color: string }> = {
  marras: { background: '#F7EAF0', color: '#A13B66' }, matrizes: { background: '#F1EAFE', color: '#7445A9' }, gestacao: { background: '#FFF1DC', color: '#AE6B18' }, maternidade: { background: '#E7F3E9', color: '#287443' }, creche: { background: '#E5F3F2', color: '#197B79' }, crescimento: { background: '#E9F0FC', color: '#3970B8' }, engorda: { background: '#EEF0E9', color: '#536451' },
};

function isAccessDenied(error: unknown) { return isAxiosError(error) && [401, 403, 404].includes(error.response?.status ?? 0); }
function formatDate(value: string | null | undefined, language: string) { if (!value) return null; const date = new Date(`${value.slice(0, 10)}T12:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(language).format(date); }
function formatNumber(value: number, language: string, maximumFractionDigits = 1) { return new Intl.NumberFormat(language, { maximumFractionDigits }).format(value); }
function formatWeight(value: number | string | null | undefined, language: string) { return value == null || value === '' ? null : typeof value === 'number' ? `${formatNumber(value, language, 2)} kg` : value; }
function formatRemaining(value: string, copy: Copy) { if (value.toLocaleLowerCase().startsWith('pronto')) return copy.readyNow; const days = value.match(/\d+/)?.[0]; return days ? `${days} ${copy.dayUnit}` : value; }

function recordSummary(record: SwinePhaseRow, copy: Copy, language: string): RecordSummary {
  const { phase, data } = record;
  switch (phase) {
    case 'marras': return { title: data.identifier ?? '', status: swineStatusLabel(data.status, copy), fields: [[copy.age, data.idade == null ? null : `${formatNumber(data.idade, language, 0)} ${copy.dayUnit}`], [copy.weight, formatWeight(data.peso, language)], [copy.entry, formatDate(data.entrada, language)], [copy.estimatedCoverage, data.previsao_estimada ? formatDate(data.previsao_cobertura, language) : null]] };
    case 'matrizes': return { title: data.identifier ?? '', status: swineStatusLabel(data.status, copy), fields: [[copy.parity, formatNumber(data.op, language, 0)], [copy.openDays, data.dias_abertos == null ? null : formatNumber(data.dias_abertos, language, 0)], [copy.lastCoverage, data.ultima_cobertura === '—' ? null : formatDate(data.ultima_cobertura, language)]] };
    case 'gestacao': return { title: data.identifier ?? '', status: swineStatusLabel(data.status, copy), fields: [[copy.coverage, formatDate(data.cobertura, language)], [copy.gestationDays, formatNumber(data.dias, language, 0)], [copy.forecast, formatDate(data.previsao, language)], [copy.daysRemaining, formatRemaining(data.dias_faltantes, copy)]] };
    case 'maternidade': return { title: data.identifier ?? '', status: swineStatusLabel(data.status, copy), fields: [[copy.birthDate, formatDate(data.data_parto, language)], [copy.bornAlive, formatNumber(data.vivos, language, 0)], [copy.currentAlive, formatNumber(data.vivos_atual, language, 0)], [copy.deaths, formatNumber(data.obitos, language, 0)], [copy.weaning, formatDate(data.previsao_desmame, language)]] };
    case 'creche': return { title: data.lote, status: swineStatusLabel(data.status, copy), fields: [[copy.quantity, formatNumber(data.qtd, language, 0)], [copy.weight, formatWeight(data.peso, language)], [copy.entry, formatDate(data.entrada, language)], [copy.forecast, formatDate(data.prev_crescimento, language)]] };
    case 'crescimento':
    case 'engorda': return { title: data.lote, status: swineStatusLabel(data.status, copy), fields: [[copy.quantity, formatNumber(data.qtd, language, 0)], [copy.weight, formatWeight(data.peso, language)], [copy.days, data.dias == null ? null : formatNumber(data.dias, language, 0)], [copy.dailyGain, data.gpd == null ? null : `${formatNumber(data.gpd, language, 2)} kg/d`], [copy.forecast, formatDate(data.previsao, language)]] };
  }
}

function PhaseIcon({ phase, size = 24 }: { phase: SwinePhase; size?: number }) { const colors = phaseColors[phase]; return <View style={[styles.iconTile, { backgroundColor: colors.background }]}><HomeIcon name={phaseIcons[phase]} color={colors.color} size={size}/></View>; }

function SwineRecordCard({ record, copy, language, onPress }: { record: SwinePhaseRow; copy: Copy; language: string; onPress: () => void }) {
  const summary = recordSummary(record, copy, language); const colors = phaseColors[record.phase];
  return <Pressable accessibilityRole="button" accessibilityLabel={`${summary.title || '—'}. ${summary.status}. ${copy.detail}`} onPress={onPress} style={({ pressed }) => [styles.record, pressed && styles.pressed]}>
    <PhaseIcon phase={record.phase} size={23}/><View style={styles.recordMain}><View style={styles.recordHeading}><Text accessibilityRole="header" style={s.title} numberOfLines={1}>{summary.title || '—'}</Text><HomeIcon name="arrow" color={tokens.muted} size={18}/></View><Text style={[s.badge, { color: colors.color }]} numberOfLines={1}>{summary.status}</Text><View style={styles.metrics}>{summary.fields.slice(0, 3).map(([label, value]) => value != null && value !== '' ? <View key={label} style={styles.metric}><Text style={styles.metricLabel} numberOfLines={1}>{label}</Text><Text style={styles.metricValue} numberOfLines={1}>{value}</Text></View> : null)}</View></View>
  </Pressable>;
}

function RecordDetail({ record, copy, language, onClose, onOpenRecord }: { record: SwinePhaseRow; copy: Copy; language: string; onClose: () => void; onOpenRecord: () => void }) {
  const summary = recordSummary(record, copy, language); const colors = phaseColors[record.phase];
  return <Modal transparent animationType="slide" visible onRequestClose={onClose}><View style={styles.modal}><Pressable style={StyleSheet.absoluteFill} onPress={onClose}/><View accessibilityViewIsModal style={styles.sheet}><View style={styles.sheetHeader}><PhaseIcon phase={record.phase}/><View style={styles.recordMain}><Text accessibilityRole="header" style={s.title}>{summary.title || '—'}</Text><Text style={[s.badge, { color: colors.color }]}>{summary.status}</Text></View></View><View style={styles.detailGrid}>{summary.fields.map(([label, value]) => value != null && value !== '' ? <View key={label} style={styles.detailRow}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View> : null)}</View><AgendaButton label={copy.openRecord} onPress={onOpenRecord}/><AgendaButton label={copy.close} onPress={onClose}/></View></View></Modal>;
}

export function SwineHomeScreen() {
  const { state, controller, language } = useAuth(); const router = useRouter(); const copy = swineMessages[language]; const workspaceCopy = workspaceMessages[language];
  const allowed = state.status === 'signedIn' && canReadSwine(state.session.user); const sessionKey = state.status === 'signedIn' ? `${state.session.organization.id}:${state.session.user.id}` : 'signed-out';
  const summaries = useQueries({ queries: swinePhases.map(phase => ({ queryKey: ['swine-phase-summary', sessionKey, phase], enabled: allowed, staleTime: 30_000, queryFn: ({ signal }: { signal: AbortSignal }) => controller.swinePhasePage(phase, 1, 1, signal) })) });
  return <WorkspaceShell active="swine" title={copy.title}>{!allowed ? <View style={s.content}><Text style={s.error}>{workspaceCopy.noAccess}</Text></View> : <ScrollView contentContainerStyle={s.content}><View style={styles.intro}><View style={styles.introIcon}><HomeIcon name="pig" color={tokens.primary} size={25}/></View><View style={styles.introText}><Text style={s.title}>{copy.subtitle}</Text><Text style={s.muted}>{copy.scopeHint}</Text></View></View>{state.status === 'signedIn' && canReadSwineSales(state.session.user) ? <AgendaButton label={salesTitle[language]} onPress={() => router.push('/swine/sales')}/> : null}{swinePhases.map((phase, index) => { const query = summaries[index]; if (!query) return null; const count = query.data?.count; return <Pressable key={phase} accessibilityRole="button" accessibilityLabel={`${copy.phase[phase]}. ${copy.open}`} onPress={() => router.push({ pathname: '/swine/[phase]', params: { phase } })} style={({ pressed }) => [styles.phaseCard, pressed && styles.pressed]}><PhaseIcon phase={phase} size={25}/><View style={styles.phaseMain}><Text accessibilityRole="header" style={s.title}>{copy.phase[phase]}</Text>{query.isPending ? <Busy label={workspaceCopy.loading}/> : query.isError ? <Text accessibilityRole="alert" style={s.error}>{isAccessDenied(query.error) ? copy.denied : copy.error}</Text> : <Text style={styles.phaseCount}>{count == null ? '—' : formatNumber(count, language, 0)} <Text style={s.muted}>{copy.total}</Text></Text>}</View>{query.isError ? <AgendaButton label={copy.retry} onPress={() => void query.refetch()}/> : <HomeIcon name="arrow" color={tokens.muted} size={20}/>}</Pressable>; })}</ScrollView>}</WorkspaceShell>;
}

export function SwinePhaseScreen() {
  const params = useLocalSearchParams<{ phase?: string }>(); const router = useRouter(); const route = swinePhaseSchema.safeParse(params.phase); const { state, controller, language } = useAuth(); const copy = swineMessages[language]; const workspaceCopy = workspaceMessages[language]; const phase: SwinePhase = route.success ? route.data : 'marras';
  const [pagination, setPagination] = useState<{ phase: SwinePhase; page: number }>({ phase, page: 1 }); const [selected, setSelected] = useState<SwinePhaseRow | null>(null); const page = pagination.phase === phase ? pagination.page : 1;
  const allowed = route.success && state.status === 'signedIn' && canReadSwine(state.session.user); const sessionKey = state.status === 'signedIn' ? `${state.session.organization.id}:${state.session.user.id}` : 'signed-out';
  const query = useQuery({ queryKey: ['swine-phase-page', sessionKey, phase, page], enabled: allowed, staleTime: 30_000, queryFn: ({ signal }) => controller.swinePhasePage(phase, page, pageSize, signal) }); const data = isAccessDenied(query.error) ? undefined : query.data; const rows = data?.rows ?? [];
  return <WorkspaceShell active="swine" title={route.success ? copy.phase[phase] : copy.title}>{!allowed ? <View style={s.content}><Text style={s.error}>{route.success ? workspaceCopy.noAccess : copy.unavailable}</Text></View> : <><FlatList<SwinePhaseRow> key={`${phase}:${page}`} contentContainerStyle={s.content} data={rows} keyExtractor={item => `${item.phase}:${item.data.id}`} renderItem={({ item }) => <SwineRecordCard record={item} copy={copy} language={language} onPress={() => setSelected(item)}/>} ListHeaderComponent={<View style={styles.listHeader}><View style={styles.phaseHeader}><PhaseIcon phase={phase}/><View style={styles.phaseMain}><Text style={s.title}>{copy.phaseSummary}</Text><Text style={s.muted}>{copy.scopeHint}</Text></View></View>{query.isPending && <Busy label={workspaceCopy.loading}/>} {query.isError && <View style={s.card}><Text accessibilityRole="alert" style={s.error}>{isAccessDenied(query.error) ? copy.denied : copy.error}</Text><AgendaButton label={copy.retry} onPress={() => void query.refetch()}/></View>}{data && <Text style={s.muted}>{formatNumber(data.count, language, 0)} {copy.total}</Text>}</View>} ListEmptyComponent={!query.isPending && !query.isError ? <Text style={s.body}>{copy.empty}</Text> : undefined} ListFooterComponent={data && data.count > 0 ? <View style={s.row}><AgendaButton label={copy.previous} disabled={!data.previous || query.isFetching} onPress={() => setPagination({ phase, page: Math.max(1, page - 1) })}/><Text style={s.muted}>{copy.page} {page}</Text><AgendaButton label={copy.next} disabled={!data.next || query.isFetching} onPress={() => setPagination({ phase, page: page + 1 })}/></View> : undefined}/>{selected && <RecordDetail record={selected} copy={copy} language={language} onClose={() => setSelected(null)} onOpenRecord={() => { const target = selected; setSelected(null); router.push({ pathname: '/swine/[phase]/[id]', params: { phase: target.phase, id: String(target.data.id) } }); }}/>}</>}</WorkspaceShell>;
}


function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isSwineCoverageStatus(value: string): value is SwineMatingCommand['expected_status'] {
  return value === 'vazia' || value === 'pronta' || value === 'aguardando_cobertura';
}

function swineWeightError(error: unknown, copy: (typeof swineMessages)[keyof typeof swineMessages]) {
  if (error instanceof SwineBatchWeightUnconfirmed) return copy.weighingUnconfirmed;
  if (isAxiosError(error)) {
    const status = error.response?.status;
    if ([401, 403, 404].includes(status ?? 0)) return copy.denied;
    if (status === 409) return copy.weighingChanged;
    const body = error.response?.data;
    if (typeof body === 'object' && body !== null) {
      const messages = Object.values(body).flatMap(value =>
        typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [],
      );
      if (messages.length) return messages.join(' ');
    }
  }
  return copy.weighingError;
}

function swineMatingError(error: unknown, copy: (typeof swineMessages)[keyof typeof swineMessages]) {
  if (error instanceof SwineMatingUnconfirmed) return copy.matingUnconfirmed;
  if (isAxiosError(error)) {
    const status = error.response?.status;
    if ([401, 403, 404].includes(status ?? 0)) return copy.denied;
    if (status === 409) return copy.matingChanged;
    const body = error.response?.data;
    if (typeof body === 'object' && body !== null) {
      const messages = Object.values(body).flatMap(value =>
        typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [],
      );
      if (messages.length) return messages.join(' ');
    }
  }
  return copy.matingError;
}

function swineDiagnosisError(error: unknown, copy: (typeof swineMessages)[keyof typeof swineMessages]) {
  if (error instanceof SwineDiagnosisUnconfirmed) return copy.diagnosisUnconfirmed;
  if (error instanceof SwineDiagnosisContextChanged) return copy.diagnosisChanged;
  if (isAxiosError(error)) {
    const status = error.response?.status;
    if ([401, 403, 404].includes(status ?? 0)) return copy.denied;
    if (status === 409) return copy.diagnosisChanged;
    const collect = (value: unknown): string[] => typeof value === 'string'
      ? [value]
      : Array.isArray(value)
        ? value.flatMap(collect)
        : value && typeof value === 'object'
          ? Object.values(value).flatMap(collect)
          : [];
    const messages = collect(error.response?.data);
    if (messages.length) return messages.join(' ');
  }
  return copy.diagnosisError;
}

type SwineDetailField = [string, string | null];

function SwineDetailCard({ title, fields }: { title: string; fields: SwineDetailField[] }) {
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.title}>{title || '—'}</Text>
    {fields.map(([label, value]) => value != null && value !== '' ? <Text key={label} style={s.body}>{label}: {value}</Text> : null)}
  </View>;
}

function swineAnimalFields(animal: SwineAnimalDetail, phase: SwinePhase, copy: (typeof swineMessages)[keyof typeof swineMessages], language: string): SwineDetailField[] {
  const status = animal.reproductive_status ?? animal.status ?? null;
  return [
    [copy.phaseLabel, copy.phase[phase]],
    [copy.farm, animal.farm_name ?? null],
    [copy.status, status ? swineStatusLabel(status, copy) : null],
    [copy.dateOfBirth, formatDate(animal.birth_date, language)],
    [copy.entry, formatDate(animal.entry_date, language)],
    [copy.batch, animal.batch_code ?? null],
    [copy.weight, formatWeight(animal.current_weight_kg, language)],
    [copy.notes, animal.notes ?? null],
  ];
}

function SwineReproductiveHistory({ animal, copy, language }: { animal: SwineAnimalDetail; copy: (typeof swineMessages)[keyof typeof swineMessages]; language: string }) {
  const cycles = animal.reproductive_cycles ?? [];
  if (!cycles.length) return null;
  return <>
    <Text accessibilityRole="header" style={s.title}>{copy.cycles}</Text>
    {cycles.map(cycle => <SwineDetailCard
      key={cycle.cycle_number}
      title={`${copy.cycle} ${formatNumber(cycle.cycle_number, language, 0)}`}
      fields={[
        [copy.coverage, formatDate(cycle.mating_date, language)],
        [copy.matingType, cycle.mating_type_display],
        [copy.sire, cycle.sire_name ?? cycle.sire_identifier],
        [copy.status, cycle.status_display],
        [copy.pregnancyStatus, cycle.pregnancy_status],
        [copy.expectedBirth, formatDate(cycle.expected_birth_date, language)],
        [copy.birthDate, formatDate(cycle.birth_date, language)],
        [copy.totalBorn, cycle.total_born == null ? null : formatNumber(cycle.total_born, language, 0)],
        [copy.bornAlive, cycle.live_born == null ? null : formatNumber(cycle.live_born, language, 0)],
        [copy.stillborn, cycle.stillborn == null ? null : formatNumber(cycle.stillborn, language, 0)],
        [copy.mummified, cycle.mummified == null ? null : formatNumber(cycle.mummified, language, 0)],
        [copy.weaning, formatDate(cycle.weaning_date, language)],
        [copy.quantity, cycle.weaned_quantity == null ? null : formatNumber(cycle.weaned_quantity, language, 0)],
        [copy.notes, cycle.notes],
      ]}
    />)}
  </>;
}

function SwineMating({ animal, phase, copy, language }: { animal: SwineAnimalDetail; phase: SwinePhase; copy: (typeof swineMessages)[keyof typeof swineMessages]; language: string }) {
  const { state, controller } = useAuth();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(localToday);
  const [matingType, setMatingType] = useState<SwineMatingCommand['mating_type']>('natural');
  const [sireInfo, setSireInfo] = useState('');
  const [notes, setNotes] = useState('');
  const [review, setReview] = useState<SwineMatingCommand | null>(null);
  const [receipt, setReceipt] = useState<SwineMatingReceipt | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [stale, setStale] = useState(false);
  const savingLock = useRef(false);
  const allowed = state.status === 'signedIn' && canWriteSwine(state.session.user);
  const sessionKey = state.status === 'signedIn' ? `${state.session.organization.id}:${state.session.user.id}` : 'signed-out';
  const reproductiveStatus = animal.reproductive_status ?? '';

  if (!allowed || (phase !== 'marras' && phase !== 'matrizes')) return null;

  if (receipt) return <View style={s.card}>
    <Text accessibilityRole="header" style={s.title}>{copy.matingSaved}</Text>
    <Text style={s.body}>{copy.matingDate}: {formatDate(receipt.mating_date, language)}</Text>
    <Text style={s.body}>{copy.matingType}: {copy.matingTypes[receipt.mating_type]}</Text>
    {receipt.sire_info ? <Text style={s.body}>{copy.sireInfo}: {receipt.sire_info}</Text> : null}
    <Text style={s.body}>{copy.expectedBirth}: {formatDate(receipt.expected_birth_date, language) ?? '—'}</Text>
  </View>;

  if (animal.status !== 'active' || !isSwineCoverageStatus(reproductiveStatus)) return null;

  const makeReview = () => {
    const result = swineMatingCommandSchema.safeParse({
      request_key: randomUUID(),
      expected_status: reproductiveStatus,
      mating_date: date,
      mating_type: matingType,
      sire_info: sireInfo,
      notes,
    });
    if (!result.success) {
      setError(copy.matingInvalid);
      return;
    }
    setError('');
    setUnconfirmed(false);
    setReview(result.data);
  };

  const submit = async () => {
    if (!review || savingLock.current) return;
    savingLock.current = true;
    setSaving(true);
    setError('');
    try {
      const saved = await controller.registerSwineMating(String(animal.id), review);
      setReceipt(saved);
      setReview(null);
      setUnconfirmed(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['swine-record-detail', sessionKey, phase, String(animal.id)] }),
        ...(['marras', 'matrizes', 'gestacao'] as const).flatMap(changedPhase => [
          queryClient.invalidateQueries({ queryKey: ['swine-phase-page', sessionKey, changedPhase] }),
          queryClient.invalidateQueries({ queryKey: ['swine-phase-summary', sessionKey, changedPhase] }),
        ]),
      ]);
    } catch (caught) {
      setError(swineMatingError(caught, copy));
      if (caught instanceof SwineMatingUnconfirmed) {
        setUnconfirmed(true);
      } else if (isAxiosError(caught) && caught.response?.status === 409) {
        setStale(true);
      }
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  };

  if (stale) return <View style={[s.card, { width: '100%', maxWidth: 880, alignSelf: 'center' }]}>
    <Text accessibilityRole="alert" style={s.error}>{error || copy.matingChanged}</Text>
  </View>;

  return <View style={[s.card, { width: '100%', maxWidth: 880, alignSelf: 'center' }]}>
    <Text accessibilityRole="header" style={s.title}>{copy.matingTitle}</Text>
    {review ? <>
      <Text style={s.muted}>{copy.matingReviewHint}</Text>
      <Text style={s.body}>{copy.identifier}: {animal.identifier ?? '—'}</Text>
      <Text style={s.body}>{copy.matingDate}: {formatDate(review.mating_date, language)}</Text>
      <Text style={s.body}>{copy.matingType}: {copy.matingTypes[review.mating_type]}</Text>
      {review.sire_info ? <Text style={s.body}>{copy.sireInfo}: {review.sire_info}</Text> : null}
      {review.notes ? <Text style={s.body}>{copy.notes}: {review.notes}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <View style={s.row}>
        <AgendaButton label={unconfirmed ? copy.retry : copy.confirmMating} disabled={saving} onPress={() => void submit()}/>
        {!unconfirmed && <AgendaButton label={copy.editMating} disabled={saving} onPress={() => {
          setReview(null);
          setError('');
        }}/>}
      </View>
    </> : <>
      <Text style={s.label}>{copy.matingDate}</Text>
      <TextInput
        accessibilityLabel={copy.matingDate}
        style={s.input}
        value={date}
        onChangeText={setDate}
        keyboardType="numbers-and-punctuation"
        placeholder="YYYY-MM-DD"
        maxLength={10}
      />
      <Text style={s.label}>{copy.matingType}</Text>
      <View style={s.row}>
        {(['natural', 'ai', 'iatf'] as const).map(type => <AgendaButton
          key={type}
          label={copy.matingTypes[type]}
          selected={matingType === type}
          onPress={() => setMatingType(type)}
        />)}
      </View>
      <Text style={s.label}>{copy.sireInfo}</Text>
      <TextInput
        accessibilityLabel={copy.sireInfo}
        style={s.input}
        value={sireInfo}
        onChangeText={setSireInfo}
        maxLength={100}
      />
      <Text style={s.label}>{copy.notes}</Text>
      <TextInput
        accessibilityLabel={copy.notes}
        style={s.input}
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={1000}
      />
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <AgendaButton label={copy.reviewMating} onPress={makeReview}/>
    </>}
  </View>;
}

function SwineDiagnosis({ animal, phase, copy, language }: { animal: SwineAnimalDetail; phase: SwinePhase; copy: (typeof swineMessages)[keyof typeof swineMessages]; language: string }) {
  const { state, controller } = useAuth();
  const queryClient = useQueryClient();
  const [diagnosisDate, setDiagnosisDate] = useState('');
  const [result, setResult] = useState<SwineDiagnosisInput['result'] | ''>('');
  const [review, setReview] = useState<SwineDiagnosisInput | null>(null);
  const [receipt, setReceipt] = useState<SwineDiagnosisReceipt | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [stale, setStale] = useState(false);
  const savingLock = useRef(false);
  const allowed = state.status === 'signedIn' && canWriteSwine(state.session.user);
  const sessionKey = state.status === 'signedIn' ? `${state.session.organization.id}:${state.session.user.id}` : 'signed-out';
  const animalId = String(animal.id);
  const covered = animal.status === 'active' && animal.reproductive_status === 'coberta';
  const query = useQuery({
    queryKey: ['swine-diagnosis-options', sessionKey, animalId],
    enabled: allowed && covered && (phase === 'marras' || phase === 'matrizes'),
    staleTime: 0,
    gcTime: 0,
    queryFn: ({ signal }) => controller.swineDiagnosisOptions(animalId, signal),
  });

  if (!allowed || (phase !== 'marras' && phase !== 'matrizes')) return null;
  if (receipt) return <View style={[s.card, { width: '100%', maxWidth: 880, alignSelf: 'center' }]}>
    <Text accessibilityRole="header" style={s.title}>{copy.diagnosisSaved}</Text>
    <Text style={s.body}>{copy.diagnosisResult}: {copy.diagnosisResults[receipt.result]}</Text>
  </View>;
  if (!covered && !unconfirmed && !stale) return null;
  if (query.isPending && !unconfirmed && !stale) return <View style={[s.card, { width: '100%', maxWidth: 880, alignSelf: 'center' }]}><Busy label={copy.loading}/></View>;
  if (query.isError && !unconfirmed && !stale) return <View style={[s.card, { width: '100%', maxWidth: 880, alignSelf: 'center' }]}>
    <Text accessibilityRole="alert" style={s.error}>{isAccessDenied(query.error) ? copy.denied : copy.diagnosisUnavailable}</Text>
    <AgendaButton label={copy.retry} onPress={() => void query.refetch()}/>
  </View>;
  const options = query.data;
  if (!options) return <View style={[s.card, { width: '100%', maxWidth: 880, alignSelf: 'center' }]}><Text accessibilityRole="alert" style={s.error}>{copy.diagnosisUnavailable}</Text></View>;

  const checkHistory = () => {
    void queryClient.invalidateQueries({ queryKey: ['swine-record-detail', sessionKey, phase, animalId] });
    for (const changedPhase of ['marras', 'matrizes', 'gestacao'] as const) {
      void queryClient.invalidateQueries({ queryKey: ['swine-phase-page', sessionKey, changedPhase] });
      void queryClient.invalidateQueries({ queryKey: ['swine-phase-summary', sessionKey, changedPhase] });
    }
  };
  const makeReview = () => {
    const command = swineDiagnosisInputSchema.safeParse({
      expected_farm: options.animal.farm,
      expected_mating: options.mating.id,
      animal_version: options.animal.version,
      mating_version: options.mating.version,
      diagnosis_date: diagnosisDate || options.today,
      result,
    });
    if (!command.success || !matchesSwineDiagnosis(options, command.data)) {
      setError(copy.diagnosisInvalid);
      return;
    }
    setError('');
    setReview(command.data);
  };
  const submit = async () => {
    if (!review || savingLock.current || unconfirmed || stale) return;
    savingLock.current = true;
    setSaving(true);
    setError('');
    try {
      const saved = await controller.recordSwineDiagnosis(animalId, review);
      setReceipt(saved);
      setReview(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['swine-record-detail', sessionKey, phase, animalId] }),
        ...(['marras', 'matrizes', 'gestacao'] as const).flatMap(changedPhase => [
          queryClient.invalidateQueries({ queryKey: ['swine-phase-page', sessionKey, changedPhase] }),
          queryClient.invalidateQueries({ queryKey: ['swine-phase-summary', sessionKey, changedPhase] }),
        ]),
      ]);
    } catch (caught) {
      setError(swineDiagnosisError(caught, copy));
      if (caught instanceof SwineDiagnosisUnconfirmed) setUnconfirmed(true);
      else if (caught instanceof SwineDiagnosisContextChanged || isAxiosError(caught) && caught.response?.status === 409) setStale(true);
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  };

  if (unconfirmed || stale) return <View style={[s.card, { width: '100%', maxWidth: 880, alignSelf: 'center' }]}>
    <Text accessibilityRole="alert" style={s.error}>{error || (stale ? copy.diagnosisChanged : copy.diagnosisUnconfirmed)}</Text>
    <AgendaButton label={copy.diagnosisCheckHistory} onPress={checkHistory}/>
  </View>;

  return <View style={[s.card, { width: '100%', maxWidth: 880, alignSelf: 'center' }]}>
    <Text accessibilityRole="header" style={s.title}>{copy.diagnosisTitle}</Text>
    <Text style={s.muted}>{copy.diagnosisHint}</Text>
    <Text style={s.body}>{copy.coverage}: {formatDate(options.mating.date, language)}</Text>
    {review ? <>
      <Text style={s.muted}>{copy.diagnosisReviewHint}</Text>
      <Text style={s.body}>{copy.diagnosisResult}: {copy.diagnosisResults[review.result]}</Text>
      <Text style={s.body}>{copy.diagnosisDate}: {formatDate(review.diagnosis_date, language)}</Text>
      {review.result === 'positive' && options.mating.expected_birth_date
        ? <Text style={s.body}>{copy.expectedBirth}: {formatDate(options.mating.expected_birth_date, language)}</Text>
        : null}
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <View style={s.row}>
        <AgendaButton label={saving ? copy.loading : copy.confirmDiagnosis} disabled={saving} onPress={() => void submit()}/>
        <AgendaButton label={copy.editDiagnosis} disabled={saving} onPress={() => {
          setReview(null);
          setError('');
        }}/>
      </View>
    </> : <>
      {!options.allowed_results.includes('positive') ? <Text style={s.badge}>{copy.diagnosisLimited}</Text> : null}
      <Text style={s.label}>{copy.diagnosisResult}</Text>
      <View style={s.row}>
        {options.allowed_results.map(option => <AgendaButton
          key={option}
          label={copy.diagnosisResults[option]}
          selected={result === option}
          onPress={() => setResult(option)}
        />)}
      </View>
      <Text style={s.label}>{copy.diagnosisDate}</Text>
      <TextInput
        accessibilityLabel={copy.diagnosisDate}
        style={s.input}
        value={diagnosisDate || options.today}
        onChangeText={setDiagnosisDate}
        keyboardType="numbers-and-punctuation"
        placeholder="YYYY-MM-DD"
        maxLength={10}
      />
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <AgendaButton label={copy.reviewDiagnosis} onPress={makeReview}/>
    </>}
  </View>;
}

function formatHistoryNumber(value: number | string | null | undefined, language: string, unit = '') {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  const formatted = Number.isFinite(parsed) ? formatNumber(parsed, language, 2) : String(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function swineHistoryFields(event: SwineBatchHistoryEvent, copy: (typeof swineMessages)[keyof typeof swineMessages], language: string): SwineDetailField[] {
  switch (event.type) {
    case 'phase': {
      const eventPhase = swinePhaseSchema.safeParse(event.phase);
      return [
        [copy.phaseLabel, eventPhase.success ? copy.phase[eventPhase.data] : event.phase ?? null],
        [copy.entry, formatDate(event.entry_date, language)],
        [copy.exit, formatDate(event.exit_date, language)],
        [copy.entryQuantity, formatHistoryNumber(event.entry_quantity, language)],
        [copy.quantity, formatHistoryNumber(event.quantity, language)],
        [copy.entryWeight, formatHistoryNumber(event.entry_weight_kg, language, 'kg')],
        [copy.weight, formatHistoryNumber(event.avg_weight_kg, language, 'kg')],
        [copy.status, event.is_current ? copy.currentPhase : null],
      ];
    }
    case 'feed':
      return [
        [copy.entry, formatDate(event.date ?? event.entry_date, language)],
        [copy.endDate, formatDate(event.end_date, language)],
        [copy.totalWeight, formatHistoryNumber(event.total_kg, language, 'kg')],
        [copy.averagePerAnimal, formatHistoryNumber(event.avg_per_animal, language, 'kg')],
        [copy.cost, formatHistoryNumber(event.cost, language)],
        [copy.notes, event.notes ?? null],
      ];
    case 'weight':
      return [
        [copy.entry, formatDate(event.date ?? event.entry_date, language)],
        [copy.weight, formatHistoryNumber(event.weight_kg, language, 'kg')],
        [copy.notes, event.notes ?? null],
      ];
    case 'sale':
      return [
        [copy.entry, formatDate(event.date, language)],
        [copy.quantity, formatHistoryNumber(event.quantity, language)],
        [copy.weight, formatHistoryNumber(event.weight_kg ?? event.total_weight_kg, language, 'kg')],
        [copy.buyer, event.buyer ?? null],
        [copy.amount, formatHistoryNumber(event.amount, language)],
        [copy.notes, event.notes ?? null],
      ];
    case 'death':
      return [
        [copy.entry, formatDate(event.date ?? event.entry_date, language)],
        [copy.quantity, formatHistoryNumber(event.quantity, language)],
        [copy.cause, event.cause ?? null],
        [copy.notes, event.notes ?? event.subtitle ?? null],
      ];
    case 'balance_close':
      return [
        [copy.entry, formatDate(event.date, language)],
        [copy.quantity, formatHistoryNumber(event.quantity, language)],
        [copy.reason, event.reason ?? null],
      ];
    case 'vaccine':
      return [
        [copy.entry, formatDate(event.date ?? event.entry_date, language)],
        [copy.identifier, event.name ?? null],
        [copy.dosage, event.dosage ?? null],
        [copy.animalsTreated, formatHistoryNumber(event.animal_count, language)],
        [copy.inventoryAmount, formatHistoryNumber(event.inventory_quantity, language, event.inventory_unit ?? '')],
        [copy.reason, event.reason ?? null],
        [copy.notes, event.notes ?? null],
      ];
    default:
      return [
        [copy.entry, formatDate(event.date ?? event.entry_date, language)],
        [copy.identifier, event.title ?? null],
        [copy.notes, event.subtitle ?? event.notes ?? null],
      ];
  }
}

function SwineBatchHistory({ id, copy, language }: { id: string; copy: (typeof swineMessages)[keyof typeof swineMessages]; language: string }) {
  const { state, controller } = useAuth();
  const workspaceCopy = workspaceMessages[language as keyof typeof workspaceMessages];
  const [cursor, setCursor] = useState<{ id: string; page: number }>({ id, page: 1 });
  const [opened, setOpened] = useState(false);
  const page = cursor.id === id ? cursor.page : 1;
  const allowed = state.status === 'signedIn' && canReadSwine(state.session.user);
  const sessionKey = state.status === 'signedIn' ? `${state.session.organization.id}:${state.session.user.id}` : 'signed-out';
  const query = useQuery({
    queryKey: ['swine-batch-history', sessionKey, id, page],
    enabled: allowed && opened,
    staleTime: 30_000,
    queryFn: ({ signal }) => controller.swineBatchHistory(id, page, historyPageSize, signal),
  });
  const data = isAccessDenied(query.error) ? undefined : query.data;
  const setPage = (nextPage: number) => setCursor({ id, page: nextPage });
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.title}>{copy.historyTitle}</Text>
    <Text style={s.muted}>{copy.historyHint}</Text>
    {!allowed ? <Text style={s.error}>{workspaceCopy.noAccess}</Text>
      : !opened ? <AgendaButton label={copy.showHistory} onPress={() => setOpened(true)}/>
      : query.isPending ? <Busy label={workspaceCopy.loading}/>
        : query.isError ? <><Text accessibilityRole="alert" style={s.error}>{isAccessDenied(query.error) ? copy.denied : copy.error}</Text><AgendaButton label={copy.retry} onPress={() => void query.refetch()}/></>
          : data ? <>
            <Text style={s.muted}>{formatNumber(data.count, language, 0)} {copy.total}</Text>
            {data.results.map((event, index) => <SwineDetailCard
              key={`${event.batch_id ?? id}:${event.type}:${event.date ?? event.entry_date ?? 'undated'}:${index}`}
              title={copy.eventTypes[event.type] ?? event.type}
              fields={swineHistoryFields(event, copy, language)}
            />)}
            {!data.results.length && <Text style={s.body}>{copy.emptyHistory}</Text>}
            <View style={s.row}>
              <AgendaButton label={copy.previous} disabled={!data.previous || query.isFetching} onPress={() => setPage(Math.max(1, page - 1))}/>
              <Text style={s.muted}>{copy.page} {page}</Text>
              <AgendaButton label={copy.next} disabled={!data.next || query.isFetching} onPress={() => setPage(page + 1)}/>
            </View>
          </> : null}
  </View>;
}

function SwineBatchWeighing({ detail, copy, language }: { detail: Extract<SwineRecordDetail, { kind: 'batch' }>; copy: (typeof swineMessages)[keyof typeof swineMessages]; language: string }) {
  const { state, controller } = useAuth();
  const queryClient = useQueryClient();
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(localToday);
  const [notes, setNotes] = useState('');
  const [review, setReview] = useState<SwineBatchWeightCommand | null>(null);
  const [receipt, setReceipt] = useState<SwineBatchWeightReceipt | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [stale, setStale] = useState(false);
  const savingLock = useRef(false);
  const allowed = state.status === 'signedIn' && canWriteSwine(state.session.user);
  const sessionKey = state.status === 'signedIn' ? `${state.session.organization.id}:${state.session.user.id}` : 'signed-out';
  const canWeighPhase = detail.phase === 'creche' || detail.phase === 'crescimento' || detail.phase === 'engorda';

  if (!allowed || !canWeighPhase || detail.data.phase !== detail.phase || detail.data.status !== 'active' || detail.data.quantity < 1) return null;

  const makeReview = () => {
    const result = swineBatchWeightCommandSchema.safeParse({
      request_key: randomUUID(),
      phase: detail.phase,
      weight_kg: weight,
      weighing_date: date,
      notes,
    });
    if (!result.success) {
      setError(copy.weighingInvalid);
      return;
    }
    setError('');
    setUnconfirmed(false);
    setReview(result.data);
  };

  const submit = async () => {
    if (!review || savingLock.current) return;
    savingLock.current = true;
    setSaving(true);
    setError('');
    try {
      const saved = await controller.registerSwineBatchWeight(String(detail.data.id), review);
      setReceipt(saved);
      setReview(null);
      setUnconfirmed(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['swine-record-detail', sessionKey, detail.phase, String(detail.data.id)] }),
        queryClient.invalidateQueries({ queryKey: ['swine-phase-page', sessionKey, detail.phase] }),
        queryClient.invalidateQueries({ queryKey: ['swine-batch-history', sessionKey, String(detail.data.id)] }),
      ]);
    } catch (caught) {
      setError(swineWeightError(caught, copy));
      if (caught instanceof SwineBatchWeightUnconfirmed) {
        setUnconfirmed(true);
      } else if (isAxiosError(caught) && caught.response?.status === 409) {
        setStale(true);
      }
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  };

  if (stale) return <View style={[s.card, { width: '100%', maxWidth: 880, alignSelf: 'center' }]}>
    <Text accessibilityRole="alert" style={s.error}>{error || copy.weighingChanged}</Text>
  </View>;

  if (receipt) return <View style={[s.card, { width: '100%', maxWidth: 880, alignSelf: 'center' }]}>
    <Text accessibilityRole="header" style={s.title}>{copy.weighingSaved}</Text>
    <Text style={s.body}>{copy.weightKg}: {formatWeight(receipt.weight_kg, language)}</Text>
    <Text style={s.body}>{copy.weighingDate}: {formatDate(receipt.weighing_date, language)}</Text>
    <AgendaButton label={copy.newWeighing} onPress={() => {
      setReceipt(null);
      setWeight('');
      setDate(localToday());
      setNotes('');
      setError('');
      setReview(null);
      setUnconfirmed(false);
    }}/>
  </View>;

  return <View style={[s.card, { width: '100%', maxWidth: 880, alignSelf: 'center' }]}>
    <Text accessibilityRole="header" style={s.title}>{copy.weighingTitle}</Text>
    {review ? <>
      <Text style={s.muted}>{copy.weighingReviewHint}</Text>
      <Text style={s.body}>{copy.weightKg}: {formatWeight(review.weight_kg, language)}</Text>
      <Text style={s.body}>{copy.weighingDate}: {formatDate(review.weighing_date, language)}</Text>
      {review.notes ? <Text style={s.body}>{copy.notes}: {review.notes}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <View style={s.row}>
        <AgendaButton label={unconfirmed ? copy.retry : copy.confirmWeighing} disabled={saving} onPress={() => void submit()}/>
        {!unconfirmed && <AgendaButton label={copy.editWeighing} disabled={saving} onPress={() => {
          setReview(null);
          setError('');
        }}/>}
      </View>
    </> : <>
      <Text style={s.label}>{copy.weightKg}</Text>
      <TextInput
        accessibilityLabel={copy.weightKg}
        style={s.input}
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
        placeholder="0.000"
      />
      <Text style={s.label}>{copy.weighingDate}</Text>
      <TextInput
        accessibilityLabel={copy.weighingDate}
        style={s.input}
        value={date}
        onChangeText={setDate}
        keyboardType="numbers-and-punctuation"
        placeholder="YYYY-MM-DD"
        maxLength={10}
      />
      <Text style={s.label}>{copy.notes}</Text>
      <TextInput
        accessibilityLabel={copy.notes}
        style={s.input}
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={1000}
      />
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <AgendaButton label={copy.reviewWeighing} onPress={makeReview}/>
    </>}
  </View>;
}

function swineBirthError(error: unknown, copy: (typeof swineMessages)[keyof typeof swineMessages]) {
  if (error instanceof SwineBirthUnconfirmed) return copy.birthUnconfirmed;
  if (error instanceof SwineBirthContextChanged) return copy.birthChanged;
  if (isAxiosError(error)) {
    const status = error.response?.status;
    if ([401, 403, 404].includes(status ?? 0)) return copy.denied;
    if (status === 409) return copy.birthChanged;
    const collect = (value: unknown): string[] => typeof value === 'string'
      ? [value]
      : Array.isArray(value) ? value.flatMap(collect) : value && typeof value === 'object' ? Object.values(value).flatMap(collect) : [];
    const messages = collect(error.response?.data);
    if (messages.length) return messages.join(' ');
  }
  return copy.birthError;
}

function SwineBirth({ detail, copy, language }: { detail: Extract<SwineRecordDetail, { kind: 'pregnancy' }>; copy: (typeof swineMessages)[keyof typeof swineMessages]; language: string }) {
  const { state, controller } = useAuth();
  const queryClient = useQueryClient();
  const [birthDate, setBirthDate] = useState('');
  const [liveBorn, setLiveBorn] = useState('');
  const [stillborn, setStillborn] = useState('0');
  const [mummified, setMummified] = useState('0');
  const [weight, setWeight] = useState('');
  const [weaningDays, setWeaningDays] = useState('');
  const [notes, setNotes] = useState('');
  const [review, setReview] = useState<SwineBirthInput | null>(null);
  const [receipt, setReceipt] = useState<SwineBirthReceipt | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [stale, setStale] = useState(false);
  const savingLock = useRef(false);
  const allowed = state.status === 'signedIn' && canWriteSwine(state.session.user);
  const sessionKey = state.status === 'signedIn' ? `${state.session.organization.id}:${state.session.user.id}` : 'signed-out';
  const pregnancyId = String(detail.data.id);
  const ongoing = detail.data.status === 'ongoing' && detail.animal.status === 'active' && detail.animal.reproductive_status === 'gestante';
  const query = useQuery({
    queryKey: ['swine-birth-options', sessionKey, pregnancyId],
    enabled: allowed && ongoing,
    staleTime: 0,
    gcTime: 0,
    queryFn: ({ signal }) => controller.swineBirthOptions(pregnancyId, signal),
  });
  const card = [s.card, { width: '100%' as const, maxWidth: 880, alignSelf: 'center' as const }];

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['swine-record-detail', sessionKey, detail.phase, pregnancyId] }),
    ...(['gestacao', 'maternidade', 'marras', 'matrizes'] as const).flatMap(changedPhase => [
      queryClient.invalidateQueries({ queryKey: ['swine-phase-page', sessionKey, changedPhase] }),
      queryClient.invalidateQueries({ queryKey: ['swine-phase-summary', sessionKey, changedPhase] }),
    ]),
  ]);

  if (!allowed) return null;
  if (receipt) return <View style={card}>
    <Text accessibilityRole="header" style={s.title}>{copy.birthSaved}</Text>
    <Text style={s.body}>{copy.birthOrder}: {formatNumber(receipt.birth_order, language, 0)}</Text>
    <Text style={s.body}>{copy.bornAlive}: {formatNumber(receipt.live_born, language, 0)} · {copy.stillborn}: {formatNumber(receipt.stillborn, language, 0)} · {copy.mummified}: {formatNumber(receipt.mummified, language, 0)}</Text>
    <Text style={s.body}>{copy.expectedWeaningDate}: {formatDate(receipt.expected_weaning_date, language)}</Text>
  </View>;
  if (!ongoing && !unconfirmed && !stale) return null;
  if (stale) return <View style={card}>
    <Text accessibilityRole="alert" style={s.error}>{error || copy.birthChanged}</Text>
    <AgendaButton label={copy.birthCheckHistory} onPress={() => void refresh()}/>
  </View>;
  if (query.isPending && !unconfirmed) return <View style={card}><Busy label={copy.loading}/></View>;
  if (query.isError && !unconfirmed) return <View style={card}>
    <Text accessibilityRole="alert" style={s.error}>{isAccessDenied(query.error) ? copy.denied : copy.birthUnavailable}</Text>
    <AgendaButton label={copy.retry} onPress={() => void query.refetch()}/>
  </View>;
  const options = query.data;
  if (!options && !review) return <View style={card}><Text accessibilityRole="alert" style={s.error}>{copy.birthUnavailable}</Text></View>;

  const count = (value: string) => /^\d{1,2}$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
  const makeReview = () => {
    if (!options) return;
    const command = swineBirthInputSchema.safeParse({
      request_key: randomUUID(),
      expected_farm: options.animal.farm,
      expected_pregnancy: options.pregnancy.id,
      animal_version: options.animal.version,
      pregnancy_version: options.pregnancy.version,
      birth_date: birthDate || options.today,
      live_born: count(liveBorn),
      stillborn: count(stillborn),
      mummified: count(mummified),
      avg_weight_kg: weight.trim() ? weight : null,
      expected_weaning_days: weaningDays.trim() ? count(weaningDays) : options.default_weaning_days,
      notes,
    });
    if (!command.success || !matchesSwineBirth(options, command.data)) {
      setError(copy.birthInvalid);
      return;
    }
    setError('');
    setReview(command.data);
  };
  const submit = async () => {
    if (!review || savingLock.current) return;
    savingLock.current = true;
    setSaving(true);
    setError('');
    try {
      const saved = await controller.recordSwineBirth(pregnancyId, review);
      setReceipt(saved);
      setReview(null);
      setUnconfirmed(false);
      await refresh();
    } catch (caught) {
      setError(swineBirthError(caught, copy));
      if (caught instanceof SwineBirthUnconfirmed) setUnconfirmed(true);
      else if (caught instanceof SwineBirthContextChanged || isAxiosError(caught) && caught.response?.status === 409) setStale(true);
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  };
  const expectedWeaning = (day: string, days: number) => {
    const date = new Date(`${day}T12:00:00`);
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const field = (label: string, value: string, onChange: (value: string) => void, props: Partial<React.ComponentProps<typeof TextInput>> = {}) => <>
    <Text style={s.label}>{label}</Text>
    <TextInput accessibilityLabel={label} style={s.input} value={value} onChangeText={onChange} {...props}/>
  </>;

  return <View style={card}>
    <Text accessibilityRole="header" style={s.title}>{copy.birthTitle}</Text>
    {review ? <>
      <Text style={s.muted}>{copy.birthReviewHint}</Text>
      <Text style={s.body}>{copy.birthDate}: {formatDate(review.birth_date, language)}</Text>
      {options ? <Text style={s.body}>{copy.birthOrder}: {formatNumber(options.birth_order, language, 0)}</Text> : null}
      <Text style={s.body}>{copy.totalBornLabel}: {formatNumber(review.live_born + review.stillborn + review.mummified, language, 0)}</Text>
      <Text style={s.body}>{copy.bornAlive}: {formatNumber(review.live_born, language, 0)} · {copy.stillborn}: {formatNumber(review.stillborn, language, 0)} · {copy.mummified}: {formatNumber(review.mummified, language, 0)}</Text>
      {review.avg_weight_kg ? <Text style={s.body}>{copy.avgBirthWeight}: {formatWeight(Number(review.avg_weight_kg), language)}</Text> : null}
      <Text style={s.body}>{copy.expectedWeaningDate}: {formatDate(expectedWeaning(review.birth_date, review.expected_weaning_days), language)}</Text>
      {review.notes ? <Text style={s.body}>{copy.notes}: {review.notes}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <View style={s.row}>
        <AgendaButton label={saving ? copy.loading : unconfirmed ? copy.retry : copy.confirmBirth} disabled={saving} onPress={() => void submit()}/>
        {!unconfirmed && <AgendaButton label={copy.editBirth} disabled={saving} onPress={() => {
          setReview(null);
          setError('');
        }}/>}
      </View>
    </> : options ? <>
      <Text style={s.muted}>{copy.birthHint}</Text>
      <Text style={s.body}>{copy.startDate}: {formatDate(options.pregnancy.start_date, language)}{options.pregnancy.expected_birth_date ? ` · ${copy.expectedBirth}: ${formatDate(options.pregnancy.expected_birth_date, language)}` : ''}</Text>
      <Text style={s.body}>{copy.birthOrder}: {formatNumber(options.birth_order, language, 0)}</Text>
      {field(copy.birthDate, birthDate || options.today, setBirthDate, { keyboardType: 'numbers-and-punctuation', placeholder: 'YYYY-MM-DD', maxLength: 10 })}
      {field(copy.bornAlive, liveBorn, setLiveBorn, { keyboardType: 'number-pad', maxLength: 2 })}
      {field(copy.stillborn, stillborn, setStillborn, { keyboardType: 'number-pad', maxLength: 2 })}
      {field(copy.mummified, mummified, setMummified, { keyboardType: 'number-pad', maxLength: 2 })}
      {field(copy.avgBirthWeight, weight, setWeight, { keyboardType: 'decimal-pad', placeholder: copy.birthWeightHint, maxLength: 5 })}
      {field(copy.expectedWeaningDays, weaningDays || String(options.default_weaning_days), setWeaningDays, { keyboardType: 'number-pad', maxLength: 2 })}
      {field(copy.notes, notes, setNotes, { multiline: true, maxLength: 1000 })}
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <AgendaButton label={copy.reviewBirth} onPress={makeReview}/>
    </> : null}
  </View>;
}

function SwineDetailContent({ detail, copy, language }: { detail: SwineRecordDetail; copy: (typeof swineMessages)[keyof typeof swineMessages]; language: string }) {
  if (detail.kind === 'animal') {
    return <>
      <SwineDetailCard title={detail.data.identifier ?? copy.identifier} fields={swineAnimalFields(detail.data, detail.phase, copy, language)}/>
      <SwineReproductiveHistory animal={detail.data} copy={copy} language={language}/>
      <SwineMating animal={detail.data} phase={detail.phase} copy={copy} language={language}/>
      <SwineDiagnosis animal={detail.data} phase={detail.phase} copy={copy} language={language}/>
    </>;
  }
  if (detail.kind === 'pregnancy') {
    return <>
      <SwineDetailCard title={detail.animal.identifier ?? detail.data.female_identifier ?? copy.identifier} fields={swineAnimalFields(detail.animal, detail.phase, copy, language)}/>
      <SwineDetailCard title={copy.phase.gestacao} fields={[
        [copy.startDate, formatDate(detail.data.start_date, language)],
        [copy.expectedBirth, formatDate(detail.data.expected_birth_date, language)],
        [copy.pregnancyStatus, swineStatusLabel(detail.data.status, copy)],
        [copy.notes, detail.data.notes ?? null],
      ]}/>
      <SwineReproductiveHistory animal={detail.animal} copy={copy} language={language}/>
      <SwineBirth detail={detail} copy={copy} language={language}/>
      <SwineTransitionForm key={detail.data.id} id={String(detail.data.id)} kind="loss" eligible={detail.data.status === 'ongoing'}/>
    </>;
  }
  if (detail.kind === 'birth') {
    return <>
      <SwineDetailCard title={detail.animal.identifier ?? detail.data.female_identifier ?? copy.identifier} fields={swineAnimalFields(detail.animal, detail.phase, copy, language)}/>
      <SwineDetailCard title={copy.phase.maternidade} fields={[
        [copy.birthDate, formatDate(detail.data.birth_date, language)],
        [copy.totalBorn, formatNumber(detail.data.total_born, language, 0)],
        [copy.bornAlive, formatNumber(detail.data.live_born, language, 0)],
        [copy.stillborn, formatNumber(detail.data.stillborn, language, 0)],
        [copy.mummified, formatNumber(detail.data.mummified, language, 0)],
        [copy.avgBirthWeight, formatWeight(detail.data.avg_weight_kg, language)],
        [copy.expectedWeaningDays, detail.data.expected_weaning_days == null ? null : formatNumber(detail.data.expected_weaning_days, language, 0)],
        [copy.notes, detail.data.notes ?? null],
      ]}/>
      <SwineReproductiveHistory animal={detail.animal} copy={copy} language={language}/>
      <SwineTransitionForm key={detail.data.id} id={String(detail.data.id)} kind="weaning" eligible={detail.animal.reproductive_status === 'lactante'}/>
    </>;
  }
  return <>
    <SwineDetailCard title={detail.data.batch_code || detail.data.name || copy.batch} fields={[
      [copy.phaseLabel, copy.phase[detail.phase]],
      [copy.farm, detail.data.farm_name ?? null],
      [copy.category, detail.data.category ?? null],
      [copy.origin, detail.data.origin ?? null],
      [copy.status, swineStatusLabel(detail.data.status, copy)],
      [copy.entry, formatDate(detail.data.entry_date, language)],
      [copy.exit, formatDate(detail.data.exit_date, language)],
      [copy.quantity, formatNumber(detail.data.quantity, language, 0)],
      [copy.weight, formatWeight(detail.data.avg_weight_kg, language)],
      [copy.notes, detail.data.notes ?? null],
    ]}/>
    <SwineBatchWeighing detail={detail} copy={copy} language={language}/>
    <SwineTransitionForm key={`sale-${detail.data.id}`} id={String(detail.data.id)} kind="sale"
      eligible={detail.data.status === 'active' && (detail.data.quantity ?? 0) > 0}/>
    <SwineTransitionForm key={`close-${detail.data.id}`} id={String(detail.data.id)} kind="close"
      eligible={detail.data.status === 'active' && (detail.data.quantity ?? 0) > 0}/>
    <SwineTransitionForm key={`mortality-${detail.data.id}`} id={String(detail.data.id)} kind="mortality"
      eligible={detail.data.status === 'active' && (detail.data.quantity ?? 0) > 0}/>
    <SwineTransitionForm key={`transfer-${detail.data.id}`} id={String(detail.data.id)} kind="transfer"
      eligible={(detail.phase === 'creche' || detail.phase === 'crescimento') && detail.data.status === 'active'}/>
    <SwineBatchHistory id={String(detail.data.id)} copy={copy} language={language}/>
  </>;
}

export function SwineDetailScreen() {
  const params = useLocalSearchParams();
  const route = z.object({ phase: swinePhaseSchema, id: z.string().min(1).max(100) }).safeParse(params);
  const { state, controller, language } = useAuth();
  const copy = swineMessages[language];
  const workspaceCopy = workspaceMessages[language];
  const router = useRouter();
  const allowed = route.success && state.status === 'signedIn' && canReadSwine(state.session.user);
  const sessionKey = state.status === 'signedIn' ? `${state.session.organization.id}:${state.session.user.id}` : 'signed-out';
  const query = useQuery({
    queryKey: ['swine-record-detail', sessionKey, route.success ? route.data.phase : 'invalid', route.success ? route.data.id : 'invalid'],
    enabled: allowed,
    staleTime: 30_000,
    queryFn: ({ signal }) => {
      if (!route.success) throw new Error('invalid swine detail route');
      return controller.swineRecordDetail(route.data.phase, route.data.id, signal);
    },
  });
  const denied = isAccessDenied(query.error);
  return <WorkspaceShell active="swine" title={route.success ? copy.phase[route.data.phase] : copy.title}>
    <ScrollView contentContainerStyle={s.content}>
      <AgendaButton label={workspaceCopy.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/swine')}/>
      {!route.success ? <Text style={s.error}>{copy.unavailable}</Text>
        : !allowed ? <Text style={s.error}>{workspaceCopy.noAccess}</Text>
          : query.isPending ? <Busy label={workspaceCopy.loading}/>
            : query.isError ? <View style={s.card}>
              <Text accessibilityRole="alert" style={s.error}>{denied ? copy.denied : copy.error}</Text>
              <AgendaButton label={copy.retry} onPress={() => void query.refetch()}/>
            </View>
              : query.data ? <SwineDetailContent detail={query.data} copy={copy} language={language}/> : null}
    </ScrollView>
  </WorkspaceShell>;
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 4 }, introIcon: { width: 46, height: 46, borderRadius: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: tokens.primarySoft }, introText: { flex: 1, gap: 3 }, iconTile: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, phaseCard: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: tokens.borderSoft, backgroundColor: tokens.surface }, phaseMain: { flex: 1, gap: 3 }, phaseCount: { color: tokens.primary, fontSize: 22, fontWeight: '800' }, pressed: { opacity: .72 }, record: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, marginBottom: 10, borderRadius: 16, borderWidth: 1, borderColor: tokens.borderSoft, backgroundColor: tokens.surface }, recordMain: { flex: 1, gap: 4 }, recordHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 }, metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }, metric: { minWidth: 66, flexGrow: 1, gap: 1 }, metricLabel: { color: tokens.muted, fontSize: 12, fontWeight: '600' }, metricValue: { color: tokens.forest, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] }, listHeader: { gap: 10, paddingBottom: 12 }, phaseHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 2 }, modal: { flex: 1, justifyContent: 'flex-end', backgroundColor: tokens.overlay }, sheet: { maxWidth: 720, width: '100%', alignSelf: 'center', padding: 18, gap: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: tokens.background }, sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 }, detailGrid: { gap: 1, borderWidth: 1, borderColor: tokens.borderSoft, borderRadius: 14, overflow: 'hidden', backgroundColor: tokens.surface }, detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingHorizontal: 13, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: tokens.divider }, detailValue: { flexShrink: 1, color: tokens.forest, fontSize: 14, fontWeight: '700', textAlign: 'right' },
});
