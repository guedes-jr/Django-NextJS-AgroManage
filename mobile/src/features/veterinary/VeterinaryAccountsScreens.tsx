import { isAxiosError } from 'axios';
import { randomUUID } from 'expo-crypto';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { z } from 'zod';
import { AgendaButton, AgendaShell, Busy, styles as s } from '../agenda/ui';
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
    {!allowed ? <Text style={s.error}>{t.noAccess}</Text> : <FlatList ref={list} data={rows} keyExtractor={row => row.id}
      contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
      ListHeaderComponent={<View style={{ gap: 8 }}>
        <TextInput style={s.input} accessibilityLabel={copy.search} placeholder={copy.search} value={search} onChangeText={setSearch} maxLength={100}/>
        {clients.isPending ? <Busy label={t.loading}/> : null}
        {clients.isError ? <Text accessibilityRole="alert" style={s.error}>{t.error}</Text> : null}
        <AgendaButton label={t.refresh} disabled={clients.isFetching} onPress={() => void clients.refetch()}/>
        {message ? <Text accessibilityRole="alert" style={s.body}>{uncertain ? copy.unknown : message}</Text> : null}
        {toDelete ? <View style={s.card}>
          <Text style={s.title}>{copy.confirmRemove.replace('{name}', toDelete.name)}</Text>
          <AgendaButton label={copy.remove} busy={sending} disabled={sending} onPress={() => void removeClient()}/>
          <AgendaButton label={copy.cancel} disabled={sending} onPress={() => setToDelete(undefined)}/>
        </View> : editor ? <View style={s.card}>
          <Text accessibilityRole="header" style={s.title}>{editor.version ? copy.edit : copy.add}</Text>
          {([['name', copy.name, 150], ['farm_name', copy.farm, 150], ['phone', copy.phone, 40]] as const).map(([field, label, limit]) => <View key={field}>
            <Text style={s.body}>{label}</Text>
            <TextInput style={s.input} accessibilityLabel={label} value={editor[field]} maxLength={limit}
              editable={!sending && !uncertain} keyboardType={field === 'phone' ? 'phone-pad' : 'default'}
              onChangeText={value => setEditor({ ...editor, [field]: value })}/>
          </View>)}
          <Text style={s.body}>{copy.linkedFarm}</Text>
          {farms.isPending ? <Busy label={t.loading}/> : null}
          {farms.isError ? <><Text accessibilityRole="alert" style={s.error}>{t.error}</Text><AgendaButton label={t.retry} onPress={() => void farms.refetch()}/></> : null}
          <View style={s.row}>
            <AgendaButton label={copy.none} disabled={sending || uncertain} selected={editor.farm === null} onPress={() => setEditor({ ...editor, farm: null })}/>
            {farms.data?.map(farm => <AgendaButton key={farm.id} label={farm.name} selected={editor.farm === farm.id}
              disabled={sending || uncertain} onPress={() => setEditor({ ...editor, farm: farm.id })}/>)}
          </View>
          <Text style={s.body}>{copy.purpose}</Text>
          <View style={s.row}>
            {vetHerdPurposes.options.map(purpose => <AgendaButton key={purpose} label={copy.purposes[purpose]}
              disabled={sending || uncertain} selected={editor.herd_purpose === purpose}
              onPress={() => setEditor({ ...editor, herd_purpose: purpose })}/>)}
          </View>
          <AgendaButton label={uncertain ? t.retry : copy.save} busy={sending} disabled={sending} variant="primary" onPress={() => void saveClient()}/>
          {!uncertain ? <AgendaButton label={copy.cancel} disabled={sending} onPress={() => setEditor(undefined)}/> : null}
        </View> : <AgendaButton label={copy.add} onPress={() => openEditor()}/>}

      </View>}
      ListEmptyComponent={clients.isSuccess ? <Text style={s.body}>{copy.empty}</Text> : undefined}
      renderItem={({ item }) => <View style={s.card}>
        <Text style={s.title}>{item.name}</Text>
        {item.farm_name ? <Text style={s.body}>{item.farm_name}</Text> : null}
        {item.phone ? <Text selectable style={s.body}>{item.phone}</Text> : null}
        <View style={s.row}>
          <AgendaButton label={copy.edit} disabled={!!editor || !!toDelete || !item.updated_at} onPress={() => openEditor(item)}/>
          <AgendaButton label={copy.remove} disabled={!!editor || !!toDelete} onPress={() => {
            setMessage('');
            setToDelete(item);
            list.current?.scrollToOffset({ offset: 0, animated: true });
          }}/>
          <AgendaButton label={t.launch.start} onPress={() => router.push({ pathname: '/veterinary/launch', params: { client: item.id } })}/>
          <AgendaButton label={copy.billing} onPress={() => router.push({ pathname: '/veterinary/billing', params: { client: item.id } })}/>
        </View>
      </View>}
    />}
  </AgendaShell>;
}

