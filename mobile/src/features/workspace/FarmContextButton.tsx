import { useRouter } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import { canReadAgenda } from '../agenda/contracts';
import { AgendaButton } from '../agenda/ui';
import { useWorkspace } from './WorkspaceProvider';
import { workspaceMessages } from './messages';
export function FarmContextButton(){const {state,language}=useAuth();const {farm}=useWorkspace();const router=useRouter();if(state.status!=='signedIn'||!canReadAgenda(state.session.user))return null;return <AgendaButton label={`${workspaceMessages[language].farms}: ${farm?.name??workspaceMessages[language].allFarms}`} onPress={()=>router.push('/farms')}/>;}
