import { useRef } from 'react';
import { ActivityIndicator, Platform, Pressable, Text } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { AuthFailure } from '../../services/authApi';
import { useAuth } from './AuthProvider';
import { GoogleLoginFrame, googleStyles } from './GoogleLoginFrame';
import type { GoogleLoginProps } from './GoogleLoginProps';
export function GoogleLoginButton(props: GoogleLoginProps) {
  const { t } = useAuth();
  const active = useRef(false);
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const scheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME?.trim();
  const configured = !!webClientId && (Platform.OS !== 'ios' || !!iosClientId && !!scheme);
  const expoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const signIn = async () => {
    if (active.current || props.disabled || !configured || expoGo) return;
    active.current = true; props.onBusyChange(true);
    let loaded = false;
    try {
      const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = await import('@react-native-google-signin/google-signin');
      loaded = true;
      GoogleSignin.configure({ webClientId, iosClientId });
      try {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog:true });
        const result = await GoogleSignin.signIn();
        if (isSuccessResponse(result)) {
          if (!result.data.idToken) throw new AuthFailure('googleFailed');
          // Clear the SDK session; the app's remember setting exclusively controls persistence.
          const token = result.data.idToken;
          await GoogleSignin.signOut();
          await props.onCredential(token);
        }
      } catch (error) {
        if (!isErrorWithCode(error) || error.code !== statusCodes.SIGN_IN_CANCELLED) throw error;
      }
    } catch (error) { props.onError(error instanceof AuthFailure ? error : new AuthFailure(loaded ? 'googleFailed' : 'googleNativeBuild')); }
    finally { active.current = false; props.onBusyChange(false); }
  };
  return <GoogleLoginFrame unavailable={!configured || expoGo} hint={!configured ? t.googleConfiguration : expoGo ? t.googleNativeBuild : undefined}><Pressable accessibilityRole="button" accessibilityLabel={t.googleSignIn} disabled={props.disabled} accessibilityState={{disabled:props.disabled}} onPress={() => void signIn()} style={googleStyles.button}>{props.disabled ? <ActivityIndicator color="#4285F4"/> : <Text style={googleStyles.g}>G</Text>}<Text style={googleStyles.text}>{t.googleSignIn}</Text></Pressable></GoogleLoginFrame>;
}
