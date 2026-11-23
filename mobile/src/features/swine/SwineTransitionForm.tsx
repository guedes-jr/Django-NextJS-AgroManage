import { isAxiosError } from 'axios';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { SwineTransitionUnconfirmed } from '../../services/authApi';
import { AgendaButton, Busy, styles } from '../agenda/ui';
import { useAuth } from '../auth/AuthProvider';
import { workspaceMessages } from '../workspace/messages';
import { moneyText } from '../inventory/launchContracts';
import { canWriteSwine } from './contracts';
import { swineMessages, swineStatusLabel } from './messages';
import { lossReasons, swineSaleAmount, swineTransitionInput, swineTransitionReceipt, type SwineTransitionInput, type SwineTransitionKind } from './transitions';

const pt = {
  sale: 'Registrar venda', buyer: 'Comprador', price: 'Preço por kg (R$)', saleWeight: 'Peso total (kg)', due: 'Vencimento (AAAA-MM-DD)', receivable: 'Título a receber', saleCloses: 'A venda encerra o lote.',
  loss: 'Registrar perda gestacional', weaning: 'Registrar desmame', partial: 'Parcial', full: 'Total', nurseryCode: 'Código do lote de creche (opcional)', nextWeaning: 'Registrar outro desmame', maternityBalance: 'Saldo na maternidade', transfer: 'Transferir lote de fase',
  close: 'Encerrar saldo do lote', closeReason: 'Motivo (opcional)', closeEffect: 'O saldo será zerado e a fase será encerrada.',
  mortality: 'Registrar mortalidade', cause: 'Causa', remaining: 'Saldo do lote', closes: 'O lote será encerrado por mortalidade.',
  reasons: { ABORTO: 'Aborto', RETORNO_CIO: 'Retorno ao cio', REABSORCAO: 'Reabsorção' },
  date: 'Data (AAAA-MM-DD)', weight: 'Peso médio ao desmame (kg, opcional)',
  review: 'Revisar', confirm: 'Confirmar', edit: 'Editar', saved: 'Registro confirmado',
  invalid: 'Confira a data e os campos informados.', changed: 'O registro mudou. Atualize os dados antes de continuar.',
  unknown: 'O resultado ainda é desconhecido. Reenvie os mesmos dados para conferir o registro.',
  moves: 'Leitões que irão para a creche', empty: 'A gestação será encerrada.',
};
const messages = {
  'pt-BR': pt,
  'pt-PT': pt,
  en: {
    sale: 'Record sale', buyer: 'Buyer', price: 'Price per kg (BRL)', saleWeight: 'Total weight (kg)', due: 'Due date (YYYY-MM-DD)', receivable: 'Accounts receivable', saleCloses: 'The sale closes the batch.',
    loss: 'Record pregnancy loss', weaning: 'Record weaning', partial: 'Partial', full: 'Full', nurseryCode: 'Nursery batch code (optional)', nextWeaning: 'Record another weaning', maternityBalance: 'Remaining in maternity', transfer: 'Move batch to the next phase',
    close: 'Close batch balance', closeReason: 'Reason (optional)', closeEffect: 'The balance will be set to zero and the phase closed.',
    mortality: 'Record mortality', cause: 'Cause', remaining: 'Remaining in batch', closes: 'The batch will be closed due to mortality.',
    reasons: { ABORTO: 'Abortion', RETORNO_CIO: 'Return to estrus', REABSORCAO: 'Resorption' },
    date: 'Date (YYYY-MM-DD)', weight: 'Average weaning weight (kg, optional)',
    review: 'Review', confirm: 'Confirm', edit: 'Edit', saved: 'Record confirmed',
    invalid: 'Check the date and the information entered.', changed: 'The record changed. Refresh before continuing.',
    unknown: 'The result is still unknown. Send the same details again to check the record.',
    moves: 'Piglets moving to the nursery', empty: 'The pregnancy will be closed.',
  },
  es: {
    sale: 'Registrar venta', buyer: 'Comprador', price: 'Precio por kg (BRL)', saleWeight: 'Peso total (kg)', due: 'Vencimiento (AAAA-MM-DD)', receivable: 'Cuenta por cobrar', saleCloses: 'La venta cierra el lote.',
    loss: 'Registrar pérdida gestacional', weaning: 'Registrar destete', partial: 'Parcial', full: 'Total', nurseryCode: 'Código del lote de recría (opcional)', nextWeaning: 'Registrar otro destete', maternityBalance: 'Saldo en maternidad', transfer: 'Transferir lote de fase',
    close: 'Cerrar saldo del lote', closeReason: 'Motivo (opcional)', closeEffect: 'El saldo quedará en cero y se cerrará la fase.',
    mortality: 'Registrar mortalidad', cause: 'Causa', remaining: 'Saldo del lote', closes: 'El lote se cerrará por mortalidad.',
    reasons: { ABORTO: 'Aborto', RETORNO_CIO: 'Retorno al celo', REABSORCAO: 'Reabsorción' },
    date: 'Fecha (AAAA-MM-DD)', weight: 'Peso medio al destete (kg, opcional)',
    review: 'Revisar', confirm: 'Confirmar', edit: 'Editar', saved: 'Registro confirmado',
    invalid: 'Revise la fecha y los datos ingresados.', changed: 'El registro cambió. Actualice los datos antes de continuar.',
    unknown: 'El resultado aún se desconoce. Vuelva a enviar los mismos datos para comprobar el registro.',
    moves: 'Lechones que pasarán a la recría', empty: 'Se cerrará la gestación.',
  },
};

