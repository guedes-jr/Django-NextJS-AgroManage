import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { legalUrls } from '../../config/environment';
import { useAuth } from './AuthProvider';
import { AuthIcon } from '../../components/auth/AuthIcon';
import { authSizing } from '../../theme/tokens';

export function LegalFooter() {
  const { t } = useAuth();
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);
  const urls = legalUrls(process.env.EXPO_PUBLIC_SITE_URL, __DEV__);
  const open = async (url: string | undefined) => {
    if (opening) return;
    setFailed(false);
    if (!url) { setFailed(true); return; }
    setOpening(true);
    try { await Linking.openURL(url); } catch { setFailed(true); }
    finally { setOpening(false); }
  };
  return <View testID="legal-footer" style={footerStyles.bubble}>
    <View style={footerStyles.links}>
      {([
        ['terms', t.termsOfUse], ['privacy', t.privacyPolicy],
      ] as const).map(([key, label]) => <Pressable key={key} accessibilityRole="link" accessibilityLabel={label}
        accessibilityHint={t.opensInBrowser} accessibilityState={{ disabled: opening }} disabled={opening}
        onPress={() => void open(urls?.[key])} style={footerStyles.link}>
        <AuthIcon name={key === 'terms' ? 'terms' : 'shield'} size={18} />
        <Text style={footerStyles.linkText}>{label}</Text>
        {key === 'terms' && <View accessible={false} pointerEvents="none" style={footerStyles.divider} />}
      </Pressable>)}
    </View>
    <Text style={footerStyles.copyright}>© {new Date().getFullYear()} Fazenda Mais. {t.allRightsReserved}</Text>
    {failed && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={footerStyles.error}>{t.legalLinkFailed}</Text>}
  </View>;
}
const footerStyles = StyleSheet.create({
  bubble: { width: '92%', maxWidth: authSizing.formWidth, alignSelf: 'center', paddingHorizontal: 0, paddingTop: 7, paddingBottom: 7, marginTop: authSizing.legalGap },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 24, rowGap: 2 },
  link: { minHeight: 44, flexDirection: 'row', gap: 9, justifyContent: 'center', alignItems: 'center', maxWidth: '100%' },
  linkText: { color: '#F3F9EF', textDecorationLine: 'underline', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  divider: { position: 'absolute', right: -13, width: 1, height: 18, backgroundColor: '#D4E8D3' },
  copyright: { color: '#E2EDE1', fontSize: 11, lineHeight: 18, textAlign: 'center', marginTop: 10 },
  error: { color: '#FFD6CB', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 10 },
});
