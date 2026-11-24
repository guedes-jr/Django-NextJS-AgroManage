import { isAxiosError } from 'axios';
import { randomUUID } from 'expo-crypto';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, RefreshControl, Text, TextInput, View } from 'react-native';
import { colors } from '../../theme/tokens';
import { HomeIcon } from '../home/HomeIcon';
import { ActionGroup, ActionRow, BottomSheet, EmptyState, ErrorState, FilterChips, HeaderAction, IconTile, KpiStrip, ListRow, Notice, ScreenIntro, SearchBar, SkeletonList, mobileStyles as ms } from '../../components/mobile';
import { z } from 'zod';
import { AgendaButton, FormField, styles as s } from '../agenda/ui';
import { AgendaShell } from '../workspace/AppShell';
import { useAuth } from '../auth/AuthProvider';
import { moneyText } from '../inventory/launchContracts';
import { canUseVeterinary, vetClientCommand, vetHerdPurposes, vetSettlementTotal, veterinaryMonthSchema, type VetClient, type VetClientCommand, type VetSettlementCommand } from './contracts';
import { veterinaryMessages } from './messages';

const pt = {
  linkedFarm: 'Fazenda vinculada', none: 'Sem vínculo', purpose: 'Finalidade do rebanho',
  purposes: { unknown: 'Não informada', beef: 'Corte', dairy: 'Leite', dual: 'Dupla aptidão' },
  remove: 'Excluir cliente', confirmRemove: 'Confirme a exclusão de {name}.',
  removed: 'Cliente excluído.', removeBlocked: 'O cliente tem atendimentos e não pode ser excluído.',
  removeUnknown: 'Resultado incerto. Confira o diretório antes de tentar novamente.',

  add: 'Cadastrar cliente', edit: 'Editar cliente', name: 'Nome', farm: 'Fazenda', phone: 'Telefone',
  save: 'Salvar', cancel: 'Cancelar', review: 'Revisar baixa', confirm: 'Marcar cobranças como pagas',
  changed: 'Os dados mudaram. Atualize e revise novamente.', unknown: 'Resultado incerto. Repita a confirmação com os mesmos dados.',
  saved: 'Cliente salvo.', settled: 'Cobranças marcadas como pagas.', charges: 'Atendimentos na baixa',

  clients: 'Clientes', billing: 'Cobrança', search: 'Buscar por cliente ou fazenda', empty: 'Nenhum cliente encontrado.',
  month: 'Mês (AAAA-MM)', apply: 'Consultar', invalid: 'Informe um mês válido.', received: 'Recebido',
  pending: 'A receber', total: 'Total', paid: 'Pago', awaiting: 'Pendente', noProcedures: 'Nenhum atendimento no mês.',
};
export const accountsCopy = {
  'pt-BR': pt, 'pt-PT': pt,
  en: {
    linkedFarm: 'Linked farm', none: 'Unlinked', purpose: 'Herd purpose',
    purposes: { unknown: 'Unspecified', beef: 'Beef', dairy: 'Dairy', dual: 'Dual purpose' },
    remove: 'Delete client', confirmRemove: 'Confirm deletion of {name}.',
    removed: 'Client deleted.', removeBlocked: 'The client has visits and cannot be deleted.',
    removeUnknown: 'Unconfirmed result. Check the directory before trying again.',

    add: 'Add client', edit: 'Edit client', name: 'Name', farm: 'Farm', phone: 'Phone',
    save: 'Save', cancel: 'Cancel', review: 'Review payment', confirm: 'Mark charges as paid',
    changed: 'The data changed. Refresh and review again.', unknown: 'Unconfirmed result. Retry with the same details.',
    saved: 'Client saved.', settled: 'Charges marked as paid.', charges: 'Visits in this payment',

    clients: 'Clients', billing: 'Billing', search: 'Search by client or farm', empty: 'No clients found.',
    month: 'Month (YYYY-MM)', apply: 'Apply', invalid: 'Enter a valid month.', received: 'Received',
    pending: 'Receivable', total: 'Total', paid: 'Paid', awaiting: 'Pending', noProcedures: 'No visits this month.',
  },
  es: {
    linkedFarm: 'Finca vinculada', none: 'Sin vínculo', purpose: 'Finalidad del rebaño',
    purposes: { unknown: 'Sin especificar', beef: 'Carne', dairy: 'Leche', dual: 'Doble propósito' },
    remove: 'Eliminar cliente', confirmRemove: 'Confirme la eliminación de {name}.',
    removed: 'Cliente eliminado.', removeBlocked: 'El cliente tiene atenciones y no se puede eliminar.',
    removeUnknown: 'Resultado incierto. Consulte el directorio antes de volver a intentarlo.',

    add: 'Registrar cliente', edit: 'Editar cliente', name: 'Nombre', farm: 'Finca', phone: 'Teléfono',
    save: 'Guardar', cancel: 'Cancelar', review: 'Revisar pago', confirm: 'Marcar cobros como pagados',
    changed: 'Los datos cambiaron. Actualice y revise de nuevo.', unknown: 'Resultado incierto. Reintente con los mismos datos.',
    saved: 'Cliente guardado.', settled: 'Cobros marcados como pagados.', charges: 'Atenciones incluidas',

    clients: 'Clientes', billing: 'Cobros', search: 'Buscar por cliente o finca', empty: 'No se encontraron clientes.',
    month: 'Mes (AAAA-MM)', apply: 'Consultar', invalid: 'Indique un mes válido.', received: 'Recibido',
    pending: 'Por cobrar', total: 'Total', paid: 'Pagado', awaiting: 'Pendiente', noProcedures: 'No hay atenciones en el mes.',
  },
};

