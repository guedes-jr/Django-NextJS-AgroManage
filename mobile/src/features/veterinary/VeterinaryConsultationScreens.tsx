import { isAxiosError } from 'axios';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { colors } from '../../theme/tokens';
import { HomeIcon } from '../home/HomeIcon';
import { BottomSheet, DayFilter, DetailHeader, EmptyState, ErrorState, FilterChips, IconTile, KpiStrip, ListFooter, ListRow, ScreenIntro, SearchBar, Segmented, SelectChip, Shortcut, SkeletonList, mobileStyles as ms } from '../../components/mobile';
import { useInfinitePages } from '../../components/mobile/useInfinitePages';
import { z } from 'zod';
import { AgendaButton, styles as ui } from '../agenda/ui';
import { AgendaShell } from '../workspace/AppShell';
import { useAuth } from '../auth/AuthProvider';
import { initialReport, reportQuery, type HerdQuery, type ReportQuery } from './consultation';
import { canUseVeterinary } from './contracts';
import { veterinaryMessages } from './messages';

const pt = {
  herd: 'Rebanho', report: 'Relatório', apply: 'Consultar', all: 'Todas', active: 'Ativos', allStatuses: 'Todas as situações',
  prev: 'Anterior', next: 'Próxima', events: 'Procedimentos', animals: 'Por animal', filters: 'Filtros',
  date: 'Data (AAAA-MM-DD)', bull: 'Touro ou sêmen', staff: 'Responsável', rate: 'Taxa de prenhez',
  invalid: 'Confira os filtros e a data.', empty: 'Nenhum registro encontrado.', search: 'Identificação ou fazenda',
  event: { mating: 'Cobertura', pregnancy: 'Gestação', birth: 'Parto', heat: 'Cio', vaccination: 'Vacinação', health: 'Sanidade' },
  procedure: { insemination: 'Inseminação', insemination_not_done: 'Inseminação não realizada', diagnosis: 'Diagnóstico', iatf_protocol: 'Protocolo IATF', other: 'Outro', observe_heat: 'Observar cio', induction: 'Indução', discard: 'Descarte' },
  result: { pregnant: 'Prenha', open: 'Vazia', awaiting: 'Aguardando diagnóstico' },
};
export const vetConsultationCopy = {
  'pt-BR': pt, 'pt-PT': pt,
  en: {
    herd: 'Herd', report: 'Report', apply: 'Apply', all: 'All', active: 'Active', allStatuses: 'All statuses',
    prev: 'Previous', next: 'Next', events: 'Procedures', animals: 'By animal', filters: 'Filters',
    date: 'Date (YYYY-MM-DD)', bull: 'Bull or semen', staff: 'Responsible', rate: 'Pregnancy rate',
    invalid: 'Check the filters and date.', empty: 'No records found.', search: 'Identifier or farm',
    event: { mating: 'Mating', pregnancy: 'Pregnancy', birth: 'Birth', heat: 'Heat', vaccination: 'Vaccination', health: 'Health' },
    procedure: { insemination: 'Insemination', insemination_not_done: 'Insemination not done', diagnosis: 'Diagnosis', iatf_protocol: 'IATF protocol', other: 'Other', observe_heat: 'Watch for heat', induction: 'Induction', discard: 'Cull' },
    result: { pregnant: 'Pregnant', open: 'Open', awaiting: 'Awaiting diagnosis' },
  },
  es: {
    herd: 'Rebaño', report: 'Informe', apply: 'Aplicar', all: 'Todos', active: 'Activos', allStatuses: 'Todos los estados',
    prev: 'Anterior', next: 'Siguiente', events: 'Procedimientos', animals: 'Por animal', filters: 'Filtros',
    date: 'Fecha (AAAA-MM-DD)', bull: 'Toro o semen', staff: 'Responsable', rate: 'Tasa de preñez',
    invalid: 'Revise los filtros y la fecha.', empty: 'No se encontraron registros.', search: 'Identificación o finca',
    event: { mating: 'Cubrición', pregnancy: 'Gestación', birth: 'Parto', heat: 'Celo', vaccination: 'Vacunación', health: 'Sanidad' },
    procedure: { insemination: 'Inseminación', insemination_not_done: 'Inseminación no realizada', diagnosis: 'Diagnóstico', iatf_protocol: 'Protocolo IATF', other: 'Otro', observe_heat: 'Observar celo', induction: 'Inducción', discard: 'Descarte' },
    result: { pregnant: 'Preñada', open: 'Vacía', awaiting: 'En espera de diagnóstico' },
  },
};

function denied(error: unknown) {
  return isAxiosError(error) && [401, 403, 404].includes(error.response?.status ?? 0);
}

function useConsultation() {
  const { state, controller, language } = useAuth();
  const router = useRouter();
  return {
    controller, router, language, t: veterinaryMessages[language], copy: vetConsultationCopy[language],
    allowed: state.status === 'signedIn' && canUseVeterinary(state.session.user),
    scope: state.status === 'signedIn' ? `${state.session.organization.id}:${state.session.user.id}` : '',
    back: () => router.canGoBack() ? router.back() : router.replace('/veterinary'),
  };
}

