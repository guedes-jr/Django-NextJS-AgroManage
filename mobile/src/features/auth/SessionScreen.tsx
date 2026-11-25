import { useState } from 'react';
import { View } from 'react-native';
import { HomeScreen } from '../home/HomeScreen';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import type { MessageKey } from '../../i18n/messages';
import { authError, type AuthFailure } from '../../services/authApi';
import { AppLoading } from '../../components/AppLoading';
import { newPasswordSchema } from './contracts';
import { useAuth } from './AuthProvider';
import { LoginScreen } from './LoginScreen';
import { Action, AuthShell, Field, Heading, Notice, styles } from './AuthControls';

function PasswordChange() {
  const { t, controller } = useAuth();
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof newPasswordSchema>>({
    resolver: zodResolver(newPasswordSchema), defaultValues: { password: '', confirmation: '' },
  });
  const submit = handleSubmit(async values => {
    setFailure(null);
    try { await controller.changePassword(values.password, values.confirmation); }
    catch (error) { setFailure(authError(error)); }
  });
  return <>
    <Heading title={t.passwordTitle} subtitle={t.passwordHint} />
    <View style={styles.card}>
      {failure && <Notice message={failure.detail ?? t[failure.key]} />}
      {(['password', 'confirmation'] as const).map(name => <Controller key={name} control={control} name={name} render={({ field: { value, onChange, onBlur, ref } }) =>
        <Field ref={ref} label={name === 'password' ? t.newPassword : t.confirmPassword} value={value} onChangeText={onChange} onBlur={onBlur} password
          autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" editable={!isSubmitting}
          error={errors[name]?.message ? t[errors[name]?.message as MessageKey] : undefined} /> } />)}
      <Action label={t.changePassword} busy={isSubmitting} onPress={() => void submit()} />
      <Action secondary label={t.logout} disabled={isSubmitting} onPress={() => void controller.signOut()} />
    </View>
  </>;
}
export function SessionScreen() {
  const { state, t, controller } = useAuth();
  if (state.status === 'signedOut') return <LoginScreen />;
  if (state.status === 'restoring') return <AppLoading label={t.loading} />;
  if (state.status === 'signedIn' && !state.session.user.force_password_change) return <HomeScreen key={state.session.user.id + state.session.organization.id} session={state.session} />;
  return <AuthShell>
    {state.status === 'unavailable' ? <>
      <Heading title={t.unavailable} subtitle={t.sessionHint} />
      <View style={styles.card}>
        <Notice message={state.error.detail ?? t[state.error.key]} />
        <Action label={t.retry} onPress={() => void controller.restore()} />
        <Action secondary label={t.logout} onPress={() => void controller.signOut()} />
      </View>
    </> : <PasswordChange />}
  </AuthShell>;
}