export function VeterinaryBillingScreen() {
  const { state, controller, language } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const t = veterinaryMessages[language];
  const copy = accountsCopy[language];
  const client = z.uuid().safeParse(params.client).data;
  const [draft, setDraft] = useState<string>();
  const [selection, setSelection] = useState(() => veterinaryMonthSchema.safeParse(params.month).data);
  const [invalid, setInvalid] = useState(false);
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

  const header = <View style={{ gap: 8 }}>
    <Text style={s.body}>{copy.month}</Text>
    <TextInput style={s.input} accessibilityLabel={copy.month} value={draft ?? month ?? ''} onChangeText={setDraft} maxLength={7} editable={!payment}/>
    <AgendaButton label={copy.apply} disabled={!!payment} onPress={() => {
      const next = veterinaryMonthSchema.safeParse((draft ?? month ?? '').trim());
      setInvalid(!next.success);
      if (!next.success) return;
      if (next.data === month) void billing.refetch();
      else setSelection(next.data);
    }}/>
    {invalid ? <Text accessibilityRole="alert" style={s.error}>{copy.invalid}</Text> : null}
    {workspace.isPending || (!!month && billing.isPending) ? <Busy label={t.loading}/> : null}
    {billing.isError || (workspace.isError && !month) ? <>
      <Text accessibilityRole="alert" style={s.error}>{t.error}</Text>
      <AgendaButton label={t.retry} onPress={() => void (month ? billing.refetch() : workspace.refetch())}/>
    </> : null}
    {billing.data ? <View style={s.card}>
      <Text accessibilityRole="header" style={s.title}>{row ? `${row.name} · ${billing.data.month}` : billing.data.month}</Text>
      {total ? <Text style={s.body}>{copy.total}: {money(total)}</Text> : null}
      {pending ? <Text style={s.body}>{copy.pending}: {money(pending)}</Text> : null}
      {!row ? <Text style={s.body}>{copy.received}: {money(billing.data.received)}</Text> : null}
      {client && !payment && unpaid.length > 0 && !billing.isFetching ? <AgendaButton label={copy.review} onPress={() => {
        setMessage('');
        setPayment({ client, month: billing.data.month, charges: unpaid.map(({ id, value, updated_at }) => ({ id, value, version: updated_at })) });
      }}/> : null}
      {payment ? <>
        <Text style={s.body}>{copy.charges}: {payment.charges.length} · {payment.month} · {money(vetSettlementTotal(payment.charges))}</Text>
        <AgendaButton label={uncertain ? t.retry : copy.confirm} busy={sending} disabled={sending} variant="primary" onPress={() => void settle()}/>
        {!uncertain ? <AgendaButton label={copy.cancel} disabled={sending} onPress={() => setPayment(undefined)}/> : null}
      </> : null}
    </View> : null}
    {message ? <Text accessibilityRole="alert" style={s.body}>{uncertain ? copy.unknown : message}</Text> : null}
  </View>;

  return <AgendaShell title={copy.billing} backLabel={t.back} onBack={() => router.canGoBack() ? router.back() : router.replace('/veterinary')}>
    {!allowed ? <Text style={s.error}>{t.noAccess}</Text> : client
      ? <FlatList data={billing.data?.detail ?? []} keyExtractor={item => item.id} contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled" ListHeaderComponent={header}
          ListEmptyComponent={billing.isSuccess ? <Text style={s.body}>{copy.noProcedures}</Text> : undefined}
          renderItem={({ item }) => <View style={s.card}>
            <Text style={s.title}>{item.identifier}</Text>
            <Text style={s.body}>{item.date} · {t.kind[item.kind] ?? item.kind}</Text>
            <Text style={s.body}>{money(item.value)} · {item.paid ? copy.paid : copy.awaiting}</Text>
          </View>}/>
      : <FlatList data={billing.data?.clients ?? []} keyExtractor={item => item.id} contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled" ListHeaderComponent={header}
          ListEmptyComponent={billing.isSuccess ? <Text style={s.body}>{copy.empty}</Text> : undefined}
          renderItem={({ item }) => <View style={s.card}>
            <Text style={s.title}>{item.name}</Text>
            {item.farm_name ? <Text style={s.body}>{item.farm_name}</Text> : null}
            <Text style={s.body}>{copy.pending}: {money(item.receivable)}</Text>
            <AgendaButton label={copy.billing} onPress={() => router.push({
              pathname: '/veterinary/billing', params: { client: item.id, month: billing.data?.month },
            })}/>
          </View>}/>}
  </AgendaShell>;
}
