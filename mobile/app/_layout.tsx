import { SessionQueryProvider } from '../src/query/SessionQueryProvider';
import { WorkspaceProvider } from '../src/features/workspace/WorkspaceProvider';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect, type PropsWithChildren } from 'react';
import { useAssets } from 'expo-asset';
import { getLocales } from 'expo-localization';
import { hideAsync, preventAutoHideAsync } from 'expo-splash-screen';
import { Platform } from 'react-native';
import { AuthProvider } from '../src/features/auth/AuthProvider';
import { AppLoading } from '../src/components/AppLoading';
import { messages, resolveLanguage } from '../src/i18n/messages';

if (Platform.OS !== 'web') void preventAutoHideAsync().catch(() => {});
function hideNativeSplash() { if (Platform.OS !== 'web') void hideAsync().catch(() => {}); }

function StartupGate({ children }: PropsWithChildren) {
  const [assets, error] = useAssets([
    require('../assets/brand-mark.png'),
    require('../assets/auth-landscape.png'),
  ]);
  const ready = !!assets || !!error;
  useEffect(() => { if (ready) hideNativeSplash(); }, [ready]);
  if (!ready) return <AppLoading label={messages[resolveLanguage(getLocales()[0]?.languageTag)].starting} onLayout={hideNativeSplash} />;
  return children;
}
export default function RootLayout() {
  return <SafeAreaProvider><StartupGate><AuthProvider><SessionQueryProvider><WorkspaceProvider>
    <StatusBar style="dark" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F5F7F2' } }} />
  </WorkspaceProvider></SessionQueryProvider></AuthProvider></StartupGate></SafeAreaProvider>;
}
