import { useRef, useState, type ComponentRef } from 'react';
import { Keyboard, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { MessageKey } from '../../i18n/messages';
import { authError, type AuthFailure } from '../../services/authApi';
import { credentialsSchema, type Credentials } from './contracts';
import { useAuth } from './AuthProvider';
import { Action, AuthShell, AuthSwitchLink, Brand, Field, LoginCard, Notice, styles } from './AuthControls';
import { RegistrationForm } from './RegistrationForm';
import { LegalFooter } from './LegalFooter';
import { GoogleLoginButton } from './GoogleLoginButton';
import { authSizing } from '../../theme/tokens';

const recoverySchema = z.object({ email: z.string().trim().pipe(z.email('invalidEmail')) });
export function LoginScreen() {
  const { api, controller, language, t, configured } = useAuth();
  const { height } = useWindowDimensions();
  const [view, setView] = useState<'login' | 'recovery' | 'register'>('login');
  const recovery = view === 'recovery';
  const registration = view === 'register';
  const [created, setCreated] = useState(false);
  const [remember, setRemember] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [sent, setSent] = useState(false);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const { control, handleSubmit, formState: { errors, isSubmitting }, resetField, clearErrors, setValue } = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema), defaultValues: { email: '', password: '' },
  });
  const recoveryForm = useForm<{ email: string }>({ resolver: zodResolver(recoverySchema), defaultValues: { email: '' } });
  const busy = registrationBusy || googleBusy || isSubmitting || recoveryForm.formState.isSubmitting;
  const changeView = (value: typeof view) => {
    if (busy) return;
    Keyboard.dismiss();
    resetField('password'); clearErrors(); recoveryForm.clearErrors(); setFailure(null); setSent(false); setCreated(false); setView(value);
  };
  const submit = handleSubmit(async values => {
    Keyboard.dismiss(); setFailure(null);
    try { await controller.signIn(values.email, values.password, remember); resetField('password'); }
    catch (error) { setFailure(authError(error)); resetField('password'); }
  });
  const recover = recoveryForm.handleSubmit(async values => {
    Keyboard.dismiss(); setFailure(null);
    try { await api.recover(values.email, language); setSent(true); }
    catch (error) { setFailure(authError(error)); }
  });
  const errorText = (key: string | undefined) => key ? t[key as MessageKey] : undefined;
  return <AuthShell scrollResetKey={view} illustrated showBrand={false} showFooter={false}>
    <View testID="login-brand-panel" style={[styles.brandPanel, { marginBottom: recovery ? 0 : authSizing.brandFormGap, minHeight: recovery ? 104 : Math.max(authSizing.brandHeightMin, Math.min(authSizing.brandHeightMax, height * 0.18)), paddingTop: recovery ? 28 : Math.max(36, Math.min(54, height * 0.06)) }]}>
      <Brand centered prominent />
    </View>
    <LoginCard transitionKey={view}>
      {(recovery || registration) && <View style={{ gap: 18, paddingBottom: 4 }}>
        {recovery ? <View style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={styles.cardWelcome}>{t.recoveryTitle}</Text>
          <Text style={[styles.description, styles.greenDescription]}>{t.recoverySubtitle}</Text>
        </View>
          : <Text accessibilityRole="header" style={styles.cardWelcome}>{t.registerTitle}</Text>}
      </View>}
      {!configured && <Notice message={t.configuration} />}
      {failure && <Notice message={failure.detail ?? t[failure.key]} />}
      {created && <Notice success message={t.accountCreated} />}
      {registration ? <RegistrationForm onBusyChange={setRegistrationBusy} onBack={() => changeView('login')} onCreated={email => {
        changeView('login'); setValue('email', email); setCreated(true);
      }} /> : recovery ? <>
        {sent ? <Notice success message={t.recoverySent} /> : <>
          <Controller control={recoveryForm.control} name="email" render={({ field: { onChange, onBlur, value, ref } }) =>
            <Field onGreen emailIcon ref={ref} label={t.email} placeholder={t.emailPlaceholder} value={value} onChangeText={onChange} onBlur={onBlur} editable={!busy}
              autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress"
              error={errorText(recoveryForm.formState.errors.email?.message)} onSubmitEditing={() => void recover()} returnKeyType="send" /> } />
          <Action onGreen label={t.sendRecovery} busy={busy} disabled={!configured} onPress={() => void recover()} />
        </>}
        <AuthSwitchLink label={t.signIn} disabled={busy} onPress={() => changeView('login')} />
      </> : <>
        <Controller control={control} name="email" render={({ field: { onChange, onBlur, value, ref } }) =>
          <Field onGreen emailIcon ref={ref} label={t.email} placeholder={t.emailPlaceholder} value={value} onChangeText={onChange} onBlur={onBlur} editable={!busy}
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="username" textContentType="username"
            returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordRef.current?.focus()} error={errorText(errors.email?.message)} /> } />
        <Controller control={control} name="password" render={({ field: { onChange, onBlur, value, ref } }) =>
          <Field onGreen ref={input => { ref(input); passwordRef.current = input; }} label={t.password} placeholder={t.passwordPlaceholder} value={value} onChangeText={onChange} onBlur={onBlur} editable={!busy} password
            autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" returnKeyType="go"
            error={errorText(errors.password?.message)} onSubmitEditing={() => void submit()} /> } />
        <View style={styles.loginOptions}>
          <Pressable accessibilityRole="checkbox" aria-checked={remember} accessibilityState={{ checked: remember, disabled: busy }}
            disabled={busy} onPress={() => setRemember(!remember)} style={styles.rememberChoice} accessibilityLabel={t.rememberMe} accessibilityHint={t.rememberHint}>
            <View style={[styles.rememberBox, remember && styles.rememberChecked]}>
              {remember && <Text style={styles.rememberTick}>✓</Text>}
            </View>
            <Text style={[styles.linkText, styles.greenLabel, { flexShrink: 1 }]}>{t.rememberMe}</Text>
          </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => changeView('recovery')} style={styles.link}>
          <Text style={[styles.linkText, styles.greenLabel, styles.underlined]}>{t.forgot}</Text>
        </Pressable>
        </View>
        <Action onGreen icon="signIn" label={busy ? t.signingIn : t.signIn} busy={busy} disabled={!configured} onPress={() => void submit()} />
        <GoogleLoginButton disabled={busy || !configured} onBusyChange={setGoogleBusy} onCredential={credential => controller.signInGoogle(credential, remember)} onError={error => setFailure(authError(error))} />
        <View style={styles.signupRow}>
          <View style={styles.signupRule} />
          <Pressable accessibilityRole="button" accessibilityLabel={t.registerLink} disabled={busy} onPress={() => changeView('register')} style={styles.signupLink}>
            <Text style={styles.signupText}>{t.noAccount} <Text style={styles.signupAccent}>{t.signUp}</Text></Text>
          </Pressable>
          <View style={styles.signupRule} />
        </View>
      </>}
    </LoginCard>
    <LegalFooter />
  </AuthShell>;
}
