import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { AppLoading } from '../../src/components/AppLoading';
/** Backoffice routes: only an active platform team session (no organization context). */
export default function PlatformLayout(){const {state,t}=useAuth();if(state.status==='restoring')return <AppLoading label={t.loading}/>;if(state.status!=='platform'||state.session.user.force_password_change)return <Redirect href="/"/>;return <Stack screenOptions={{headerShown:false}}/>;}
