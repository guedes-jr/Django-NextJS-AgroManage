import { createContext, useContext, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { getLocales } from 'expo-localization';
import { parseApiUrl } from '../../config/environment';
import { messages, resolveLanguage } from '../../i18n/messages';
import { createAuthApi } from '../../services/authApi';
import { SessionController } from './sessionController';
import { createTokenVault } from './tokenVault';

function createRuntime() {
  const deviceLanguage = resolveLanguage(getLocales()[0]?.languageTag);
  const baseURL = parseApiUrl(process.env.EXPO_PUBLIC_API_URL, __DEV__);
  const api = createAuthApi(baseURL);
  return { api, controller: new SessionController(api, createTokenVault(baseURL), deviceLanguage), deviceLanguage, configured: !!baseURL };
}
const AuthContext = createContext<ReturnType<typeof createRuntime> | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const [runtime] = useState(createRuntime);
  useEffect(() => {
    void runtime.controller.restore();
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active' && runtime.controller.getSnapshot().status === 'signedIn' && !runtime.controller.isSelectingLocalDocument()) void runtime.controller.restore();
    });
    return () => listener.remove();
  }, [runtime]);
  return <AuthContext.Provider value={runtime}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const runtime = useContext(AuthContext);
  if (!runtime) throw new Error('AuthProvider is required');
  const state = useSyncExternalStore(runtime.controller.subscribe, runtime.controller.getSnapshot, runtime.controller.getSnapshot);
  const language = state.status === 'signedIn' ? state.session.organization.language : runtime.deviceLanguage;
  return { ...runtime, state, language, t: messages[language] };
}
