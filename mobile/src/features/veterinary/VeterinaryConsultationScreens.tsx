import { isAxiosError } from 'axios';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { z } from 'zod';
import { AgendaButton, AgendaShell, Busy, styles as s } from '../agenda/ui';
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

export function VeterinaryHerdScreen() {
  const { controller, router, t, copy, allowed, scope, back } = useConsultation();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<HerdQuery>({ q: '', page: 1, species: '', status: 'active' });
  const query = useQuery({
    queryKey: ['vet-herd', scope, filter], enabled: allowed,
    queryFn: ({ signal }) => controller.vetHerd(filter, signal),
  });
  const result = denied(query.error) ? undefined : query.data;
  return <AgendaShell title={copy.herd} backLabel={t.back} onBack={back}>
    {!allowed ? <Text style={s.error}>{t.noAccess}</Text> : <FlatList data={result?.results ?? []}
      contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyExtractor={row => row.id}
      ListHeaderComponent={<View style={{ gap: 8 }}>
        <TextInput style={s.input} accessibilityLabel={copy.search} placeholder={copy.search} value={search} onChangeText={setSearch} maxLength={100}/>
        <AgendaButton label={copy.apply} onPress={() => setFilter(value => ({ ...value, q: search.trim(), page: 1 }))}/>
        <View style={s.row}>
          {(['active', 'all'] as const).map(status => <AgendaButton key={status} label={status === 'active' ? copy.active : copy.allStatuses}
            selected={filter.status === status} onPress={() => setFilter(value => ({ ...value, status, page: 1 }))}/>)}
        </View>
        {(result?.species.length ?? 0) > 0 ? <View style={s.row}>
          <AgendaButton label={copy.all} selected={!filter.species} onPress={() => setFilter(value => ({ ...value, species: '', page: 1 }))}/>
          {result?.species.map(species => <AgendaButton key={species.code} label={species.name} selected={filter.species === species.code}
            onPress={() => setFilter(value => ({ ...value, species: species.code, page: 1 }))}/>)}
        </View> : null}
        {query.isPending ? <Busy label={t.loading}/> : null}
        {query.isError ? <><Text accessibilityRole="alert" style={s.error}>{denied(query.error) ? t.noAccess : t.error}</Text><AgendaButton label={t.retry} onPress={() => void query.refetch()}/></> : null}
        {result ? <Text style={s.body}>{result.count} · {result.page}/{Math.max(1, Math.ceil(result.count / result.page_size))}</Text> : null}
      </View>}
      ListEmptyComponent={query.isSuccess ? <Text style={s.body}>{copy.empty}</Text> : undefined}
      ListFooterComponent={result ? <View style={s.row}>
        <AgendaButton label={copy.prev} disabled={filter.page === 1} onPress={() => setFilter(value => ({ ...value, page: value.page - 1 }))}/>
        <AgendaButton label={copy.next} disabled={result.page * result.page_size >= result.count} onPress={() => setFilter(value => ({ ...value, page: value.page + 1 }))}/>
      </View> : undefined}
      renderItem={({ item }) => <View style={s.card}>
        <Text style={s.title}>{item.identifier || item.species_name}</Text>
        <Text style={s.body}>{item.farm_name} · {[item.species_name, item.category, item.reproductive_status].filter(Boolean).join(' · ')}</Text>
        <AgendaButton label={t.animals.history} onPress={() => router.push({ pathname: '/veterinary/herd-history', params: { id: item.id } })}/>
      </View>}
    />}
  </AgendaShell>;
}

export function VeterinaryHerdHistoryScreen() {
  const { controller, t, copy, allowed, scope, back } = useConsultation();
  const id = z.uuid().safeParse(useLocalSearchParams().id).data;
  const query = useQuery({
    queryKey: ['vet-herd-history', scope, id], enabled: allowed && !!id, retry: false,
    queryFn: ({ signal }) => controller.vetHerdHistory(id ?? '', signal),
  });
  const result = denied(query.error) ? undefined : query.data;
  return <AgendaShell title={t.animals.history} backLabel={t.back} onBack={back}>
    {!allowed ? <Text style={s.error}>{t.noAccess}</Text> : !id ? <Text style={s.error}>{t.error}</Text> : <FlatList
      data={result?.events ?? []} contentContainerStyle={s.content} keyExtractor={(event, index) => `${event.kind}:${event.date}:${index}`}
      ListHeaderComponent={<View style={{ gap: 8 }}>
        {result ? <View style={s.card}><Text style={s.title}>{result.identifier}</Text><Text style={s.body}>{result.farm_name} · {result.species_name}</Text></View> : null}
        {query.isPending ? <Busy label={t.loading}/> : null}
        {query.isError ? <><Text accessibilityRole="alert" style={s.error}>{denied(query.error) ? t.noAccess : t.error}</Text><AgendaButton label={t.retry} onPress={() => void query.refetch()}/></> : null}
      </View>}
      ListEmptyComponent={query.isSuccess ? <Text style={s.body}>{copy.empty}</Text> : undefined}
      renderItem={({ item }) => <View style={s.card}>
        <Text style={s.title}>{copy.event[item.kind]}</Text>
        <Text style={s.body}>{[item.date, item.title, item.status].filter(Boolean).join(' · ')}</Text>
        {item.detail ? <Text style={s.body}>{item.detail}</Text> : null}
      </View>}
    />}
  </AgendaShell>;
}

