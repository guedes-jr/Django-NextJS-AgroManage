import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, Text, View } from 'react-native';
import { useAuth } from './AuthProvider';
import { styles } from './AuthControls';
export function AuthTabs({ value, busy, onChange }: { value:'login'|'register'; busy:boolean; onChange:(value:'login'|'register')=>void }) {
  const { t } = useAuth();
  const [width,setWidth] = useState(0);
  const [reduced,setReduced] = useState(true);
  const [position] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let active=true;
    let observed=false;
    void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(active && !observed)setReduced(value);}).catch(()=>{});
    const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',value=>{observed=true;setReduced(value);});
    return ()=>{active=false;listener.remove();};
  },[]);
  useEffect(() => {
    const toValue=value==='register' ? Math.max(0,width-10)/2 : 0;
    if(reduced){position.stopAnimation();position.setValue(toValue);return;}
    const animation=Animated.timing(position,{toValue,duration:190,easing:Easing.out(Easing.cubic),useNativeDriver:Platform.OS!=='web',isInteraction:false});
    animation.start();return ()=>animation.stop();
  },[value,width,reduced,position]);
  return <View accessibilityRole="tablist" style={styles.authTabs} onLayout={event=>setWidth(event.nativeEvent.layout.width)}>
    <Animated.View pointerEvents="none" style={[styles.authTabIndicator,{width:Math.max(0,width-10)/2,transform:[{translateX:position}]}]}/>
    {(['login','register'] as const).map(tab=><Pressable key={tab} accessibilityRole="tab" aria-selected={value===tab} aria-disabled={busy} accessibilityState={{selected:value===tab,disabled:busy}} disabled={busy} onPress={()=>{if(value!==tab)onChange(tab);}} style={styles.authTab}><Text style={[styles.authTabText,value===tab&&styles.authTabTextActive]}>{tab==='login'?t.signIn:t.registerTab}</Text></Pressable>)}
  </View>;
}
