import type { ConfigContext, ExpoConfig } from 'expo/config';
export default ({ config }: ConfigContext): ExpoConfig => {
  const iosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME?.trim();
  return { ...config, name: config.name ?? 'Fazenda Mais', slug: config.slug ?? 'fazenda-mais-mobile', plugins: [
    ...(config.plugins ?? []),
    ...(iosUrlScheme ? [['@react-native-google-signin/google-signin', { iosUrlScheme }] as [string, { iosUrlScheme: string }]] : []),
  ] };
};