type HerdRow = Awaited<ReturnType<ReturnType<typeof useAuth>['controller']['vetHerd']>>['results'][number];
export function VeterinaryHerdScreen() {
  const { controller, router, t, copy, allowed, scope, back, language } = useConsultation();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<HerdQuery['status']>('active');
  const [species, setSpecies] = useState('');
  const list = useInfinitePages<HerdRow>({
    queryKey: ['vet-herd', scope, 'infinite', q, status, species], enabled: allowed,
    fetchPage: async (page, signal) => { const data = await controller.vetHerd({ q, page, species, status }, signal); return { results: data.results, count: data.count, next: data.page * data.page_size < data.count ? String(page + 1) : null, species: data.species }; },
  });
  const speciesOptions = (list.data?.pages[0] as { species?: { code: string; name: string }[] } | undefined)?.species ?? [];
  return <AgendaShell title={copy.herd} backLabel={t.back} onBack={back}>
    {!allowed || denied(list.error) ? <View style={ms.list}><EmptyState title={t.noAccess}/></View> : <FlatList<HerdRow> data={list.rows}
      contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" keyExtractor={row => row.id}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={colors.primary} colors={[colors.primary]}/>} onEndReached={list.loadMore} onEndReachedThreshold={0.4}
      ListHeaderComponent={<View style={ms.header}>
        <ScreenIntro title={copy.herd} subtitle={list.count !== undefined ? String(list.count) : undefined}/>
        <SearchBar value={q} onChange={setQ} placeholder={copy.search} language={language}/>
        <FilterChips value={status} onChange={setStatus} options={[{ value: 'active' as const, label: copy.active }, { value: 'all' as const, label: copy.allStatuses }]}/>
        {speciesOptions.length > 0 && <FilterChips value={species} onChange={setSpecies} options={[{ value: '', label: copy.all }, ...speciesOptions.map(sp => ({ value: sp.code, label: sp.name }))]}/>}
      </View>}
      ListEmptyComponent={list.isPending ? <SkeletonList/> : list.isError ? <ErrorState message={t.error} language={language} onRetry={() => void list.refetch()}/> : <EmptyState title={copy.empty}/>}
      ListFooterComponent={list.rows.length ? <ListFooter loading={list.isFetchingNextPage} end={!list.hasNextPage} language={language}/> : undefined}
      renderItem={({ item }) => <ListRow meta={item.farm_name} title={item.identifier || item.species_name} subtitle={[item.species_name, item.category, item.reproductive_status].filter(Boolean).join(' · ')} leading={<IconTile tone="brand"><HomeIcon name="group" size={20} color={colors.primary}/></IconTile>} accessibilityLabel={`${item.identifier}. ${t.animals.history}`} onPress={() => router.push({ pathname: '/veterinary/herd-history', params: { id: item.id } })}/>}
    />}
  </AgendaShell>;
}

export function VeterinaryHerdHistoryScreen() {
  const { controller, t, copy, allowed, scope, back, language } = useConsultation();
  const id = z.uuid().safeParse(useLocalSearchParams().id).data;
  const query = useQuery({
    queryKey: ['vet-herd-history', scope, id], enabled: allowed && !!id, retry: false,
    queryFn: ({ signal }) => controller.vetHerdHistory(id ?? '', signal),
  });
  const result = denied(query.error) ? undefined : query.data;
  return <AgendaShell title={t.animals.history} backLabel={t.back} onBack={back}>
    {!allowed ? <View style={ms.list}><EmptyState title={t.noAccess}/></View> : !id ? <View style={ms.list}><ErrorState message={t.error} language={language}/></View> : <FlatList
      data={result?.events ?? []} contentContainerStyle={ms.list} keyExtractor={(event, index) => `${event.kind}:${event.date}:${index}`}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void query.refetch()} tintColor={colors.primary} colors={[colors.primary]}/>}
      ListHeaderComponent={<View style={ms.header}>
        {result ? <DetailHeader meta={`${result.farm_name} · ${result.species_name}`} title={result.identifier} leading={<IconTile tone="brand"><HomeIcon name="group" size={22} color={colors.primary}/></IconTile>}/> : null}
        {query.isPending ? <SkeletonList rows={3}/> : null}
        {query.isError ? <ErrorState message={denied(query.error) ? t.noAccess : t.error} language={language} onRetry={() => void query.refetch()}/> : null}
      </View>}
      ListEmptyComponent={query.isSuccess ? <EmptyState title={copy.empty}/> : undefined}
      renderItem={({ item }) => <ListRow meta={item.date} title={copy.event[item.kind]} subtitle={[item.title, item.status, item.detail].filter(Boolean).join(' · ') || undefined}/>}
    />}
  </AgendaShell>;
}

