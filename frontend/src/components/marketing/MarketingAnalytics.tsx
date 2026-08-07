"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";

const getSession = () => {
  const key="agromanage_marketing_session";
  let value=sessionStorage.getItem(key);
  if(!value){value=crypto.randomUUID();sessionStorage.setItem(key,value);}
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

  useEffect(() => { const variant=getVariant();document.documentElement.dataset.marketingVariant=variant;window.gtag?.("event", "page_view", { page_path: pathname,variant });sendInternalEvent("page_view"); }, [pathname]);
  if (!measurementId) return null;

  return <>
    <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
    <Script id="agromanage-analytics" strategy="afterInteractive">{`
      window.dataLayer = window.dataLayer || [];
      window.gtag = function(){dataLayer.push(arguments);};
      gtag('js', new Date());
      gtag('config', '${measurementId}', { send_page_view: false });
    `}</Script>
  </>;
}
