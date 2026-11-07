import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { View } from 'react-native';
import { AuthFailure } from '../../services/authApi';
import { useAuth } from './AuthProvider';
import { GoogleLoginFrame } from './GoogleLoginFrame';
import type { GoogleLoginProps } from './GoogleLoginProps';
type GoogleId = { initialize: (options:{client_id:string;callback:(response:{credential:string})=>void})=>void; renderButton:(target:HTMLElement,options:Record<string,string|number>)=>void };
export function GoogleLoginButton(props: GoogleLoginProps) {
  const { t, language } = useAuth();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const target = useRef<ComponentRef<typeof View>>(null);
  const current = useRef(props);
  const active = useRef(false);
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  useEffect(() => { current.current = props; }, [props]);
  useEffect(() => {
    if (!clientId) return;
    let mounted = true;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    script.onload = () => { if (!mounted) return; if ((window as Window & {google?:{accounts:{id:GoogleId}}}).google?.accounts.id) setReady(true); else setFailed(true); };
    script.onerror = () => { if (mounted) setFailed(true); };
    document.head.appendChild(script);
    return () => { mounted = false; script.remove(); };
  }, [clientId]);
  useEffect(() => {
    if (!ready || !clientId || !target.current) return;
    const id = (window as Window & {google?:{accounts:{id:GoogleId}}}).google?.accounts.id;
    if (!id) return;
    const element = target.current as unknown as HTMLElement;
    id.initialize({client_id:clientId,callback: response => {
      if (active.current || current.current.disabled) return;
      if (!response.credential) { current.current.onError(new AuthFailure('googleFailed')); return; }
      active.current = true; current.current.onBusyChange(true);
      void current.current.onCredential(response.credential).catch(error=>current.current.onError(error)).finally(()=>{active.current=false;current.current.onBusyChange(false);});
    }});
    id.renderButton(element,{type:'standard',theme:'outline',size:'large',shape:'pill',text:'signin_with',locale:language,width:Math.max(200,Math.min(390,Math.floor(element.getBoundingClientRect().width)))});
    return () => element.replaceChildren();
  }, [ready,clientId,language]);
  return <GoogleLoginFrame unavailable={!clientId || !ready || failed} hint={!clientId || failed ? t.googleConfiguration : !ready ? t.googleLoading : undefined}><View ref={target} style={{width:'100%',minHeight:44,opacity:props.disabled ? 0.6 : 1}} pointerEvents={props.disabled ? 'none' : 'auto'}/></GoogleLoginFrame>;
}