export function VeterinaryReportScreen() {
  const { controller, router, t, copy, allowed, scope, back, language } = useConsultation();
  const [filter, setFilter] = useState<ReportQuery>(initialReport);
  const [sheet, setSheet] = useState(false);
  const query = useQuery({ queryKey: ['vet-report', scope, filter], enabled: allowed && reportQuery.safeParse(filter).success, queryFn: ({ signal }) => controller.vetReport(filter, signal) });
  const clients = useQuery({ queryKey: ['vet-report-clients', scope], enabled: allowed && sheet, queryFn: ({ signal }) => controller.vetClients(signal) });
  const update = (patch: Partial<ReportQuery>) => setFilter(prev => ({ ...prev, ...patch }));
  const result = denied(query.error) ? undefined : query.data;
  const procedureLabel = (value: string) => copy.procedure[value as keyof typeof copy.procedure] ?? value;
  const resultLabel = (value?: string | null) => value ? copy.result[value as keyof typeof copy.result] ?? value : '';
  const rows: { id: string; animal: string; identifier: string; client_name: string; detail: string }[] = filter.mode === 'animal'
    ? (result?.animals ?? []).map(row => ({ id: row.animal, ...row, detail: [`${copy.events}: ${row.count}`, resultLabel(row.result), row.last?.date, row.last ? procedureLabel(row.last.report_kind) : ''].filter(Boolean).join(' · ') }))
    : (result?.rows ?? []).map(row => ({ ...row, detail: [row.date, procedureLabel(row.report_kind), resultLabel(row.report_result), row.report_bull].filter(Boolean).join(' · ') }));
  const active = ['client', 'date', 'procedure', 'result', 'category', 'bull', 'responsible'].filter(key => filter[key as keyof ReportQuery]).length;
  const group = (label: string, key: 'client' | 'procedure' | 'result' | 'category' | 'bull' | 'responsible', options: [string, string][]) => <View style={{ gap: 6 }}><Text style={ui.label}>{label}</Text><FilterChips value={filter[key]} onChange={value => update({ [key]: value })} options={options.map(([value, text]) => ({ value, label: text }))}/></View>;
  return <AgendaShell title={copy.report} backLabel={t.back} onBack={back}>
    {!allowed ? <View style={ms.list}><EmptyState title={t.noAccess}/></View> : <FlatList data={rows} keyExtractor={row => row.id}
      contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void query.refetch()} tintColor={colors.primary} colors={[colors.primary]}/>}
      ListHeaderComponent={<View style={ms.header}>
        <ScreenIntro title={copy.report}/>
        <Segmented value={filter.mode} onChange={mode => update({ mode })} options={[{ value: 'event', label: copy.events }, { value: 'animal', label: copy.animals }]}/>
        <SearchBar value={filter.q} onChange={q => update({ q })} placeholder={t.search} language={language}/>
        <View style={ms.wrap}><SelectChip label={copy.filters} value={active ? `${copy.filters} · ${active}` : undefined} active={active > 0} onPress={() => setSheet(true)}/>{active > 0 && <Shortcut label={copy.all} onPress={() => setFilter({ ...initialReport, mode: filter.mode, q: filter.q })}/>}</View>
        {query.isPending ? <SkeletonList rows={2}/> : null}
        {query.isError ? <ErrorState message={denied(query.error) ? t.noAccess : t.error} language={language} onRetry={() => void query.refetch()}/> : null}
        {result ? <KpiStrip items={[{ key: 'p', label: copy.events, value: String(result.stats.procedures) }, { key: 'a', label: t.animals.title, value: String(result.stats.animals) }, ...(result.stats.rate == null ? [] : [{ key: 'r', label: copy.rate, value: `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(result.stats.rate)}%`, tone: 'success' as const }])]}/> : null}
      </View>}
      ListEmptyComponent={query.isSuccess ? <EmptyState title={copy.empty}/> : undefined}
      renderItem={({ item }) => <ListRow meta={item.client_name} title={item.identifier} subtitle={item.detail} accessibilityLabel={`${item.identifier}. ${t.animals.history}`} onPress={() => router.push({ pathname: '/veterinary/animal', params: { id: item.animal } })}/>}
    />}
    <BottomSheet visible={sheet} title={copy.filters} onClose={() => setSheet(false)} language={language}><View style={{ gap: 14 }}>
      <View style={{ gap: 6 }}><Text style={ui.label}>{copy.date}</Text><DayFilter value={filter.date} onChange={date => update({ date })} language={language} allLabel={copy.all}/></View>
      {group(t.allClients, 'client', [['', copy.all], ...(clients.data ?? []).map((row): [string, string] => [row.id, row.name])])}
      {group(copy.events, 'procedure', [['', copy.all], ...Object.entries(copy.procedure)])}
      {group(copy.events, 'result', [['', copy.all], ...Object.entries(copy.result)])}
      {group(t.animals.allCategories, 'category', [['', t.animals.allCategories], ...Object.entries(t.category)])}
      {group(copy.bull, 'bull', [['', copy.all], ...(result?.bulls ?? []).map((row): [string, string] => [row.name, row.name])])}
      {group(copy.staff, 'responsible', [['', copy.all], ...(result?.responsibles ?? []).map((name): [string, string] => [name, name])])}
      <AgendaButton variant="primary" label={copy.apply} onPress={() => setSheet(false)}/>
    </View></BottomSheet>
  </AgendaShell>;
}