export function VeterinaryClientsScreen() {
  const { state, controller, language } = useAuth();
  const router = useRouter();
  const t = veterinaryMessages[language];
  const copy = accountsCopy[language];
  const [search, setSearch] = useState('');
  const [actions, setActions] = useState<VetClient>();
  const cache = useQueryClient();
  const [editor, setEditor] = useState<VetClientCommand>();
  const [toDelete, setToDelete] = useState<VetClient>();
  const [sending, setSending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState('');
  const locked = useRef(false);
  const list = useRef<FlatList<VetClient>>(null);
  const allowed = state.status === 'signedIn' && canUseVeterinary(state.session.user);
  const key = state.status === 'signedIn' ? `${state.session.organization.id}:${state.session.user.id}` : 'signed-out';
  const clients = useQuery({
    queryKey: ['vet-client-directory', key], enabled: allowed,
    queryFn: ({ signal }) => controller.vetClients(signal),
  });
  const farms = useQuery({
    queryKey: ['vet-client-farms', key], enabled: allowed && !!editor,
    queryFn: ({ signal }) => controller.vetFarms(signal),
  });

  function refreshClients() {
    for (const key of ['vet-client-directory', 'vet-clients', 'vet-billing', 'vet-animals', 'vet-report-clients', 'vet-report']) {
      void cache.invalidateQueries({ queryKey: [key] });
    }
  }

  async function removeClient() {
    if (!toDelete || locked.current) return;
    locked.current = true;
    setSending(true);
    setMessage('');
    try {
      await controller.vetDeleteClient(toDelete.id);
      setMessage(copy.removed);
    } catch (error) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      setMessage(status === 400 ? copy.removeBlocked : !status || status >= 500 || status === 408 ? copy.removeUnknown : t.error);
    } finally {
      refreshClients();
      setToDelete(undefined);
      locked.current = false;
      setSending(false);
    }
  }

  const query = search.trim().toLocaleLowerCase(language);
  const rows = (clients.data ?? []).filter(row => `${row.name} ${row.farm_name}`.toLocaleLowerCase(language).includes(query));

  function openEditor(client?: VetClient) {
    if (uncertain || locked.current || (client && !client.updated_at)) return;
    setMessage('');
    list.current?.scrollToOffset({ offset: 0, animated: true });
    setEditor({
      id: client?.id ?? randomUUID(), version: client?.updated_at ?? null,
      name: client?.name ?? '', farm_name: client?.farm_name ?? '', phone: client?.phone ?? '',
      farm: client?.farm ?? null, herd_purpose: client?.herd_purpose ?? 'unknown',
    });
  }

  async function saveClient() {
    if (locked.current) return;
    const command = vetClientCommand.safeParse(editor);
    if (!command.success) {
      setMessage(t.error);
      return;
    }
    locked.current = true;
    setSending(true);
    setMessage('');
    try {
      await controller.vetSaveClient(command.data);
      setEditor(undefined);
      setUncertain(false);
      setMessage(copy.saved);
      refreshClients();
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 409) {
        setUncertain(false);
        setEditor(undefined);
        setMessage(copy.changed);
        void clients.refetch();
      } else {
        setUncertain(wasUncertain => wasUncertain || !isAxiosError(error) || !error.response || error.response.status >= 500 || error.response.status === 408);
        setMessage(t.error);
      }
    } finally {
      locked.current = false;
      setSending(false);
    }
  }

  return <AgendaShell title={copy.clients} backLabel={t.back} onBack={() => router.canGoBack() ? router.back() : router.replace('/veterinary')}>
    {!allowed ? <View style={ms.list}><EmptyState title={t.noAccess}/></View> : <FlatList ref={list} data={rows} keyExtractor={row => row.id}
      contentContainerStyle={ms.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void clients.refetch()} tintColor={colors.primary} colors={[colors.primary]}/>}
      ListHeaderComponent={<View style={ms.header}>
        <ScreenIntro title={copy.clients} action={!editor && !toDelete ? <HeaderAction label={copy.add} onPress={() => openEditor()}/> : undefined}/>
        <SearchBar value={search} onChange={setSearch} placeholder={copy.search} language={language} debounce={150}/>
        {clients.isError ? <ErrorState message={t.error} language={language} onRetry={() => void clients.refetch()}/> : null}
        {message ? <Notice tone={uncertain ? 'warning' : 'info'} text={uncertain ? copy.unknown : message}/> : null}
        {toDelete ? <View style={{ gap: 8 }}>
          <Notice tone="danger" text={copy.confirmRemove.replace('{name}', toDelete.name)}/>
          <AgendaButton variant="primary" label={copy.remove} busy={sending} disabled={sending} onPress={() => void removeClient()}/>
          <AgendaButton label={copy.cancel} disabled={sending} onPress={() => setToDelete(undefined)}/>
        </View> : editor ? <View style={{ gap: 10, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface }}>
          <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '800', color: colors.forest }}>{editor.version ? copy.edit : copy.add}</Text>
          {([['name', copy.name, 150], ['farm_name', copy.farm, 150], ['phone', copy.phone, 40]] as const).map(([field, label, limit]) => <FormField key={field} label={label}>
            <TextInput style={s.fieldControl} accessibilityLabel={label} value={editor[field]} maxLength={limit}
              editable={!sending && !uncertain} keyboardType={field === 'phone' ? 'phone-pad' : 'default'}
              onChangeText={value => setEditor({ ...editor, [field]: value })}/>
          </FormField>)}
          <Text style={s.label}>{copy.linkedFarm}</Text>
          {farms.isPending ? <SkeletonList rows={1}/> : null}
          {farms.isError ? <ErrorState message={t.error} language={language} onRetry={() => void farms.refetch()}/> : null}
          <FilterChips value={editor.farm ?? ''} onChange={value => { if (!sending && !uncertain) setEditor({ ...editor, farm: value || null }); }} options={[{ value: '', label: copy.none }, ...(farms.data ?? []).map(farm => ({ value: farm.id, label: farm.name }))]}/>
          <Text style={s.label}>{copy.purpose}</Text>
          <FilterChips value={editor.herd_purpose} onChange={purpose => { if (!sending && !uncertain) setEditor({ ...editor, herd_purpose: purpose }); }} options={vetHerdPurposes.options.map(purpose => ({ value: purpose, label: copy.purposes[purpose] }))}/>
          <AgendaButton label={uncertain ? t.retry : copy.save} busy={sending} disabled={sending} variant="primary" onPress={() => void saveClient()}/>
          {!uncertain ? <AgendaButton label={copy.cancel} disabled={sending} onPress={() => setEditor(undefined)}/> : null}
        </View> : null}
      </View>}
      ListEmptyComponent={clients.isPending ? <SkeletonList/> : clients.isSuccess ? <EmptyState title={copy.empty}/> : undefined}
      renderItem={({ item }) => <ListRow meta={item.farm_name || undefined} title={item.name} subtitle={item.phone || undefined} leading={<IconTile tone="brand"><HomeIcon name="group" size={20} color={colors.primary}/></IconTile>} disabled={!!editor || !!toDelete} onPress={() => setActions(item)}/>}
    />}
    <BottomSheet visible={!!actions} title={actions?.name ?? ''} onClose={() => setActions(undefined)} language={language}>{actions ? <ActionGroup>
      <ActionRow label={t.launch.start} icon={<HomeIcon name="plus" size={20} color={colors.primary}/>} onPress={() => { const target = actions; setActions(undefined); router.push({ pathname: '/veterinary/launch', params: { client: target.id } }); }}/>
      <ActionRow label={copy.billing} icon={<HomeIcon name="wallet" size={20} color={colors.primary}/>} onPress={() => { const target = actions; setActions(undefined); router.push({ pathname: '/veterinary/billing', params: { client: target.id } }); }}/>
      <ActionRow label={copy.edit} disabled={!actions.updated_at} icon={<HomeIcon name="group" size={20} color={colors.primary}/>} onPress={() => { const target = actions; setActions(undefined); openEditor(target); }}/>
      <ActionRow label={copy.remove} tone="danger" icon={<HomeIcon name="back" size={20} color={colors.error}/>} onPress={() => { const target = actions; setActions(undefined); setMessage(''); setToDelete(target); list.current?.scrollToOffset({ offset: 0, animated: true }); }}/>
    </ActionGroup> : null}</BottomSheet>
  </AgendaShell>;
}

