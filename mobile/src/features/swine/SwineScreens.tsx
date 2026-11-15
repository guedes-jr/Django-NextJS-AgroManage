import { useState } from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { useQueries, useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import { AgendaButton, Busy, styles as s } from '../agenda/ui';
import { WorkspaceShell } from '../workspace/WorkspaceShell';
import { canReadSwine, swinePhaseSchema, swinePhases, type SwinePhase, type SwinePhaseRow } from './contracts';
import { swineMessages, swineStatusLabel } from './messages';
import { workspaceMessages } from '../workspace/messages';

const pageSize = 20;

function isAccessDenied(error: unknown) {
  return isAxiosError(error) && [401, 403, 404].includes(error.response?.status ?? 0);
}

function formatDate(value: string | null | undefined, language: string) {
  if (!value) return null;
  const raw = value.slice(0, 10);
  const date = new Date(`${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(language).format(date);
}

function formatNumber(value: number, language: string, maximumFractionDigits = 1) {
  return new Intl.NumberFormat(language, { maximumFractionDigits }).format(value);
}

function formatRemaining(value: string, copy: (typeof swineMessages)[keyof typeof swineMessages]) {
  if (value.toLocaleLowerCase().startsWith('pronto')) return copy.readyNow;
  const days = value.match(/\d+/)?.[0];
  return days ? `${days} ${copy.dayUnit}` : value;
}

function formatWeight(value: number | string | null | undefined, language: string) {
  if (value == null || value === '') return null;
  return typeof value === 'number' ? `${formatNumber(value, language, 2)} kg` : value;
}

function SwineRecordCard({ title, status, fields }: { title: string; status: string; fields: [string, string | null][] }) {
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.title}>{title || '—'}</Text>
    <Text style={s.badge}>{status}</Text>
    {fields.map(([label, value]) => value != null && value !== '' ? <Text key={label} style={s.muted}>{label}: {value}</Text> : null)}
  </View>;
}

function renderRecord(record: SwinePhaseRow, copy: (typeof swineMessages)[keyof typeof swineMessages], language: string) {
  const { phase, data } = record;
  switch (phase) {
    case 'marras':
      return <SwineRecordCard
        key={`${phase}:${data.id}`}
        title={data.identifier ?? ''}
        status={swineStatusLabel(data.status, copy)}
        fields={[
          [copy.age, data.idade == null ? null : `${formatNumber(data.idade, language, 0)} d`],
          [copy.weight, formatWeight(data.peso, language)],
          [copy.entry, formatDate(data.entrada, language)],
        ]}
      />;
    case 'matrizes':
      return <SwineRecordCard
        key={`${phase}:${data.id}`}
        title={data.identifier ?? ''}
        status={swineStatusLabel(data.status, copy)}
        fields={[
          [copy.parity, formatNumber(data.op, language, 0)],
          [copy.openDays, data.dias_abertos == null ? null : formatNumber(data.dias_abertos, language, 0)],
          [copy.lastCoverage, data.ultima_cobertura === '—' ? null : formatDate(data.ultima_cobertura, language)],
        ]}
      />;
    case 'gestacao':
      return <SwineRecordCard
        key={`${phase}:${data.id}`}
        title={data.identifier ?? ''}
        status={swineStatusLabel(data.status, copy)}
        fields={[
          [copy.coverage, formatDate(data.cobertura, language)],
          [copy.gestationDays, formatNumber(data.dias, language, 0)],
          [copy.forecast, formatDate(data.previsao, language)],
          [copy.daysRemaining, formatRemaining(data.dias_faltantes, copy)],
        ]}
      />;
    case 'maternidade':
      return <SwineRecordCard
        key={`${phase}:${data.id}`}
        title={data.identifier ?? ''}
        status={swineStatusLabel(data.status, copy)}
        fields={[
          [copy.birthDate, formatDate(data.data_parto, language)],
          [copy.bornAlive, formatNumber(data.vivos, language, 0)],
          [copy.currentAlive, formatNumber(data.vivos_atual, language, 0)],
          [copy.deaths, formatNumber(data.obitos, language, 0)],
          [copy.weaning, formatDate(data.previsao_desmame, language)],
        ]}
      />;
    case 'creche':
      return <SwineRecordCard
        key={`${phase}:${data.id}`}
        title={data.lote}
        status={swineStatusLabel(data.status, copy)}
        fields={[
          [copy.quantity, formatNumber(data.qtd, language, 0)],
          [copy.weight, formatWeight(data.peso, language)],
          [copy.entry, formatDate(data.entrada, language)],
          [copy.forecast, formatDate(data.prev_crescimento, language)],
        ]}
      />;
    case 'crescimento':
    case 'engorda':
      return <SwineRecordCard
        key={`${phase}:${data.id}`}
        title={data.lote}
        status={swineStatusLabel(data.status, copy)}
        fields={[
          [copy.quantity, formatNumber(data.qtd, language, 0)],
          [copy.weight, formatWeight(data.peso, language)],
          [copy.days, data.dias == null ? null : formatNumber(data.dias, language, 0)],
          [copy.dailyGain, data.gpd == null ? null : `${formatNumber(data.gpd, language, 2)} kg/d`],
          [copy.forecast, formatDate(data.previsao, language)],
        ]}
      />;
  }
}

export function SwineHomeScreen() {
  const { state, controller, language } = useAuth();
  const router = useRouter();
  const copy = swineMessages[language];
  const workspaceCopy = workspaceMessages[language];
  const allowed = state.status === 'signedIn' && canReadSwine(state.session.user);
  const sessionKey = state.status === 'signedIn' ? `${state.session.organization.id}:${state.session.user.id}` : 'signed-out';
  const summaries = useQueries({
    queries: swinePhases.map(phase => ({
      queryKey: ['swine-phase-summary', sessionKey, phase],
      enabled: allowed,
      staleTime: 30_000,
      queryFn: ({ signal }: { signal: AbortSignal }) => controller.swinePhasePage(phase, 1, 1, signal),
    })),
  });

  return <WorkspaceShell active="swine" title={copy.title}>
    {!allowed ? <View style={s.content}><Text style={s.error}>{workspaceCopy.noAccess}</Text></View> : <ScrollView contentContainerStyle={s.content}>
      <Text style={s.body}>{copy.subtitle}</Text>
      <Text style={s.muted}>{copy.scopeHint}</Text>
      {swinePhases.map((phase, index) => {
        const query = summaries[index];
        if (!query) return null;
        const count = query.data?.count;
        return <View key={phase} style={s.card}>
          <Text accessibilityRole="header" style={s.title}>{copy.phase[phase]}</Text>
          {query.isPending ? <Busy label={workspaceCopy.loading}/> : query.isError
            ? <><Text accessibilityRole="alert" style={s.error}>{isAccessDenied(query.error) ? copy.denied : copy.error}</Text><AgendaButton label={copy.retry} onPress={() => void query.refetch()}/></>
            : <Text style={s.body}>{count == null ? '—' : formatNumber(count, language, 0)} {copy.total}</Text>}
          <AgendaButton label={copy.open} onPress={() => router.push({ pathname: '/swine/[phase]', params: { phase } })}/>
        </View>;
      })}
    </ScrollView>}
  </WorkspaceShell>;
}

export function SwinePhaseScreen() {
  const params = useLocalSearchParams<{ phase?: string }>();
  const route = swinePhaseSchema.safeParse(params.phase);
  const { state, controller, language } = useAuth();
  const copy = swineMessages[language];
  const workspaceCopy = workspaceMessages[language];
  const phase: SwinePhase = route.success ? route.data : 'marras';
  const [pagination, setPagination] = useState<{ phase: SwinePhase; page: number }>({ phase, page: 1 });
  const page = pagination.phase === phase ? pagination.page : 1;
  const allowed = route.success && state.status === 'signedIn' && canReadSwine(state.session.user);
  const sessionKey = state.status === 'signedIn' ? `${state.session.organization.id}:${state.session.user.id}` : 'signed-out';
  const query = useQuery({
    queryKey: ['swine-phase-page', sessionKey, phase, page],
    enabled: allowed,
    staleTime: 30_000,
    queryFn: ({ signal }) => controller.swinePhasePage(phase, page, pageSize, signal),
  });
  const data = isAccessDenied(query.error) ? undefined : query.data;
  const rows = data?.rows ?? [];
  const setPage = (nextPage: number) => setPagination({ phase, page: nextPage });

  return <WorkspaceShell active="swine" title={route.success ? copy.phase[phase] : copy.title}>
    {!allowed ? <View style={s.content}><Text style={s.error}>{route.success ? workspaceCopy.noAccess : copy.unavailable}</Text></View> : <FlatList<SwinePhaseRow>
      key={`${phase}:${page}`}
      contentContainerStyle={s.content}
      data={rows}
      keyExtractor={item => `${item.phase}:${item.data.id}`}
      renderItem={({ item }) => renderRecord(item, copy, language)}
      ListHeaderComponent={<View style={{ gap: 10 }}>
        <Text style={s.muted}>{copy.scopeHint}</Text>
        {query.isPending && <Busy label={workspaceCopy.loading}/>}
        {query.isError && <View style={s.card}>
          <Text accessibilityRole="alert" style={s.error}>{isAccessDenied(query.error) ? copy.denied : copy.error}</Text>
          <AgendaButton label={copy.retry} onPress={() => void query.refetch()}/>
        </View>}
        {data && <Text style={s.muted}>{formatNumber(data.count, language, 0)} {copy.total}</Text>}
      </View>}
      ListEmptyComponent={!query.isPending && !query.isError ? <Text style={s.body}>{copy.empty}</Text> : undefined}
      ListFooterComponent={data && data.count > 0 ? <View style={s.row}>
        <AgendaButton label={copy.previous} disabled={!data.previous || query.isFetching} onPress={() => setPage(Math.max(1, page - 1))}/>
        <Text style={s.muted}>{copy.page} {page}</Text>
        <AgendaButton label={copy.next} disabled={!data.next || query.isFetching} onPress={() => setPage(page + 1)}/>
      </View> : undefined}
    />}
  </WorkspaceShell>;
}
