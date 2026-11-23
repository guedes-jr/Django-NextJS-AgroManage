import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { AgendaButton, Busy, styles as s } from '../agenda/ui';
import { useAuth } from '../auth/AuthProvider';
import { moneyText } from '../inventory/launchContracts';
import { workspaceMessages } from '../workspace/messages';
import { WorkspaceShell } from '../workspace/WorkspaceShell';
import { swineMessages } from './messages';
import { canReadSwineSales } from './sales';

export const salesTitle = { 'pt-BR': 'Vendas de suínos', 'pt-PT': 'Vendas de suínos', en: 'Swine sales', es: 'Ventas de cerdos' };

export function SwineSalesScreen() {
  const { state, controller, language } = useAuth();
  const router = useRouter();
  const copy = swineMessages[language];
  const workspace = workspaceMessages[language];
  const allowed = state.status === 'signedIn' && canReadSwineSales(state.session.user);
  const session = state.status === 'signedIn' ? `${state.session.organization.id}:${state.session.user.id}` : '';
  const query = useQuery({
    queryKey: ['swine-sales', session], enabled: allowed, retry: false,
    queryFn: ({ signal }) => controller.swineSales(signal),
  });
  return <WorkspaceShell active="swine" title={salesTitle[language]}>
    {!allowed ? <Text style={s.error}>{workspace.noAccess}</Text> : <FlatList
      contentContainerStyle={s.content}
      data={query.isError ? [] : query.data ?? []}
      keyExtractor={row => row.id}
      refreshing={query.isFetching && !query.isPending}
      onRefresh={() => void query.refetch()}
      ListHeaderComponent={<View style={{ gap: 8 }}>
        <AgendaButton label={workspace.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/swine')}/>
        {query.isPending ? <Busy label={workspace.loading}/> : null}
        {query.isError ? <><Text accessibilityRole="alert" style={s.error}>{copy.error}</Text><AgendaButton label={copy.retry} onPress={() => void query.refetch()}/></> : null}
      </View>}
      ListEmptyComponent={query.isSuccess ? <Text style={s.body}>{copy.empty}</Text> : undefined}
      renderItem={({ item }) => <View style={s.card}>
        <Text style={s.title}>{item.batch_code} · {moneyText(item.amount, language)}</Text>
        <Text style={s.body}>{item.date} · {copy.quantity}: {item.quantity}</Text>
        <Text style={s.body}>{copy.buyer}: {item.buyer}</Text>
        {item.weight_kg != null ? <Text style={s.body}>{copy.weight}: {item.weight_kg} kg</Text> : null}
      </View>}
    />}
  </WorkspaceShell>;
}
