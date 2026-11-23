import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { z } from 'zod';
import { AgendaButton, Busy, styles as s } from '../agenda/ui';
import { useAuth } from '../auth/AuthProvider';
import { workspaceMessages } from '../workspace/messages';
import { productionInputSchema, productionPayload, type Production } from './contracts';
import { feedMessages } from './messages';

const copy = {
  'pt-BR': { edit: 'Editar produção', cancel: 'Cancelar produção', confirm: 'Confirmar estorno de estoque', saved: 'Alteração registrada.', cancelled: 'Cancelada' },
  'pt-PT': { edit: 'Editar produção', cancel: 'Cancelar produção', confirm: 'Confirmar estorno de stock', saved: 'Alteração registada.', cancelled: 'Cancelada' },
  en: { edit: 'Edit production', cancel: 'Cancel production', confirm: 'Confirm stock reversal', saved: 'Change recorded.', cancelled: 'Cancelled' },
  es: { edit: 'Editar producción', cancel: 'Cancelar producción', confirm: 'Confirmar reversión de inventario', saved: 'Cambio registrado.', cancelled: 'Cancelada' },
};

export function FeedProductionActions({ production }: { production: Production }) {
  const { controller, language } = useAuth();
  const t = feedMessages[language];
  const w = workspaceMessages[language];
  const labels = copy[language];
  const cache = useQueryClient();
  const [action, setAction] = useState<'edit' | 'cancel'>();
  const [formula, setFormula] = useState(production.formula);
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: production.timezone,
  }).format(new Date(production.data_producao)));
  const [planned, setPlanned] = useState(production.quantidade_teorica);
  const [actual, setActual] = useState(production.quantidade_real);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const locked = useRef(false);
  const options = useQuery({
    queryKey: ['feed', 'formulas', page, ''], enabled: action === 'edit',
    queryFn: ({ signal }) => controller.feedPage('formulas', page, '', signal),
  });

  async function submit() {
    if (!action || locked.current) return;
    const input = productionInputSchema.safeParse({ formula, quantidade_teorica: planned, quantidade_real: actual });
    if (action === 'edit' && (!input.success || !z.iso.date().safeParse(date).success)) {
      setMessage(w.error);
      setFailed(true);
      return;
    }
    locked.current = true;
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      await controller.correctFeedProduction(production.id, action === 'edit' && input.success ? { ...productionPayload(input.data), date } : undefined);
      setAction(undefined);
      setMessage(labels.saved);
      for (const key of ['feed', 'feed-detail', 'inventory', 'inventory-summary', 'inventory-lots', 'inventory-movements', 'inventory-lot-detail']) {
        void cache.invalidateQueries({ queryKey: [key] });
      }
    } catch (error) {
      const body = isAxiosError(error) ? error.response?.data : undefined;
      const detail = body?.error?.detail ?? body?.detail;
      const details = typeof detail === 'object' && detail ? Object.values(detail).flat() : [detail];
      setMessage(details.find((value): value is string => typeof value === 'string') ?? w.error);
      setFailed(true);
      void cache.invalidateQueries({ queryKey: ['feed-detail', 'producoes', production.id] });
    } finally {
      setBusy(false);
      locked.current = false;
    }
  }

  return <View style={s.card}>
    {message ? <Text accessibilityRole="alert" style={failed ? s.error : s.body}>{message}</Text> : null}
    {production.status === 'cancelada' ? <Text style={s.body}>{labels.cancelled}</Text> : !action ? <View style={s.row}>
      <AgendaButton label={labels.edit} onPress={() => setAction('edit')}/>
      <AgendaButton label={labels.cancel} onPress={() => setAction('cancel')}/>
    </View> : <>
      {action === 'edit' ? <>
        <Text style={s.title}>{t.formulas}</Text>
        <AgendaButton label={production.formula_nome} selected={formula === production.formula} disabled={busy} onPress={() => setFormula(production.formula)}/>
        {options.isPending ? <Busy label={w.loading}/> : null}
        {options.isError ? <AgendaButton label={w.retry} onPress={() => void options.refetch()}/> : null}
        <View style={s.row}>{options.data?.results.map(row => 'nome' in row && row.ativa && row.id !== production.formula
          ? <AgendaButton key={row.id} label={row.nome} selected={formula === row.id} disabled={busy} onPress={() => setFormula(row.id)}/> : null)}</View>
        <View style={s.row}>
          <AgendaButton label={w.previous} disabled={page === 1 || busy} onPress={() => setPage(value => value - 1)}/>
          <AgendaButton label={w.next} disabled={!options.data?.next || busy} onPress={() => setPage(value => value + 1)}/>
        </View>
        <Text style={s.body}>{t.date} (YYYY-MM-DD)</Text>
        <TextInput style={s.input} accessibilityLabel={t.date} value={date} onChangeText={setDate} editable={!busy} maxLength={10}/>
        <Text style={s.body}>{t.planned}</Text>
        <TextInput style={s.input} accessibilityLabel={t.planned} value={planned} onChangeText={setPlanned} keyboardType="decimal-pad" editable={!busy}/>
        <Text style={s.body}>{t.actual}</Text>
        <TextInput style={s.input} accessibilityLabel={t.actual} value={actual} onChangeText={setActual} keyboardType="decimal-pad" editable={!busy}/>
      </> : <Text style={s.body}>{labels.confirm}</Text>}
      <AgendaButton label={action === 'cancel' ? labels.confirm : t.save} busy={busy} disabled={busy} variant="primary" onPress={() => void submit()}/>
      <AgendaButton label={w.back} disabled={busy} onPress={() => setAction(undefined)}/>
    </>}
  </View>;
}
