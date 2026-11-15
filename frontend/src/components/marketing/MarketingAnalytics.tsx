"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useReportWebVitals } from "next/web-vitals";

const metaPixelId = "1057606317278974";
const googleTagManagerId = "GTM-THDQ3ZBW";

const createSessionId = () => {
  const bytes = new Uint8Array(16);

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  // RFC 4122 version 4 variant. This identifier is only used to group
  // anonymous marketing events; it is not an authentication token.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
};

const getSession = () => {
  const key="agromanage_marketing_session";
  let value=sessionStorage.getItem(key);
  if(!value){value=createSessionId();sessionStorage.setItem(key,value);}
  return value;
};

const getVariant = () => {
  const key="agromanage_lp_variant";
  let value=localStorage.getItem(key);
  if(!value){value=Math.random()<.5?"control":"cta_clarity";localStorage.setItem(key,value);}
  return value;
};

function sendInternalEvent(event_name:string,value?:number,metadata:Record<string,unknown>={}){
  const params=new URLSearchParams(window.location.search);
  void fetch("/api/v1/public/events/",{method:"POST",headers:{"Content-Type":"application/json"},keepalive:true,body:JSON.stringify({event_name,session_id:getSession(),path:window.location.pathname,variant:getVariant(),utm_source:params.get("utm_source")||"",utm_medium:params.get("utm_medium")||"",utm_campaign:params.get("utm_campaign")||"",value,metadata})}).catch(()=>undefined);
}

export function MarketingAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const pathname = usePathname();
  const hasMounted = useRef(false);
  useReportWebVitals(metric=>sendInternalEvent(`web_vital.${metric.name.toLowerCase()}`,metric.value,{rating:metric.rating,id:metric.id}));

  useEffect(() => {
    const main=document.querySelector("main");
    if(main&&!main.id){main.id="marketing-main";main.setAttribute("tabindex","-1");}
    const click = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a");
      if (!link) return;
      const isCta = link.classList.contains("marketing-button") || link.href.includes("/contato");
      if (isCta) { const metadata={link_text:link.textContent?.trim(),link_url:link.href}; window.gtag?.("event", "cta_click", metadata); sendInternalEvent("cta_click",undefined,metadata); }
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, []);

  useEffect(() => {
    const variant = getVariant();
    document.documentElement.dataset.marketingVariant = variant;
    if (hasMounted.current) window.fbq?.("track", "PageView");
    else hasMounted.current = true;
    window.gtag?.("event", "page_view", { page_path: pathname, variant });
    sendInternalEvent("page_view");
  }, [pathname]);

  return <>
    <Script id="meta-pixel" strategy="afterInteractive">{`
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', '${metaPixelId}');
      fbq('track', 'PageView');
    `}</Script>
    <Script id="google-tag-manager" strategy="afterInteractive">{`
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function(){window.dataLayer.push(arguments);};
      window.gtag('js', new Date());
      window.dataLayer.push({'gtm.start': new Date().getTime(), event:'gtm.js'});
      (function(d,s,i){
        var firstScript = d.getElementsByTagName(s)[0];
        var script = d.createElement(s);
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtm.js?id=' + i;
        firstScript.parentNode.insertBefore(script, firstScript);
      })(document, 'script', '${googleTagManagerId}');
    `}</Script>
    <noscript
      dangerouslySetInnerHTML={{
        __html: `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1" alt="" />`,
      }}
    />
    {measurementId && <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script id="agromanage-analytics" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        window.gtag = function(){window.dataLayer.push(arguments);};
        window.gtag('js', new Date());
        window.gtag('config', '${measurementId}', { send_page_view: false });
      `}</Script>
    </>}
  </>;
}
