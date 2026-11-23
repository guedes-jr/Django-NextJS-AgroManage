import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { randomUUID } from 'expo-crypto';
import { useRef, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { AgendaButton, Busy, styles as s } from '../agenda/ui';
import { useAuth } from '../auth/AuthProvider';
import { moneyText } from '../inventory/launchContracts';
import { workspaceMessages } from '../workspace/messages';
import { swineMessages } from './messages';
import { semenSaleAmount, semenSaleCommand, type SemenSaleCommand } from './semenSales';
import { canReadSwineSales } from './sales';

const pt = {
  animals: 'Vender Animais', doses: 'Vender Doses de Sêmen', lot: 'Lote de coleta', price: 'Preço por dose',
  date: 'Data da venda (AAAA-MM-DD)', due: 'Vencimento (AAAA-MM-DD)', review: 'Revisar venda',
  confirm: 'Confirmar venda', invalid: 'Confira o lote e os dados da venda.',
  effect: 'A venda baixa as doses do estoque e gera um título a receber pendente.',
  uncertain: 'Resultado incerto. Reenvie os mesmos dados para conferir.',
};
export const semenCopy = {
  'pt-BR': pt, 'pt-PT': { ...pt, doses: 'Vender Doses de Sémen' },
  en: {
    animals: 'Sell Animals', doses: 'Sell Semen Doses', lot: 'Collection lot', price: 'Price per dose',
    date: 'Sale date (YYYY-MM-DD)', due: 'Due date (YYYY-MM-DD)', review: 'Review sale',
    confirm: 'Confirm sale', invalid: 'Check the lot and sale details.',
    effect: 'The sale removes doses from stock and creates a pending receivable.',
    uncertain: 'Unconfirmed result. Retry with the same details.',
  },
  es: {
    animals: 'Vender Animales', doses: 'Vender Dosis de Semen', lot: 'Lote de colecta', price: 'Precio por dosis',
    date: 'Fecha de venta (AAAA-MM-DD)', due: 'Vencimiento (AAAA-MM-DD)', review: 'Revisar venta',
    confirm: 'Confirmar venta', invalid: 'Revise el lote y los datos de venta.',
    effect: 'La venta descuenta las dosis del inventario y genera una cuenta por cobrar pendiente.',
    uncertain: 'Resultado incierto. Reintente con los mismos datos.',
  },
};

export function SemenSalesPanel({ active }: { active: boolean }) {
  const { state, controller, language } = useAuth();
  const copy = semenCopy[language];
  const cache = useQueryClient();
  const swine = swineMessages[language];
  const workspace = workspaceMessages[language];
  const allowed = state.status === 'signedIn' && canReadSwineSales(state.session.user);
  const session = state.status === 'signedIn' ? `${state.session.organization.id}:${state.session.user.id}` : '';
  const query = useQuery({
    queryKey: ['swine-semen-sales', session], enabled: allowed && active,
    queryFn: ({ signal }) => controller.semenSales(signal),
  });
  const [collection, setCollection] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [buyer, setBuyer] = useState('');
  const [date, setDate] = useState('');
  const [due, setDue] = useState('');
  const [review, setReview] = useState<SemenSaleCommand>();
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  const lock = useRef(false);
  const lot = query.data?.lots.find(row => row.collection === collection);
  const day = date || query.data?.today || '';

  function prepare() {
    if (!lot || !query.data) return;
    const result = semenSaleCommand.safeParse({
      request_key: randomUUID(), collection, expected_balance: lot.balance,
      quantity: Number(quantity), price, buyer, date: day, due_date: due || day,
    });
    if (!result.success || day < lot.date || day > query.data.today) {
      setError(copy.invalid);
      return;
    }
    setError('');
    setReference('');
    setReview(result.data);
  }

  async function confirm() {
    if (!review || lock.current) return;
    lock.current = true;
    setSaving(true);
    setError('');
    try {
      const receipt = await controller.sellSemenDoses(review);
      setReference(receipt.reference);
      setReview(undefined);
      setUncertain(false);
      setQuantity('');
      if (!receipt.remaining) setCollection('');
      for (const key of ['inventory', 'inventory-summary', 'inventory-detail', 'inventory-lots', 'inventory-lot-detail', 'inventory-movements']) {
        void cache.invalidateQueries({ queryKey: [key] });
      }
      void query.refetch();
    } catch (caught) {
      const status = isAxiosError(caught) ? caught.response?.status : undefined;
      if (!status || status >= 500 || status === 408) {
        setUncertain(true);
        setError(copy.uncertain);
      } else if (status === 409 || status === 404) {
        setReview(undefined);
        setUncertain(false);
        setError(copy.invalid);
        void query.refetch();
      } else {
        setError(uncertain ? copy.uncertain : copy.invalid);
      }
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  if (!active || !allowed) return null;
  const field = (label: string, value: string, change: (value: string) => void, keyboard: 'default' | 'number-pad' | 'decimal-pad' = 'default') => (
    <View><Text style={s.body}>{label}</Text><TextInput accessibilityLabel={label} style={s.input} value={value} onChangeText={change} keyboardType={keyboard}/></View>
  );

  return <FlatList data={query.data?.sales ?? []} keyExtractor={row => row.reference} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
    ListHeaderComponent={<View style={s.card}>
      {query.isPending ? <Busy label={workspace.loading}/> : null}
      {query.isError ? <><Text style={s.error}>{swine.error}</Text><AgendaButton label={swine.retry} onPress={() => void query.refetch()}/></> : null}
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      {reference ? <Text accessibilityRole="alert" selectable style={s.body}>{reference}</Text> : null}
      {review ? <>
        <Text style={s.title}>{lot?.lot} · {review.buyer}</Text>
        <Text style={s.body}>{review.quantity} × {moneyText(review.price, language)} = {moneyText(semenSaleAmount(review.quantity, review.price), language)}</Text>
        <Text style={s.body}>{review.date} · {copy.due}: {review.due_date}</Text>
        <Text style={s.body}>{copy.effect}</Text>
        <AgendaButton label={uncertain ? swine.retry : copy.confirm} variant="primary" disabled={saving} busy={saving} onPress={() => void confirm()}/>
        {!uncertain ? <AgendaButton label={swine.close} disabled={saving} onPress={() => setReview(undefined)}/> : null}
      </> : query.data ? <>
        <Text style={s.title}>{copy.lot}</Text>
        {query.data.lots.length ? <View style={s.row}>{query.data.lots.map(row => (
          <AgendaButton key={row.collection} label={`${row.lot} · ${row.breeder} · ${row.farm} · ${row.balance}`}
            selected={collection === row.collection} onPress={() => { setCollection(row.collection); setQuantity(''); }}/>
        ))}</View> : <Text style={s.body}>{swine.empty}</Text>}
        {lot ? <>
          {field(swine.quantity, quantity, setQuantity, 'number-pad')}
          {field(copy.price, price, setPrice, 'decimal-pad')}
          {field(swine.buyer, buyer, setBuyer)}
          {field(copy.date, day, setDate)}
          {field(copy.due, due || day, setDue)}
          <AgendaButton label={copy.review} variant="primary" disabled={query.isFetching} onPress={prepare}/>
        </> : null}
      </> : null}
    </View>}
    renderItem={({ item }) => <View style={s.card}><Text style={s.title}>{item.lot} · {moneyText(item.amount, language)}</Text>
      <Text style={s.body}>{item.date} · {item.buyer} · {swine.quantity}: {item.quantity}</Text>
    </View>}
  />;
}
