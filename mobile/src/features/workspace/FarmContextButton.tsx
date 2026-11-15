import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import { canReadAgenda } from '../agenda/contracts';
import { AgendaButton, styles as s } from '../agenda/ui';
import { useWorkspace } from './WorkspaceProvider';
import { workspaceMessages } from './messages';
export function FarmContextButton({ style, requiredForOperation = false }: { style?: StyleProp<ViewStyle>; requiredForOperation?: boolean } = {}){
  const { state, language } = useAuth();
  const { farm } = useWorkspace();
  const router = useRouter();
  if (state.status !== 'signedIn' || !canReadAgenda(state.session.user)) return null;
  if (requiredForOperation && !farm) return <AgendaButton style={style} label={workspaceMessages[language].farms} onPress={() => router.push('/farms')} />;
  return farm ? <View style={style}><Text style={s.muted}>{farm.name}</Text></View> : null;
}
