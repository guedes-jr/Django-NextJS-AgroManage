import { useId } from 'react';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { StyleSheet } from 'react-native';
export function AuthButtonFill() {
  const id = `button${useId().replace(/\W/g, '')}`;
  return <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none" aria-hidden={true}>
    <Defs><LinearGradient id={id} x1="0%" y1="0%" x2="20%" y2="100%">
      <Stop offset="0" stopColor="#ECFF58" /><Stop offset="0.3" stopColor="#C6F600" /><Stop offset="1" stopColor="#7BC300" />
    </LinearGradient></Defs>
    <Rect x="0.75" y="0.75" width="99.5%" height="97.5%" rx="28" fill={`url(#${id})`} stroke="#DDFF3F" strokeWidth="1.5" />
  </Svg>;
}
