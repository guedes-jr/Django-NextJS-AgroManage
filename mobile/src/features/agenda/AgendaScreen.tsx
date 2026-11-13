import { WorkspaceShell } from '../workspace/WorkspaceShell';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { organizationDay } from '../workspace/contracts';
import { FarmContextButton } from '../workspace/FarmContextButton';
import { useRead } from '../workspace/useRead';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import { agendaQuerySchema, canReadAgenda, taskWriteAccess, shiftDay, type AgendaQuery, type agendaPageSchema } from './contracts';
import { agendaMessages, agendaLabel } from './messages';
import { AgendaButton, Busy, styles as s } from './ui';
import type { z } from 'zod';
import { taskFormMessages } from './formMessages';

type AgendaViewMode = 'month' | 'week' | 'list';

function shiftMonth(day: string, offset: number): string {
  const [y = 2026, m = 1, d = 1] = day.split('-').map(Number);
  const next = new Date(y, m - 1 + offset, 1, 12);
  const maxDays = new Date(next.getFullYear(), next.getMonth() + 1, 0, 12).getDate();
  const targetDay = Math.min(d, maxDays);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

export function AgendaScreen() {
  const { controller, language } = useAuth();
  const t = agendaMessages[language];
  const [retry, setRetry] = useState(0);
  const load = useCallback((signal: AbortSignal) => controller.agendaOptions(signal), [controller]);
  const options = useRead(String(retry), load);

  if (options.loading) return <WorkspaceShell active="agenda" title={t.title}><Busy label={t.loading} /></WorkspaceShell>;
  if (options.failed || !options.data) return <WorkspaceShell active="agenda" title={t.title}><View style={s.content}><Text accessibilityRole="alert" style={s.error}>{t.error}</Text><AgendaButton label={t.retry} onPress={() => setRetry(v => v + 1)} /></View></WorkspaceShell>;
  return <AgendaContents timezone={options.data.timezone} />;
}

function AgendaContents({ timezone }: { timezone: string }) {
  const { state, controller, language } = useAuth();
  const router = useRouter();
  const t = agendaMessages[language];
  const { farm } = useWorkspace();

  const today = useMemo(() => organizationDay(timezone), [timezone]);
  const [currentDate, setCurrentDate] = useState(today);
  const [viewMode, setViewMode] = useState<AgendaViewMode>('month');
  const [domain, setDomain] = useState<AgendaQuery['domain']>('all');
  const [recorded, setRecorded] = useState(false);
  const [pagination, setPagination] = useState<{ farm: string | null; page: number }>({ farm: farm?.id ?? null, page: 1 });
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<{ key: string; data: z.infer<typeof agendaPageSchema> | null; failed: boolean }>({ key: '', data: null, failed: false });

  const farmKey = farm?.id ?? null;
  const page = pagination.farm === farmKey ? pagination.page : 1;
  const setPage = (value: number | ((current: number) => number)) => setPagination({ farm: farmKey, page: typeof value === 'function' ? value(page) : value });

  const allowed = state.status === 'signedIn' && canReadAgenda(state.session.user);

  // Período de busca na API
  const { start, end } = useMemo(() => {
    const [y = 2026, m = 1] = currentDate.split('-').map(Number);
    if (viewMode === 'week') {
      const d = new Date(`${currentDate}T12:00:00`);
      const weekday = (d.getDay() + 6) % 7;
      const monday = new Date(d);
      monday.setDate(monday.getDate() - weekday);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      const sDate = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
      const eDate = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`;
      return { start: sDate, end: eDate };
    }
    const lastDay = new Date(y, m, 0, 12).getDate();
    return {
      start: `${y}-${String(m).padStart(2, '0')}-01`,
      end: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };
  }, [currentDate, viewMode]);

  const requestKey = JSON.stringify([start, end, domain, page, recorded, reload, farm?.id]);
  const busy = result.key !== requestKey;
  const data = busy ? null : result.data;
  const failed = !busy && result.failed;

  useFocusEffect(useCallback(() => {
    if (!allowed) return;
    const abort = new AbortController();
    let active = true;
    void controller.agenda(agendaQuerySchema.parse({ start, end, domain, page, include_recorded: recorded, ...(farm ? { farm: farm.id } : {}) }), abort.signal)
      .then(res => { if (active) setResult({ key: requestKey, data: res, failed: false }); })
      .catch(() => { if (active) setResult({ key: requestKey, data: null, failed: true }); });
    return () => { active = false; abort.abort(); };
  }, [controller, allowed, start, end, domain, page, recorded, requestKey, farm]));

  // Conjunto de datas com eventos para desenhar os pontos indicadores
  const eventDates = useMemo(() => new Set((data?.results ?? []).map(item => item.date)), [data]);

  // Dias da semana traduzidos (Seg, Ter, Qua, Qui, Sex, Sáb, Dom)
  const weekdays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(2026, 0, 5 + i, 12);
      return new Intl.DateTimeFormat(language, { weekday: 'short' }).format(d).slice(0, 3);
    });
  }, [language]);

  // Células da grade do mês
  const monthCells = useMemo(() => {
    const [y = 2026, m = 1] = currentDate.split('-').map(Number);
    const firstDate = new Date(y, m - 1, 1, 12);
    const lastDate = new Date(y, m, 0, 12);
    const totalDays = lastDate.getDate();
    const firstWeekday = (firstDate.getDay() + 6) % 7;
    const prevMonthLastDate = new Date(y, m - 1, 0, 12).getDate();

    const cells: { date: string; day: number; outside: boolean }[] = [];

    // Dias do mês anterior para completar a primeira semana
    for (let i = firstWeekday - 1; i >= 0; i--) {
      const d = prevMonthLastDate - i;
      const prev = new Date(y, m - 2, d, 12);
      cells.push({
        date: `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d,
        outside: true,
      });
    }

    // Dias do mês atual
    for (let d = 1; d <= totalDays; d++) {
      cells.push({
        date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d,
        outside: false,
      });
    }

    // Dias do próximo mês para fechar linhas de 7
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const next = new Date(y, m, d, 12);
      cells.push({
        date: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d,
        outside: true,
      });
    }

    return cells;
  }, [currentDate]);

  // Células da semana atual
  const weekCells = useMemo(() => {
    const d = new Date(`${currentDate}T12:00:00`);
    const weekday = (d.getDay() + 6) % 7;
    const monday = new Date(d);
    monday.setDate(monday.getDate() - weekday);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday);
      day.setDate(day.getDate() + i);
      const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      return { date: dateStr, day: day.getDate(), outside: false };
    });
  }, [currentDate]);

  // Navegar períodos
  const movePeriod = (direction: -1 | 1) => {
    if (viewMode === 'week') {
      setCurrentDate(shiftDay(currentDate, direction * 7));
    } else {
      setCurrentDate(shiftMonth(currentDate, direction));
    }
    setPage(1);
  };

  const selectDate = (newDate: string) => {
    setCurrentDate(newDate);
    setPage(1);
  };

  const periodTitle = useMemo(() => {
    const d = new Date(`${currentDate}T12:00:00`);
    if (viewMode === 'week') {
      const startD = new Date(`${start}T12:00:00`);
      const endD = new Date(`${end}T12:00:00`);
      const fmt = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' });
      return `${fmt.format(startD)} – ${fmt.format(endD)}`;
    }
    return new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric' }).format(d);
  }, [currentDate, viewMode, start, end, language]);

  const formatDate = (day: string) => new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${day}T12:00:00`));

  // Eventos filtrados para a listagem
  const displayedEvents = useMemo(() => {
    const all = data?.results ?? [];
    if (viewMode === 'list') return all;
    return all.filter(e => e.date === currentDate);
  }, [data, viewMode, currentDate]);

  return (
    <WorkspaceShell active="agenda" title={t.title}>
      {!allowed ? (
        <View style={s.state}><Text>{t.unavailable}</Text></View>
      ) : (
        <FlatList
          key={`${start}:${end}:${domain}:${page}:${recorded}:${viewMode}:${currentDate}`}
          data={displayedEvents}
          keyExtractor={item => item.id}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={{ gap: 12 }}>
              {/* Contexto da Fazenda e Botão de Criar Atividade lado a lado */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <FarmContextButton style={{ flex: 1 }} />
                {state.status === 'signedIn' && taskWriteAccess(state.session.user) === 'full' && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={taskFormMessages[language].create}
                    style={[s.createButton, { flex: 1 }]}
                    onPress={() => router.push({ pathname: '/agenda/task-form', params: { date: currentDate } })}
                  >
                    <Text style={s.createButtonText}>+ {taskFormMessages[language].create}</Text>
                  </Pressable>
                )}
              </View>
              {state.status === 'signedIn' && state.session.user.access.read_only && <Text style={s.badge}>{t.readonly}</Text>}

              {/* Card do Calendário Interativo */}
              <View style={s.calendarCard}>
                {/* Cabeçalho do Calendário: < Novembro 2026 > e Botão Hoje */}
                <View style={s.calendarHeader}>
                  <Pressable accessibilityRole="button" accessibilityLabel={t.previous} style={s.navButton} onPress={() => movePeriod(-1)}>
                    <Text style={s.navButtonText}>‹</Text>
                  </Pressable>
                  <Text style={s.calendarPeriod}>{periodTitle}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={t.next} style={s.navButton} onPress={() => movePeriod(1)}>
                    <Text style={s.navButtonText}>›</Text>
                  </Pressable>
                  <AgendaButton label={t.today} onPress={() => selectDate(today)} />
                </View>

                {/* Seletor de visualização: Mês | Semana | Lista */}
                <View style={s.viewTabs}>
                  {(['month', 'week', 'list'] as const).map(mode => (
                    <Pressable
                      key={mode}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: viewMode === mode }}
                      style={[s.viewTab, viewMode === mode && s.viewTabActive]}
                      onPress={() => { setViewMode(mode); setPage(1); }}
                    >
                      <Text style={[s.viewTabText, viewMode === mode && s.viewTabTextActive]}>{t[mode]}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* Grade do Calendário (Mês ou Semana) */}
                {viewMode !== 'list' && (
                  <View style={{ gap: 6, paddingTop: 4 }}>
                    {/* Cabeçalho dos dias da semana */}
                    <View style={s.weekdayRow}>
                      {weekdays.map((name, idx) => (
                        <Text key={idx} style={s.weekdayText}>{name}</Text>
                      ))}
                    </View>

                    {/* Células dos dias */}
                    <View style={s.calendarGrid}>
                      {(viewMode === 'month' ? monthCells : weekCells).map(cell => {
                        const isSelected = cell.date === currentDate;
                        const isToday = cell.date === today;
                        const hasEvent = eventDates.has(cell.date);

                        return (
                          <Pressable
                            key={cell.date}
                            accessibilityRole="button"
                            accessibilityLabel={formatDate(cell.date)}
                            style={[s.dayCell, cell.outside && s.dayOutside]}
                            onPress={() => selectDate(cell.date)}
                          >
                            <View style={[s.dayCircle, isToday && s.dayToday, isSelected && s.daySelected]}>
                              <Text style={[s.dayNumber, isSelected && s.daySelectedText]}>
                                {cell.day}
                              </Text>
                            </View>
                            {hasEvent && <View style={[s.dayDot, isSelected && s.dayDotSelected]} />}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>

              {/* Filtros em formato de Chips Horizontais */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={s.chipContent}>
                {(['all', 'tasks', 'livestock', 'crops', 'holidays'] as const).map(value => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    style={[s.chip, domain === value && s.chipSelected]}
                    onPress={() => { setDomain(value); setPage(1); }}
                  >
                    <Text style={[s.chipText, domain === value && s.chipTextSelected]}>{t[value]}</Text>
                  </Pressable>
                ))}
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: recorded }}
                  style={[s.chip, recorded && s.chipSelected]}
                  onPress={() => { setRecorded(!recorded); setPage(1); }}
                >
                  <Text style={[s.chipText, recorded && s.chipTextSelected]}>
                    {recorded ? `✓ ${t.recorded}` : t.recorded}
                  </Text>
                </Pressable>
                <Pressable accessibilityRole="button" style={s.chip} onPress={() => setReload(v => v + 1)}>
                  <Text style={s.chipText}>↻ {t.refresh}</Text>
                </Pressable>
              </ScrollView>

              {/* Cabeçalho da Lista de Atividades do Dia/Período */}
              <View style={s.daySummaryHeader}>
                <Text style={s.daySummaryTitle}>
                  {viewMode === 'list' ? `${t.title} (${data?.count ?? 0})` : `${formatDate(currentDate)}`}
                </Text>
                {viewMode !== 'list' && (
                  <Text style={s.daySummaryCount}>
                    {displayedEvents.length} {displayedEvents.length === 1 ? 'atividade' : 'atividades'}
                  </Text>
                )}
              </View>

              {busy && <Busy label={t.loading} />}
              {failed && (
                <View style={s.card}>
                  <Text accessibilityRole="alert" style={s.error}>{t.error}</Text>
                  <AgendaButton label={t.retry} onPress={() => setReload(v => v + 1)} />
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            !busy && !failed ? (
              <View style={[s.card, { alignItems: 'center', paddingVertical: 24 }]}>
                <Text style={s.body}>{t.empty}</Text>
              </View>
            ) : undefined
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({
                pathname: '/agenda/[id]',
                params: { id: item.id, start, end, domain, page: String(page), recorded: recorded ? '1' : '0', farm: farm?.id },
              })}
              style={s.card}
            >
              <Text style={s.muted}>{formatDate(item.date)} · {item.farm_name}</Text>
              <Text style={s.title}>{item.title}</Text>
              <View style={s.row}>
                <Text style={s.badge}>{agendaLabel(t, item.status)}</Text>
                {item.estimated && <Text style={s.muted}>· {t.estimated}</Text>}
              </View>
            </Pressable>
          )}
          ListFooterComponent={
            data && !busy && (data.previous || data.next) ? (
              <View style={[s.row, { justifyContent: 'center', alignItems: 'center', gap: 16, paddingVertical: 12 }]}>
                <AgendaButton
                  label="‹"
                  accessibilityLabel={t.prevPage}
                  disabled={!data.previous}
                  style={{ width: 44, minWidth: 44, height: 44, borderRadius: 22, paddingHorizontal: 0 }}
                  onPress={() => setPage(v => Math.max(1, v - 1))}
                />
                <Text style={[s.muted, { fontWeight: '700', fontSize: 14 }]}>
                  {t.page} {page}
                </Text>
                <AgendaButton
                  label="›"
                  accessibilityLabel={t.more}
                  disabled={!data.next}
                  style={{ width: 44, minWidth: 44, height: 44, borderRadius: 22, paddingHorizontal: 0 }}
                  onPress={() => setPage(v => Math.max(1, v + 1))}
                />
              </View>
            ) : undefined
          }
        />
      )}
    </WorkspaceShell>
  );
}