export function SwineTransitionForm({ id, kind, eligible }: { id: string; kind: SwineTransitionKind; eligible: boolean }) {
  const { state, controller, language } = useAuth();
  const copy = messages[language];
  const swine = swineMessages[language];
  const workspace = workspaceMessages[language];
  const client = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<string>();
  const [weight, setWeight] = useState('');
  const [quantity, setQuantity] = useState('');
  const [partial, setPartial] = useState(false);
  const [batchCode, setBatchCode] = useState('');
  const [cause, setCause] = useState('');
  const [price, setPrice] = useState('');
  const [due, setDue] = useState<string>();
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState<z.infer<typeof lossReasons>>();
  const [command, setCommand] = useState<SwineTransitionInput>();
  const [receipt, setReceipt] = useState<z.infer<typeof swineTransitionReceipt>>();
  const [saving, setSaving] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const role = state.status === 'signedIn' ? state.session.user.access.role : null;
  const allowed = state.status === 'signedIn' && canWriteSwine(state.session.user)
    && ((kind !== 'transfer' && kind !== 'close') || role === 'admin' || role === 'manager')
    && (kind !== 'sale' || ((role === 'admin' || role === 'manager') && state.session.user.access.can_view_financial));
  const session = state.status === 'signedIn' ? `${state.session.organization.id}:${state.session.user.id}` : 'signed-out';
  const options = useQuery({
    queryKey: ['swine-transition', session, kind, id],
    enabled: allowed && open && eligible && !command && !receipt,
    retry: false,
    queryFn: ({ signal }) => controller.swineTransitionOptions(kind, id, signal),
  });

  if (!allowed) return null;
  if (receipt) {
    const batch = kind === 'mortality' || kind === 'sale' || kind === 'close' ? null : receipt.batch;
    return <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>{copy.saved}</Text>
      <Text style={styles.body}>{receipt.date} · {receipt.reason ? copy.reasons[receipt.reason] : `${swine.quantity}: ${receipt.quantity}`}</Text>
      {receipt.remaining != null ? <Text style={styles.body}>{kind === 'weaning' ? copy.maternityBalance : copy.remaining}: {receipt.remaining}</Text> : null}
      {receipt.status ? <Text style={styles.body}>{swineStatusLabel(receipt.status, swine)}</Text> : null}
      {receipt.amount && receipt.reference ? <>
        <Text style={styles.body}>{copy.receivable}: {moneyText(receipt.amount, language)}</Text>
        <Text style={styles.body}>{copy.due}: {receipt.due_date}</Text>
        <Text selectable style={styles.body}>{receipt.reference}</Text>
      </> : null}
      {batch ? <Text style={styles.body}>{swine.phase[receipt.destination ?? 'creche']}</Text> : null}
      {kind === 'weaning' && (receipt.remaining ?? 0) > 0 ? <AgendaButton label={copy.nextWeaning} onPress={() => {
        setReceipt(undefined);
        setCommand(undefined);
        setUnknown(false);
        setQuantity('');
        setBatchCode('');
        void options.refetch();
      }}/> : null}
      {batch ? <AgendaButton label={swine.openRecord} onPress={() => router.replace({
        pathname: '/swine/[phase]/[id]', params: { phase: receipt.destination ?? 'creche', id: batch },
      })}/> : null}
    </View>;
  }
  if (!eligible && !command) return null;
  if (!open) return <AgendaButton label={copy[kind]} onPress={() => setOpen(true)}/>;

  const context = options.data;
  const day = date ?? context?.today ?? '';
  function review() {
    if (!context) return;
    const common = { request_key: randomUUID(), expected_farm: context.farm, version: context.version, date: day };
    const batch = { ...common, quantity: context.quantity, weight: weight.trim() || null };
    const count = /^\d+$/.test(quantity) ? Number(quantity) : NaN;
    const result = swineTransitionInput.safeParse(
      kind === 'loss' ? { ...common, kind, reason, notes } :
        kind === 'weaning' ? { ...batch, kind, weaning_type: partial ? 'parcial' : 'total', batch_code: partial ? batchCode : '', quantity: partial ? count : context.quantity } :
        kind === 'mortality' ? { ...common, kind, cause, notes, quantity: count } :
          kind === 'close' ? { ...common, kind, quantity: context.quantity, reason: notes } :
          kind === 'sale' ? { ...common, kind, buyer: cause, notes, quantity: count, weight_kg: weight, price_per_kg: price, due_date: due ?? day } :
          { ...batch, kind, destination: context.destination },
    );
    if (!result.success || day < context.since || day > context.today ||
        ((result.data.kind === 'mortality' || result.data.kind === 'sale') && result.data.quantity > (context.quantity ?? 0)) ||
        (result.data.kind === 'weaning' && partial && result.data.quantity >= (context.quantity ?? 0)) ||
        (result.data.kind === 'sale' && (result.data.due_date < day || !swineSaleAmount(result.data.weight_kg, result.data.price_per_kg)))) {
      setError(copy.invalid);
      return;
    }
    setError('');
    setCommand(result.data);
  }

  async function save() {
    if (!command || locked.current) return;
    locked.current = true;
    setSaving(true);
    setError('');
    try {
      setReceipt(await controller.recordSwineTransition(id, command));
      for (const key of ['swine-phase-page', 'swine-phase-summary', 'swine-batch-history', 'swine-sales']) {
        void client.invalidateQueries({ queryKey: [key, session] });
      }
      // The former phase no longer resolves the batch. Keep the receipt visible
      // while the user is still on that route.
      void client.invalidateQueries({
        queryKey: ['swine-record-detail', session],
        refetchType: kind === 'transfer' ? 'none' : 'active',
      });
    } catch (caught) {
      if (caught instanceof SwineTransitionUnconfirmed) {
        setUnknown(true);
        setError(copy.unknown);
      } else if (isAxiosError(caught) && caught.response?.status === 409) {
        setUnknown(false);
        setCommand(undefined);
        setError(copy.changed);
        void options.refetch();
      } else {
        setError(unknown ? copy.unknown : swine.error);
      }
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }

  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.title}>{copy[kind]}</Text>
    {context ? <Text style={styles.body}>{context.animal} · {context.farm_name}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {context?.source && context.destination ? <Text style={styles.body}>{swine.phase[context.source]} → {swine.phase[context.destination]}</Text> : null}
    {command ? <>
      <Text style={styles.body}>{command.date} · {command.kind === 'loss' ? copy.reasons[command.reason] : `${command.kind === 'weaning' ? copy.moves : swine.quantity}: ${command.quantity}`}</Text>
      {command.kind === 'weaning' ? <>
        <Text style={styles.body}>{command.weaning_type === 'parcial' ? copy.partial : copy.full} · {copy.maternityBalance}: {(context?.quantity ?? 0) - command.quantity}</Text>
        {command.batch_code ? <Text style={styles.body}>{command.batch_code}</Text> : null}
      </> : null}
      {command.kind === 'loss'
        ? <Text style={styles.body}>{copy.empty}{command.notes ? ` ${command.notes}` : ''}</Text>
        : command.kind === 'mortality' ? <>
          <Text style={styles.body}>{copy.cause}: {command.cause}</Text>
          {command.notes ? <Text style={styles.body}>{command.notes}</Text> : null}
          <Text style={styles.body}>{copy.remaining}: {(context?.quantity ?? 0) - command.quantity}</Text>
          {command.quantity === context?.quantity ? <Text style={styles.body}>{copy.closes}</Text> : null}
        </> : command.kind === 'sale' ? <>
          <Text style={styles.body}>{copy.buyer}: {command.buyer}</Text>
          <Text style={styles.body}>{copy.saleWeight}: {command.weight_kg}</Text>
          <Text style={styles.body}>{copy.price}: {moneyText(command.price_per_kg, language)}</Text>
          <Text style={styles.body}>{copy.receivable}: {moneyText(swineSaleAmount(command.weight_kg, command.price_per_kg) ?? '0', language)}</Text>
          <Text style={styles.body}>{copy.due}: {command.due_date}</Text>
          <Text style={styles.body}>{copy.remaining}: {(context?.quantity ?? 0) - command.quantity}</Text>
          {command.quantity === context?.quantity ? <Text style={styles.body}>{copy.saleCloses}</Text> : null}
          {command.notes ? <Text style={styles.body}>{command.notes}</Text> : null}
        </> : command.kind === 'close' ? <>
          <Text style={styles.body}>{copy.closeEffect}</Text>
          {command.reason ? <Text style={styles.body}>{command.reason}</Text> : null}
        </> : command.weight ? <Text style={styles.body}>{swine.weight}: {command.weight} kg</Text> : null}
      <AgendaButton label={unknown ? swine.retry : copy.confirm} variant="primary" busy={saving} disabled={saving} onPress={() => void save()}/>
      {!unknown ? <AgendaButton label={copy.edit} disabled={saving} onPress={() => setCommand(undefined)}/> : null}
    </> : options.isPending ? <Busy label={workspace.loading}/> : options.isError ? <>
      <Text accessibilityRole="alert" style={styles.error}>{isAxiosError(options.error) && options.error.response?.status === 409 ? copy.changed : swine.error}</Text>
      <AgendaButton label={swine.retry} onPress={() => void options.refetch()}/>
    </> : <>
      <Text style={styles.body}>{copy.date}</Text>
      <TextInput accessibilityLabel={copy.date} style={styles.input} value={day} onChangeText={setDate} maxLength={10}/>
      {kind === 'loss' ? <>
        {lossReasons.options.map(value => <AgendaButton key={value} label={copy.reasons[value]} selected={value === reason} onPress={() => setReason(value)}/>)}
        <Text style={styles.body}>{swine.notes}</Text>
        <TextInput accessibilityLabel={swine.notes} style={styles.input} value={notes} onChangeText={setNotes} maxLength={1000} multiline/>
      </> : kind === 'close' ? <>
        <Text style={styles.body}>{copy.remaining}: {context?.quantity}</Text>
        <Text style={styles.body}>{copy.closeReason}</Text>
        <TextInput accessibilityLabel={copy.closeReason} style={styles.input} value={notes} onChangeText={setNotes} maxLength={300} multiline/>
      </> : kind === 'mortality' || kind === 'sale' ? <>
        <Text style={styles.body}>{copy.remaining}: {context?.quantity}</Text>
        <Text style={styles.body}>{swine.quantity}</Text>
        <TextInput accessibilityLabel={swine.quantity} style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" maxLength={10}/>
        <Text style={styles.body}>{kind === 'sale' ? copy.buyer : copy.cause}</Text>
        <TextInput accessibilityLabel={kind === 'sale' ? copy.buyer : copy.cause} style={styles.input} value={cause} onChangeText={setCause} maxLength={kind === 'sale' ? 200 : 150}/>
        {kind === 'sale' ? <>
          <Text style={styles.body}>{copy.saleWeight}</Text>
          <TextInput accessibilityLabel={copy.saleWeight} style={styles.input} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" maxLength={13}/>
          <Text style={styles.body}>{copy.price}</Text>
          <TextInput accessibilityLabel={copy.price} style={styles.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" maxLength={13}/>
          <Text style={styles.body}>{copy.due}</Text>
          <TextInput accessibilityLabel={copy.due} style={styles.input} value={due ?? day} onChangeText={setDue} maxLength={10}/>
        </> : null}
        <Text style={styles.body}>{swine.notes}</Text>
        <TextInput accessibilityLabel={swine.notes} style={styles.input} value={notes} onChangeText={setNotes} maxLength={1000} multiline/>
      </> : <>
        {kind === 'weaning' ? <>
          <View style={styles.row}>
            <AgendaButton label={copy.full} selected={!partial} onPress={() => setPartial(false)}/>
            <AgendaButton label={copy.partial} selected={partial} disabled={(context?.quantity ?? 0) < 2} onPress={() => setPartial(true)}/>
          </View>
          {partial ? <>
            <Text style={styles.body}>{swine.quantity}</Text>
            <TextInput accessibilityLabel={swine.quantity} style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" maxLength={9}/>
            <Text style={styles.body}>{copy.nurseryCode}</Text>
            <TextInput accessibilityLabel={copy.nurseryCode} style={styles.input} value={batchCode} onChangeText={setBatchCode} maxLength={50}/>
          </> : null}
        </> : null}
        <Text style={styles.body}>{kind === 'weaning' ? copy.maternityBalance : swine.quantity}: {context?.quantity}</Text>
        <Text style={styles.body}>{kind === 'weaning' ? copy.weight : swine.weight}</Text>
        <TextInput accessibilityLabel={kind === 'weaning' ? copy.weight : swine.weight} style={styles.input} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" maxLength={9}/>
      </>}
      <AgendaButton label={copy.review} variant="primary" disabled={options.isFetching} onPress={review}/>
    </>}
  </View>;
}
