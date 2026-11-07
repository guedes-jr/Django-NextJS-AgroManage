import { ActivityIndicator, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brand } from '../features/auth/AuthControls';
import { colors } from '../theme/tokens';

export function AppLoading({ label, onLayout }: { label: string; onLayout?: (event: LayoutChangeEvent) => void }) {
  return <SafeAreaView testID="app-loading" style={loadingStyles.screen} onLayout={onLayout}>
    <View style={loadingStyles.content}>
      <Brand centered />
      <ActivityIndicator size="large" color={colors.primary} accessibilityRole="progressbar" accessibilityLabel={label} />
      <Text accessibilityLiveRegion="polite" style={loadingStyles.label}>{label}</Text>
    </View>
  </SafeAreaView>;
}
const loadingStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: 24 },
  content: { alignSelf: 'center', width: '100%', maxWidth: 440, alignItems: 'center', gap: 24 },
  label: { fontSize: 16, color: colors.muted, textAlign: 'center' },
});