export function VeterinaryReportScreen() {
  const { controller, router, t, copy, allowed, scope, back, language } = useConsultation();
  const [draft, setDraft] = useState<ReportQuery>(initialReport);
  const [filter, setFilter] = useState<ReportQuery>(initialReport);
  const [expanded, setExpanded] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const query = useQuery({ queryKey: ['vet-report', scope, filter], enabled: allowed, queryFn: ({ signal }) => controller.vetReport(filter, signal) });
  const clients = useQuery({ queryKey: ['vet-report-clients', scope], enabled: allowed && expanded, queryFn: ({ signal }) => controller.vetClients(signal) });
  const update = (key: keyof ReportQuery, value: string) => setDraft(prev => ({ ...prev, [key]: value }));
  const choice = (key: 'client' | 'mode' | 'procedure' | 'result' | 'category' | 'bull' | 'responsible', options: [string, string][]) => (
    <View style={s.row}>
      {options.map(([value, label]) => <AgendaButton key={value} label={label} selected={draft[key] === value} onPress={() => update(key, value)}/>)}
    </View>
  );
  const result = denied(query.error) ? undefined : query.data;
  const procedureLabel = (value: string) => copy.procedure[value as keyof typeof copy.procedure] ?? value;
  const resultLabel = (value?: string | null) => value ? copy.result[value as keyof typeof copy.result] ?? value : '';
  const rows: { id: string; animal: string; identifier: string; client_name: string; detail: string }[] = filter.mode === 'animal'
    ? (result?.animals ?? []).map(row => ({ id: row.animal, ...row, detail: [`${copy.events}: ${row.count}`, resultLabel(row.result), row.last?.date, row.last ? procedureLabel(row.last.report_kind) : ''].filter(Boolean).join(' · ') }))
    : (result?.rows ?? []).map(row => ({ ...row, detail: [row.date, procedureLabel(row.report_kind), resultLabel(row.report_result), row.report_bull].filter(Boolean).join(' · ') }));
  return <AgendaShell title={copy.report} backLabel={t.back} onBack={back}>
    {!allowed ? <Text style={s.error}>{t.noAccess}</Text> : <FlatList data={rows} keyExtractor={row => row.id}
      contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
      ListHeaderComponent={<View style={{ gap: 8 }}>
        {choice('mode', [['event', copy.events], ['animal', copy.animals]])}
        <TextInput style={s.input} accessibilityLabel={t.search} placeholder={t.search} value={draft.q} maxLength={100} onChangeText={value => update('q', value)}/>
        <AgendaButton label={copy.filters} selected={expanded} onPress={() => setExpanded(value => !value)}/>
        {expanded ? <View style={s.card}>
          <TextInput style={s.input} accessibilityLabel={copy.date} placeholder={copy.date} value={draft.date} maxLength={10} onChangeText={value => update('date', value)}/>
          <Text style={s.body}>{t.allClients}</Text>
          {clients.isError ? <AgendaButton label={t.retry} onPress={() => void clients.refetch()}/> : null}
          {choice('client', [['', copy.all], ...(clients.data ?? []).map((row): [string, string] => [row.id, row.name])])}
          <Text style={s.body}>{copy.events}</Text>
          {choice('procedure', [['', copy.all], ...Object.entries(copy.procedure)])}
          {choice('result', [['', copy.all], ...Object.entries(copy.result)])}
          {choice('category', [['', t.animals.allCategories], ...Object.entries(t.category)])}
          <Text style={s.body}>{copy.bull}</Text>
          {choice('bull', [['', copy.all], ...(result?.bulls ?? []).map((row): [string, string] => [row.name, row.name])])}
          <Text style={s.body}>{copy.staff}</Text>
          {choice('responsible', [['', copy.all], ...(result?.responsibles ?? []).map((name): [string, string] => [name, name])])}
        </View> : null}
        <AgendaButton label={copy.apply} onPress={() => {
          const parsed = reportQuery.safeParse(draft);
          setInvalid(!parsed.success);
          if (parsed.success) setFilter(parsed.data);
        }}/>
        {invalid ? <Text accessibilityRole="alert" style={s.error}>{copy.invalid}</Text> : null}
        {query.isPending ? <Busy label={t.loading}/> : null}
        {query.isError ? <><Text accessibilityRole="alert" style={s.error}>{denied(query.error) ? t.noAccess : t.error}</Text><AgendaButton label={t.retry} onPress={() => void query.refetch()}/></> : null}
        {result ? <Text style={s.body}>{copy.events}: {result.stats.procedures} · {t.animals.title}: {result.stats.animals}
          {result.stats.rate == null ? '' : ` · ${copy.rate}: ${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(result.stats.rate)}%`}
        </Text> : null}
      </View>}
      ListEmptyComponent={query.isSuccess ? <Text style={s.body}>{copy.empty}</Text> : undefined}
      renderItem={({ item }) => <View style={s.card}>
        <Text style={s.title}>{item.identifier} · {item.client_name}</Text>
        <Text style={s.body}>{item.detail}</Text>
        <AgendaButton label={t.animals.history} onPress={() => router.push({ pathname: '/veterinary/animal', params: { id: item.animal } })}/>
      </View>}
    />}
  </AgendaShell>;
}
