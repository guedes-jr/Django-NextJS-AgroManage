import { forwardRef, useEffect, useRef, useState, type ComponentProps, type ComponentRef, type PropsWithChildren } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { authSizing, colors } from '../../theme/tokens';
import { useAuth } from './AuthProvider';
import { AuthBackdrop } from '../../components/auth/AuthBackdrop';
import { AuthIcon, type AuthIconName } from '../../components/auth/AuthIcon';
import { AuthButtonFill } from '../../components/auth/AuthButtonFill';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

export function Brand({ centered = false, prominent = false }: { centered?: boolean; prominent?: boolean }) {
  const { width } = useWindowDimensions();
  const compact = width < 360;
  return <View testID="auth-brand" accessible accessibilityRole="header" accessibilityLabel="Fazenda Mais">
    <View style={[styles.brand, centered && styles.brandCentered]}>
      <Image source={require('../../../assets/brand-mark.png')} style={[styles.logo, prominent && { width: compact ? authSizing.smallLogo : authSizing.logo, height: compact ? authSizing.smallLogo : authSizing.logo }]} resizeMode="contain" accessibilityIgnoresInvertColors />
      <Text style={[styles.brandName, prominent && { color: '#FFFFFF', fontSize: compact ? authSizing.smallBrandFont : authSizing.brandFont }]}>Fazenda</Text>
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.brandPlusIcon, prominent && styles.brandPlusIconProminent]}>
        <View style={styles.brandPlusHorizontal} />
        <View style={styles.brandPlusVertical} />
      </View>
    </View>
    {prominent && <Svg width="62%" height={14} viewBox="0 0 300 20" style={{ alignSelf: 'flex-end', marginRight: 9, marginTop: 2 }} aria-hidden={true}>
      <Defs><LinearGradient id="brand-underline" x1="0%" x2="100%"><Stop stopColor="#1F9400" /><Stop offset="0.7" stopColor="#B9F500" /><Stop offset="1" stopColor="#ECFF55" /></LinearGradient></Defs>
      <Path d="M0 15Q150-18 300 16Q145-7 4 20Z" fill="url(#brand-underline)" />
    </Svg>}
  </View>;
}
export function AuthShell({ children, illustrated = false, showBrand = true, showFooter = true, scrollResetKey }: { children: React.ReactNode; illustrated?: boolean; showBrand?: boolean; showFooter?: boolean; scrollResetKey?: string }) {
  const { t } = useAuth();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [scrollResetKey]);
  return <View style={[styles.safe, illustrated && { backgroundColor: '#003D29' }]}>
    <StatusBar style={illustrated ? 'light' : 'dark'} />
    {illustrated && <AuthBackdrop />}
    <SafeAreaView style={styles.flex}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scrollRef} contentContainerStyle={[styles.scroll, illustrated && styles.greenScroll]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={[styles.content, illustrated && styles.greenContent]}>
          {showBrand && <Brand />}
          {children}
          {showFooter && <Text style={[styles.footer, illustrated && styles.onBackground]}>{t.footer}</Text>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  </View>;
}
export function LoginCard({ children, transitionKey }: PropsWithChildren<{transitionKey?:string}>) {
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    let active = true;
    let reduced = false;
    let animation: Animated.CompositeAnimation | undefined;
    const stop = () => { animation?.stop(); opacity.setValue(1); };
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', enabled => {
      reduced = enabled;
      if (enabled) stop();
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (!active || enabled || reduced) return;
      opacity.setValue(0.65);
      animation = Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web', isInteraction: false });
      animation.start();
    }).catch(() => {});
    return () => { active = false; listener.remove(); animation?.stop(); };
  }, [opacity, transitionKey]);
  return <Animated.View testID="login-card" style={[styles.card, styles.loginCard, { opacity }]}>{children}</Animated.View>;
}
export function Heading({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return <View style={styles.heading}>
    {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
  </View>;
}
type FieldProps = ComponentProps<typeof TextInput> & { label: string; error?: string; password?: boolean; onGreen?: boolean; emailIcon?: boolean };
export const Field = forwardRef<ComponentRef<typeof TextInput>, FieldProps>(function Field({ label, error, password, onGreen, emailIcon, style, onFocus, onBlur, ...props }, ref) {
  const { t } = useAuth();
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  return <View style={styles.fieldGroup}>
    <View style={styles.fieldLabelRow}>
      {onGreen && (emailIcon || password) && <AuthIcon name={password ? 'lock' : 'mail'} size={17} />}
      <Text style={[styles.label, onGreen && styles.greenLabel]}>{label}</Text>
    </View>
    <View style={[styles.inputFrame, onGreen && styles.greenInputFrame, focused && styles.inputFocused, focused && onGreen && styles.greenInputFocused, !!error && styles.inputError]}>
      <TextInput {...props} ref={ref} accessibilityLabel={label} accessibilityHint={error} secureTextEntry={password && !visible}
        onFocus={event => { setFocused(true); onFocus?.(event); }} onBlur={event => { setFocused(false); onBlur?.(event); }}
        placeholderTextColor={onGreen ? '#C0D6C5' : colors.muted} underlineColorAndroid="transparent" style={[styles.input, onGreen && styles.greenInput, style, styles.inputOutline]} />
      {emailIcon && !password && <View style={styles.visibility} accessible={false} importantForAccessibility="no-hide-descendants">
        <AuthIcon name="mail" />
      </View>}
      {password && <Pressable disabled={props.editable === false} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={() => setVisible(!visible)} accessibilityRole="button"
        accessibilityLabel={visible ? t.hidePassword : t.showPassword} accessibilityState={{ disabled: props.editable === false }} style={styles.visibility}>
        <AuthIcon name={visible ? 'eye' : 'eyeOff'} color={onGreen ? '#F3F9EF' : colors.muted} />
      </Pressable>}
    </View>
    {error && <Text accessibilityLiveRegion="polite" style={[styles.fieldError, onGreen && styles.greenFieldError]}>{error}</Text>}
  </View>;
});
export function AuthSwitchLink({ label, prefix, disabled, onPress }: { label:string; prefix?:string; disabled?:boolean; onPress:()=>void }) {
  return <View style={styles.signupRow}><View style={styles.signupRule}/><View style={styles.authSwitchWords}>{prefix && <Text style={styles.signupText}>{prefix}</Text>}<Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{disabled:!!disabled}} onPress={onPress} style={styles.signupLink}><Text style={[styles.signupText,styles.signupAccent]}>{label}</Text></Pressable></View><View style={styles.signupRule}/></View>;
}
export function Action({ label, onPress, busy, secondary, disabled, onGreen, icon }: { label: string; onPress: () => void; busy?: boolean; secondary?: boolean; disabled?: boolean; onGreen?: boolean; icon?: AuthIconName }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
    disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [styles.action, secondary && styles.secondary, onGreen && styles.greenAction, onGreen && secondary && styles.greenSecondaryAction, (disabled || busy) && styles.disabled, pressed && styles.pressed]}>
    {onGreen && !secondary && <AuthButtonFill />}
    <View style={styles.actionContents}>
    {busy && <ActivityIndicator color={onGreen ? colors.primary : secondary ? colors.primary : '#FFFFFF'} />}
    {icon && !busy && <AuthIcon name={icon} size={21} color={onGreen ? '#06391C' : '#FFFFFF'} />}
    <Text style={[styles.actionText, secondary && styles.secondaryText, onGreen && styles.greenActionText, onGreen && secondary && styles.greenLabel]}>{label}</Text>
    </View>
  </Pressable>;
}
export function Notice({ message, success }: { message: string; success?: boolean }) {
  return <View style={[styles.notice, success && styles.successNotice]}>
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.noticeText, success && styles.successText]}>{message}</Text>
  </View>;
}
export const styles = StyleSheet.create({
  flex: { flex: 1 }, safe: { flex: 1, backgroundColor: colors.background, overflow: 'hidden' },
  backgroundShade: { backgroundColor: 'rgba(19, 79, 41, 0.89)' },
  onBackground: { color: '#FFFFFF', textShadowColor: 'rgba(0, 0, 0, 0.7)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24 },
  content: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 20 },
  greenScroll: { justifyContent: 'center', paddingHorizontal: 0, paddingTop: 0, paddingBottom: authSizing.backgroundClearance },
  greenContent: { maxWidth: authSizing.contentWidth, gap: 0 },
  brandPanel: { width: '100%', alignSelf: 'center', justifyContent: 'center', paddingHorizontal: authSizing.horizontalPadding, paddingTop: 46, paddingBottom: 15 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, logo: { width: 44, height: 44 },
  brandCentered: { justifyContent: 'center', flexWrap: 'wrap', paddingTop: 4 },
  brandName: { fontSize: 25, fontWeight: '800', color: colors.forest, letterSpacing: -1 },
  brandPlusIcon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', marginLeft: -5 },
  brandPlusIconProminent: { width: authSizing.brandPlus, height: authSizing.brandPlus },
  brandPlusHorizontal: { position: 'absolute', width: '100%', height: 5, borderRadius: 1, backgroundColor: '#FFD600' },
  brandPlusVertical: { position: 'absolute', width: 5, height: '100%', borderRadius: 1, backgroundColor: '#FFD600' },
  logoProminent: { width: 52, height: 52 },
  brandNameProminent: { fontSize: 29 },
  cardWelcome: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center' },
  greenLabel: { color: '#F3F9EF' },
  greenDescription: { color: '#DEEBDA' },
  loginActions: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  clearFields: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 24, borderWidth: 1, borderColor: '#9FBE89', backgroundColor: 'rgba(0,49,30,.5)', alignItems: 'center', justifyContent: 'center' },
  clearFieldsText: { fontSize: 13, fontWeight: '600', color: '#F3F9EF' },
  loginOptions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 9, rowGap: 0 },
  rememberChoice: { flexDirection: 'row', alignItems: 'center', minHeight: authSizing.touchTarget, gap: 8, maxWidth: '100%' },
  rememberBox: { width: 22, height: 22, borderWidth: 1.5, borderColor: '#E4F0E2', borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  rememberChecked: { backgroundColor: '#B9F500', borderColor: '#B9F500' },
  rememberTick: { color: '#06391C', fontSize: 17, fontWeight: '700' },
  heading: { gap: 12 }, eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  title: { fontSize: 31, fontWeight: '700', color: colors.forest, letterSpacing: -0.9 },
  subtitle: { fontSize: 16, lineHeight: 24, color: colors.muted },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 22, borderWidth: 1, borderColor: '#E0E6DC', gap: 16 },
  authTabs: { flexDirection: 'row', padding: 4, borderWidth: 1, borderColor: 'rgba(160, 201, 151, 0.55)', borderRadius: 28, backgroundColor: 'rgba(0, 45, 28, 0.55)', marginBottom: 12 },
  authTab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 10, borderRadius: 23 },
  authTabIndicator: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 23, backgroundColor: '#C9FA00' },
  authTabText: { fontSize: 15, fontWeight: '600', color: '#F3F9EF', textAlign: 'center' },
  authTabTextActive: { color: '#14371C', fontWeight: '800' },
  loginCard: { width: '100%', maxWidth: authSizing.formWidth, alignSelf: 'center', backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0, paddingHorizontal: authSizing.horizontalPadding, paddingTop: 9, paddingBottom: 3, gap: authSizing.sectionGap },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 5 },
  fieldGroup: { gap: 7 }, labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  label: { color: colors.text, fontSize: authSizing.labelFont, fontWeight: '600' },
  inputFrame: { flexDirection: 'row', alignItems: 'center', minHeight: 54, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: '#F7F9F5' },
  inputFocused: { borderColor: colors.primary, backgroundColor: '#FFFFFF' },
  greenInputFrame: { minHeight: authSizing.controlHeight, borderRadius: 20, backgroundColor: 'rgba(34, 104, 63, 0.38)', borderColor: '#82AD88', borderWidth: 1.2 },
  greenInputFocused: { borderColor: '#C0F33E', backgroundColor: 'rgba(31, 102, 62, 0.58)', boxShadow: '0 0 0 1px #C0F33E' },
  greenInput: { minHeight: authSizing.touchTarget, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 11, color: '#F3F9EF', fontSize: authSizing.inputFont },
  greenFieldError: { color: '#FFE3DA', fontWeight: '500' },
  mailIcon: { width: 21, height: 16, borderWidth: 1.6, borderColor: colors.muted, borderRadius: 4, overflow: 'hidden' },
  mailFoldLeft: { position: 'absolute', width: 12, height: 1.5, left: 0, top: 4, backgroundColor: colors.muted, transform: [{ rotate: '32deg' }] },
  mailFoldRight: { position: 'absolute', width: 12, height: 1.5, right: 0, top: 4, backgroundColor: colors.muted, transform: [{ rotate: '-32deg' }] },
  visibility: { width: authSizing.touchTarget, minHeight: authSizing.touchTarget, alignItems: 'center', justifyContent: 'center' },
  eyeIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  eyeOutline: { width: 22, height: 14, borderWidth: 1.7, borderColor: colors.muted, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  eyePupil: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.muted },
  eyeSlash: { position: 'absolute', width: 27, height: 2, backgroundColor: colors.muted, transform: [{ rotate: '-42deg' }] },
  input: { flex: 1, minWidth: 0, minHeight: 52, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 13, color: colors.text, fontSize: 16 },
  inputOutline: { ...Platform.select({ web: { outlineStyle: 'solid', outlineWidth: 0 } }) },
  inputError: { borderColor: colors.error }, fieldError: { color: colors.error, fontSize: 14 },
  action: { minHeight: 52, borderRadius: 13, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  actionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  actionContents: { zIndex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  greenAction: { backgroundColor: '#B9F500', borderRadius: 24, minHeight: authSizing.controlHeight, paddingVertical: 10, overflow: 'hidden', gap: 9, marginTop: 2 },
  greenActionText: { color: '#06391C', fontSize: authSizing.buttonFont, fontWeight: '800' },
  greenSecondaryAction: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#BDD5B6' },
  secondary: { backgroundColor: colors.soft }, secondaryText: { color: colors.forest }, disabled: { opacity: 0.65 }, pressed: { opacity: 0.8 },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-end' }, linkText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  underlined: { textDecorationLine: 'underline' },
  authSwitchWords: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', columnGap: 5, flexShrink: 1 },
  signupRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: authSizing.signupGap },
  signupRule: { flex: 1, height: 1, backgroundColor: 'rgba(203, 228, 201, 0.42)' },
  signupLink: { minHeight: 48, justifyContent: 'center', flexShrink: 1 },
  signupText: { color: '#F3F9EF', fontSize: 16, textAlign: 'center' },
  signupAccent: { color: '#CAFF00', fontWeight: '700', textDecorationLine: 'underline' },
  reassurance: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 20 }, footer: { color: colors.muted, fontSize: 13, textAlign: 'center', paddingBottom: 6 },
  notice: { padding: 14, borderRadius: 10, backgroundColor: colors.errorSurface }, noticeText: { color: colors.error, fontSize: 14, lineHeight: 21 },
  successNotice: { backgroundColor: colors.soft }, successText: { color: colors.success },
  identity: { fontSize: 20, fontWeight: '700', color: colors.forest }, description: { fontSize: 16, color: colors.muted, lineHeight: 24 },
});
