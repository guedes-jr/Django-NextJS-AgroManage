import { useId } from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

export function AuthBackdrop() {
  const { width, height } = useWindowDimensions();
  const id = `auth${useId().replace(/\W/g, '')}`;
  const imageWidth = Math.max(width, height * (2 / 3));
  const imageHeight = Math.max(height, width * 1.5);
  return <View testID="auth-backdrop" style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
    <Image testID="login-background" source={require('../../../assets/auth-landscape.png')} resizeMode="cover"
      style={{ position: 'absolute', width: imageWidth, height: imageHeight, right: 0, top: 0 }} />
    <Svg width="100%" height="100%" viewBox="0 0 1000 1600" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={`${id}shade`} x1="0" y1="0" x2="1" y2="0.35">
          <Stop offset="0" stopColor="#003D29" stopOpacity="0.82" /><Stop offset="0.65" stopColor="#003D29" stopOpacity="0.62" /><Stop offset="1" stopColor="#003D29" stopOpacity="0.30" />
        </LinearGradient>
        <LinearGradient id={`${id}lime`} x1="0" y1="0" x2="1" y2="0.4">
          <Stop offset="0" stopColor="#239700" /><Stop offset="0.32" stopColor="#C4FF00" /><Stop offset="0.52" stopColor="#F1FF75" /><Stop offset="0.7" stopColor="#9CDE00" /><Stop offset="1" stopColor="#348800" />
        </LinearGradient>
        <LinearGradient id={`${id}deep`} x1="0" y1="0" x2="1" y2="1">
          <Stop stopColor="#087429" /><Stop offset="1" stopColor="#002D20" />
        </LinearGradient>
        <RadialGradient id={`${id}glow`} cx="0.1" cy="0.91" rx="0.9" ry="0.25">
          <Stop stopColor="#39D200" stopOpacity="0.48" /><Stop offset="1" stopColor="#005333" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="1000" height="1600" fill={`url(#${id}shade)`} />
      <Rect width="1000" height="1600" fill={`url(#${id}glow)`} />
      <Path d="M0 0H480C300 44 96 40 0 210Z" fill={`url(#${id}deep)`} />
      <Path d="M0 0H310C178 32 65 94 0 190Z" fill={`url(#${id}lime)`} />
      <Path d="M0 188C65 95 175 32 310 0" stroke="#F1FF8B" strokeWidth="3" fill="none" />
      <Path d="M0 1463C350 1655 650 1390 1000 1390V1600H0Z" fill={`url(#${id}deep)`} />
      <Path d="M0 1447C320 1640 695 1340 1000 1378V1468C715 1322 370 1700 0 1576Z" fill={`url(#${id}lime)`} />
      <Path d="M0 1447C320 1640 695 1340 1000 1378" stroke="#EDFF86" strokeWidth="4" fill="none" />
      <Path d="M0 1488C330 1686 700 1412 1000 1468V1530C670 1410 300 1710 0 1598Z" fill="#003C23" fillOpacity="0.72" />
    </Svg>
  </View>;
}
