import Svg, { Circle, Path, Rect } from 'react-native-svg';
export type AuthIconName = 'mail' | 'lock' | 'eye' | 'eyeOff' | 'signIn' | 'terms' | 'shield';
export function AuthIcon({ name, size = 22, color = '#F3F9EF' }: { name: AuthIconName; size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden={true}>
    {name === 'mail' ? <><Rect x="3" y="5" width="18" height="14" rx="2" /><Path d="m3 6 9 7 9-7" /></>
      : name === 'lock' ? <><Rect x="5" y="10" width="14" height="11" rx="2" /><Path d="M8 10V7a4 4 0 0 1 8 0v3M12 15v3" /><Circle cx="12" cy="15" r="0.7" /></>
      : name === 'eye' || name === 'eyeOff' ? <><Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><Circle cx="12" cy="12" r="3" />{name === 'eyeOff' && <Path d="m3 21 18-18" />}</>
      : name === 'signIn' ? <><Path d="M10 4h7a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-7M2 12h12m-5-5 5 5-5 5" /></>
      : name === 'terms' ? <><Path d="M6 2h8l4 4v16H6V2Zm8 0v5h4M9 11h6m-6 4h6m-6 4h4" /></>
      : <><Path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Z" /><Path d="m8 12 3 3 5-6" /></>}
  </Svg>;
}
