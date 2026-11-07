import { useRef, useState, type ComponentRef } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registrationSchema, type Registration } from './contracts';
import { RegistrationFailure, registrationError, type AuthFailure } from '../../services/authApi';
import type { MessageKey } from '../../i18n/messages';
import { useAuth } from './AuthProvider';
import { Action, AuthSwitchLink, Field, Notice, styles } from './AuthControls';

const defaults: Registration = { full_name: '', email: '', phone: '', password: '', password_confirm: '', phone_is_whatsapp: false, receive_system_alerts: false };
const fields = ['full_name', 'email', 'phone', 'password', 'password_confirm'] as const;
type Input = ComponentRef<typeof TextInput>;
export function RegistrationForm({ onBack, onCreated, onBusyChange }: { onBusyChange: (busy: boolean) => void; onBack: () => void; onCreated: (email: string) => void }) {
  const { t, api, language, configured } = useAuth();
  const [helpPinned, setHelpPinned] = useState(false);
  const [helpHovered, setHelpHovered] = useState(false);
  const [helpFocused, setHelpFocused] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const refs = useRef<Partial<Record<(typeof fields)[number], Input | null>>>({});
  const submitting = useRef(false);
  const { control, handleSubmit, setError, setFocus, reset, formState: { errors, isSubmitting } } = useForm<Registration>({
    resolver: zodResolver(registrationSchema), defaultValues: defaults,
  });
  const whatsapp = useWatch({ control, name: 'phone_is_whatsapp' });
  const create = handleSubmit(async values => {
    Keyboard.dismiss(); setFailure(null);
    try {
      await api.register(values, language);
      reset(defaults);
      onCreated(values.email);
    } catch (error) {
      const result = registrationError(error);
      setFailure(result);
      if (result instanceof RegistrationFailure) {
        for (const [name, message] of Object.entries(result.fields)) setError(name as keyof Registration, { type: 'server', message });
        const first = fields.find(field => result.fields[field]);
        if (first) setFocus(first);
      }
    }
  });
  const submit = async () => {
    if (!configured || submitting.current) return;
    submitting.current = true; onBusyChange(true);
    try { await create(); } finally { submitting.current = false; onBusyChange(false); }
  };
  const message = (name: keyof Registration) => {
    const error = errors[name];
    return error?.message ? error.type === 'server' ? error.message : t[error.message as MessageKey] : undefined;
  };
  const labels = { full_name: t.fullName, email: t.email, phone: whatsapp ? t.phoneWhatsApp : t.phone, password: t.password, password_confirm: t.registerConfirmPassword };
  const placeholders = { full_name: t.namePlaceholder, email: t.emailPlaceholder, phone: t.phonePlaceholder, password: t.passwordLength, password_confirm: t.registerConfirmPassword };
  return <>
    {failure && <Notice message={failure.detail ?? t[failure.key]} />}
    {fields.map((name, index) => <Controller key={name} control={control} name={name} render={({ field: { onChange, onBlur, value, ref } }) =>
      <Field onGreen emailIcon={name === 'email'} label={labels[name]} placeholder={placeholders[name]} value={value}
        ref={input => { ref(input); refs.current[name] = input; }} onChangeText={onChange} onBlur={onBlur} editable={!isSubmitting}
        password={name === 'password' || name === 'password_confirm'} error={message(name)}
        autoCapitalize={name === 'full_name' ? 'words' : 'none'} autoCorrect={false}
        keyboardType={name === 'email' ? 'email-address' : name === 'phone' ? 'phone-pad' : 'default'}
        autoComplete={name === 'full_name' ? 'name' : name === 'email' ? 'email' : name === 'phone' ? 'tel' : 'new-password'}
        maxLength={name === 'full_name' ? 255 : name === 'phone' ? 30 : undefined}
        returnKeyType={index === fields.length - 1 ? 'done' : 'next'} submitBehavior={index === fields.length - 1 ? 'blurAndSubmit' : 'submit'}
        onSubmitEditing={() => { const next = fields[index + 1]; if (next) refs.current[next]?.focus(); else void submit(); }} />
    } />)}
    <View style={registrationStyles.consents}>
      <Text accessibilityRole="header" style={[styles.label, styles.greenLabel]}>{t.contactTitle}</Text>
      {(['phone_is_whatsapp', 'receive_system_alerts'] as const).map(name => <Controller key={name} control={control} name={name} render={({ field: { value, onChange } }) =>
        <View onPointerLeave={()=>setHelpHovered(false)}>
          <View style={registrationStyles.choiceRow}><Pressable accessibilityRole="checkbox" aria-checked={value} accessibilityState={{ checked: value, disabled: isSubmitting }} disabled={isSubmitting}
            accessibilityLabel={name === 'phone_is_whatsapp' ? t.whatsAppContact : t.systemAlerts}
            onPress={() => onChange(!value)} style={registrationStyles.choice}>
            <View style={[registrationStyles.checkbox, value && registrationStyles.checked]}>
              {value && <Text style={registrationStyles.checkmark}>✓</Text>}
            </View>
            <Text style={[registrationStyles.choiceLabel, styles.greenLabel]}>{name === 'phone_is_whatsapp' ? t.whatsAppContact : t.systemAlerts}</Text>
          </Pressable>
          {name === 'receive_system_alerts' && <Pressable accessibilityRole="button" accessibilityLabel={t.alertsHelp} aria-expanded={helpPinned||helpHovered||helpFocused} onHoverIn={()=>setHelpHovered(true)} onFocus={()=>setHelpFocused(true)} onBlur={()=>setHelpFocused(false)} onPress={()=>setHelpPinned(value=>!value)} style={registrationStyles.helpButton}><Text style={registrationStyles.helpIcon}>?</Text></Pressable>}
          </View>
          {name === 'receive_system_alerts' && (helpPinned||helpHovered||helpFocused) && <View style={registrationStyles.helpBubble}><Text style={registrationStyles.helpText}>{t.alertsHint}</Text></View>}
          {message(name) && <Text accessibilityLiveRegion="polite" style={styles.greenFieldError}>{message(name)}</Text>}
        </View>
      } />)}
    </View>
    <Action onGreen label={isSubmitting ? t.creatingAccount : t.createAccount} busy={isSubmitting} disabled={!configured} onPress={() => void submit()} />
    <AuthSwitchLink prefix={t.hasAccount} label={t.signIn} disabled={isSubmitting} onPress={onBack} />
  </>;
}
const registrationStyles = StyleSheet.create({
  consents: { gap: 6, paddingVertical: 4 },
  choiceRow: { flexDirection:'row', alignItems:'flex-start', gap:4 },
  helpButton: { minWidth:44, minHeight:48, alignItems:'center', justifyContent:'center' },
  helpIcon: { color:'#F3F9EF', borderColor:'#B8D5AA', borderWidth:1.5, borderRadius:10, width:20, height:20, textAlign:'center', lineHeight:17, fontSize:14, fontWeight:'700' },
  helpBubble: { padding:13, marginBottom:8, borderRadius:12, borderWidth:1, borderColor:'#7A9A68', backgroundColor:'#183E2B' },
  helpText: { color:'#F4FAED', fontSize:13, lineHeight:20 },
  choice: { flex:1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: '#C7DEC0', alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: '#F1F5ED' }, checkmark: { color: '#24663D', fontSize: 18, fontWeight: '700' },
  choiceLabel: { flex: 1, fontSize: 14, lineHeight: 21 }, hint: { fontSize: 13, lineHeight: 20 },
});