export function VeterinaryBillingScreen() {
  const { state, controller, language } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const t = veterinaryMessages[language];
  const copy = accountsCopy[language];
  const client = z.uuid().safeParse(params.client).data;
  const [selection, setSelection] = useState(() => veterinaryMonthSchema.safeParse(params.month).data);
  const [payment, setPayment] = useState<VetSettlementCommand>();
  const [sending, setSending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState('');
  const locked = useRef(false);
  const cache = useQueryClient();
  const allowed = state.status === 'signedIn' && canUseVeterinary(state.session.user);
  const key = state.status === 'signedIn' ? `${state.session.organization.id}:${state.session.user.id}` : 'signed-out';
  const workspace = useQuery({
    queryKey: ['vet-billing-workspace', key], enabled: allowed,
    queryFn: ({ signal }) => controller.vetWorkspace(signal),
  });
  const month = selection ?? workspace.data?.today.slice(0, 7);
  const billing = useQuery({
    queryKey: ['vet-billing', key, month, client], enabled: allowed && !!month,
    queryFn: ({ signal }) => controller.vetBilling(month ?? '', client, signal),
  });
  const row = billing.data?.clients.find(value => value.id === client);
  const total = row?.total ?? billing.data?.total;
  const pending = row?.receivable ?? billing.data?.receivable;
  const money = (value: string) => value.startsWith('-') ? `-${moneyText(value.slice(1), language)}` : moneyText(value, language);
  const unpaid = billing.data?.detail?.filter(item => !item.paid) ?? [];
  async function settle() {
    if (!payment || locked.current) return;
    locked.current = true;
    setSending(true);
    setMessage('');
    try {
      await controller.vetSettle(payment);
      setPayment(undefined);
      setUncertain(false);
      setMessage(copy.settled);
      void cache.invalidateQueries({ queryKey: ['vet-billing', key] });
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 409) {
        setPayment(undefined);
        setUncertain(false);
        setMessage(copy.changed);
        void billing.refetch();
      } else {
        setUncertain(wasUncertain => wasUncertain || !isAxiosError(error) || !error.response || error.response.status >= 500 || error.response.status === 408);
        setMessage(t.error);
      }
    } finally {
      locked.current = false;
      setSending(false);
    }
  }

  const shiftMonth = (value: string, delta: number) => { const [y = 2026, m = 1] = value.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + delta, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
  const maxMonth = workspace.data?.today.slice(0, 7);
  const monthLabel = (value: string) => new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-15T12:00:00Z`));
  const header = <View style={ms.header}>
    <ScreenIntro title={row ? row.name : copy.billing} subtitle={copy.month}/>
    {month ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 4, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface }}>
      <AgendaButton label="‹" accessibilityLabel={shiftMonth(month, -1)} disabled={!!payment} style={{ width: 44, paddingHorizontal: 0 }} onPress={() => setSelection(shiftMonth(month, -1))}/>
      <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.forest, textTransform: 'capitalize' }}>{monthLabel(month)}</Text>
      <AgendaButton label="›" accessibilityLabel={shiftMonth(month, 1)} disabled={!!payment || (!!maxMonth && shiftMonth(month, 1) > maxMonth)} style={{ width: 44, paddingHorizontal: 0 }} onPress={() => setSelection(shiftMonth(month, 1))}/>
    </View> : null}
    {workspace.isPending || (!!month && billing.isPending) ? <SkeletonList rows={1}/> : null}
    {billing.isError || (workspace.isError && !month) ? <ErrorState message={t.error} language={language} onRetry={() => void (month ? billing.refetch() : workspace.refetch())}/> : null}
    {billing.data ? <>
      <KpiStrip items={[...(total ? [{ key: 't', label: copy.total, value: money(total) }] : []), ...(pending ? [{ key: 'p', label: copy.pending, value: money(pending), tone: 'warning' as const }] : []), ...(!row ? [{ key: 'r', label: copy.received, value: money(billing.data.received), tone: 'success' as const }] : [])]}/>
      {client && !payment && unpaid.length > 0 && !billing.isFetching ? <AgendaButton variant="primary" label={copy.review} onPress={() => {
        setMessage('');
        setPayment({ client, month: billing.data.month, charges: unpaid.map(({ id, value, updated_at }) => ({ id, value, version: updated_at })) });
      }}/> : null}
      {payment ? <View style={{ gap: 8 }}>
        <Notice tone="info" text={`${copy.charges}: ${payment.charges.length} · ${payment.month} · ${money(vetSettlementTotal(payment.charges))}`}/>
        <AgendaButton label={uncertain ? t.retry : copy.confirm} busy={sending} disabled={sending} variant="primary" onPress={() => void settle()}/>
        {!uncertain ? <AgendaButton label={copy.cancel} disabled={sending} onPress={() => setPayment(undefined)}/> : null}
      </View> : null}
    </> : null}
    {message ? <Notice tone={uncertain ? 'warning' : 'info'} text={uncertain ? copy.unknown : message}/> : null}
  </View>;

  return <AgendaShell title={copy.billing} backLabel={t.back} onBack={() => router.canGoBack() ? router.back() : router.replace('/veterinary')}>
    {!allowed ? <View style={ms.list}><EmptyState title={t.noAccess}/></View> : client
      ? <FlatList data={billing.data?.detail ?? []} keyExtractor={item => item.id} contentContainerStyle={ms.list}
          keyboardShouldPersistTaps="handled" ListHeaderComponent={header}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void billing.refetch()} tintColor={colors.primary} colors={[colors.primary]}/>}
          ListEmptyComponent={billing.isSuccess ? <EmptyState title={copy.noProcedures}/> : undefined}
          renderItem={({ item }) => <ListRow meta={`${item.date} · ${t.kind[item.kind] ?? item.kind}`} title={item.identifier} value={money(item.value)} status={{ label: item.paid ? copy.paid : copy.awaiting, tone: item.paid ? 'success' : 'warning' }}/>}/>
      : <FlatList data={billing.data?.clients ?? []} keyExtractor={item => item.id} contentContainerStyle={ms.list}
          keyboardShouldPersistTaps="handled" ListHeaderComponent={header}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void billing.refetch()} tintColor={colors.primary} colors={[colors.primary]}/>}
          ListEmptyComponent={billing.isSuccess ? <EmptyState title={copy.empty}/> : undefined}
          renderItem={({ item }) => <ListRow meta={item.farm_name || undefined} title={item.name} value={money(item.receivable)} valueCaption={copy.pending} leading={<IconTile tone="brand"><HomeIcon name="wallet" size={20} color={colors.primary}/></IconTile>} onPress={() => router.push({ pathname: '/veterinary/billing', params: { client: item.id, month: billing.data?.month } })}/>}/>}
  </AgendaShell>;
}
