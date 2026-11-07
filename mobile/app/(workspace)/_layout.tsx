import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { AppLoading } from '../../src/components/AppLoading';
export default function WorkspaceLayout(){const {state,t}=useAuth();if(state.status==='restoring')return <AppLoading label={t.loading}/>;if(state.status!=='signedIn'||state.session.user.force_password_change)return <Redirect href="/"/>;return <Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:'#F6F8F1'}}}/>;}
