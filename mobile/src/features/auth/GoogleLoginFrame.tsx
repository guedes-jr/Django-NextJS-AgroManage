import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from './AuthProvider';
export function GoogleLoginFrame({ children, unavailable, hint }: PropsWithChildren<{unavailable?: boolean; hint?: string}>) {
  const { t } = useAuth();
  return <View style={googleStyles.group}><View style={googleStyles.divider}><View style={googleStyles.rule}/><Text style={googleStyles.hint}>{t.or}</Text><View style={googleStyles.rule}/></View>{unavailable ? <Pressable disabled accessibilityRole="button" accessibilityLabel={t.googleSignIn} accessibilityState={{disabled:true}} style={googleStyles.button}><Text style={googleStyles.g} accessibilityElementsHidden>G</Text><Text style={googleStyles.text}>{t.googleSignIn}</Text></Pressable> : children}{hint && <Text style={googleStyles.hint}>{hint}</Text>}</View>;
}
export const googleStyles = StyleSheet.create({
  group:{gap:10,marginTop:8}, divider:{flexDirection:'row',gap:12,alignItems:'center'},rule:{flex:1,height:1,backgroundColor:'#789E7F'},hint:{color:'#E0EBDA',fontSize:12,lineHeight:18,textAlign:'center'},button:{minHeight:48,width:'100%',borderRadius:24,borderWidth:1,borderColor:'#DADCE0',backgroundColor:'#FFF',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:12,paddingHorizontal:14,paddingVertical:10},g:{color:'#4285F4',fontSize:23,fontWeight:'800'},text:{fontSize:14,fontWeight:'600',color:'#3C4043'},
});
