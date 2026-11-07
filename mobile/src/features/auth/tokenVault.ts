import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { tokensSchema, type Tokens } from './contracts';
import type { TokenVault } from './sessionController';
import { sessionStorageKey } from '../../config/environment';

export function createTokenVault(apiUrl: string | null): TokenVault {
  // Environment namespaces prevent a different API from receiving old tokens.
  const key = sessionStorageKey(apiUrl);
  const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  // Web is an ephemeral layout preview; never store tokens in localStorage.
  let previewTokens: Tokens | null = null;
  return {
    async read() {
      if (Platform.OS === 'web') return previewTokens;
      const raw = await SecureStore.getItemAsync(key, options);
      if (!raw) return null;
      let data: unknown;
      try { data = JSON.parse(raw); }
      catch { await SecureStore.deleteItemAsync(key, options); return null; }
      const parsed = tokensSchema.safeParse(data);
      if (!parsed.success) { await SecureStore.deleteItemAsync(key, options); return null; }
      return parsed.data;
    },
    async save(tokens) {
      if (Platform.OS === 'web') { previewTokens = tokens; return; }
      await SecureStore.setItemAsync(key, JSON.stringify(tokensSchema.parse(tokens)), options);
    },
    async clear() {
      if (Platform.OS === 'web') { previewTokens = null; return; }
      await SecureStore.deleteItemAsync(key, options);
    },
  };
}
