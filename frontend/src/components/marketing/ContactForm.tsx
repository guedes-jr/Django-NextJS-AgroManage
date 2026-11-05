"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, MessageCircle } from "lucide-react";
import { usePublicLocale } from "@/lib/publicLocale";

export function ContactForm() {
  const { language, t } = usePublicLocale();
  const [sent,setSent]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const [plan,setPlan]=useState(""),[slots,setSlots]=useState<string[]>([]),[selectedSlot,setSelectedSlot]=useState("");

  useEffect(()=>{
    const timer=window.setTimeout(()=>setPlan(new URLSearchParams(window.location.search).get("plano")||""),0);
    fetch("/api/v1/public/demo-availability/").then(response=>response.ok?response.json():Promise.reject()).then((data:{slots:string[]})=>setSlots(data.slots)).catch(()=>setSlots([]));
    return()=>window.clearTimeout(timer);
  },[]);

  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();const form=event.currentTarget;const data=new FormData(form);const params=new URLSearchParams(window.location.search);
    setLoading(true);setError("");setSent(false);
    try{
      const response=await fetch("/api/v1/public/demo-requests/",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:String(data.get("name")),email:String(data.get("email")),phone:String(data.get("phone")),organization_name:String(data.get("organization")),operation_profile:String(data.get("profile")),message:String(data.get("message")),selected_plan:plan,preferred_demo_at:selectedSlot||null,landing_path:window.location.pathname,utm_source:params.get("utm_source")||"",utm_medium:params.get("utm_medium")||"",utm_campaign:params.get("utm_campaign")||"",ab_variant:localStorage.getItem("agromanage_lp_variant")||"control"})});
      if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(response.status===429?t("contact.rateLimit"):Object.values(body).flat().join(" ")||t("contact.sendFailed"));}
      setSent(true);form.reset();setSelectedSlot("");window.gtag?.("event","generate_lead",{event_category:"contact",selected_plan:plan});
    }catch(requestError){setError(requestError instanceof Error?requestError.message:t("contact.sendFailed"));}
    finally{setLoading(false);}
  };

  return <form className="contact-form" onSubmit={submit}>
    {sent&&<div className="contact-success" role="status"><CheckCircle2 size={18}/> {t("contact.success")}</div>}
    {error&&<div className="contact-error" role="alert">{error}</div>}
    <div className="form-grid">
      <label><span>{t("contact.name")}</span><input name="name" required autoComplete="name" placeholder={t("contact.namePlaceholder")}/></label>
      <label><span>{t("contact.email")}</span><input name="email" type="email" required autoComplete="email" placeholder={t("contact.emailPlaceholder")}/></label>
      <label><span>{t("contact.phone")}</span><input name="phone" required autoComplete="tel" placeholder={t("contact.phonePlaceholder")}/></label>
      <label><span>{t("contact.organization")}</span><input name="organization" required placeholder={t("contact.organizationPlaceholder")}/></label>
      <label className="full"><span>{t("contact.plan")}</span><select value={plan} onChange={event=>setPlan(event.target.value)}><option value="">{t("contact.unknownPlan")}</option><option value="essencial">{t("contact.planEssential")}</option><option value="profissional">{t("contact.planProfessional")}</option><option value="gestao-plus">{t("contact.planPlus")}</option></select></label>
      <label className="full"><span>{t("contact.operationProfile")}</span><select name="profile" defaultValue="" required><option value="" disabled>{t("contact.selectOption")}</option><option value="Produção agrícola">{t("contact.agriculture")}</option><option value="Pecuária">{t("contact.livestock")}</option><option value="Operação mista">{t("contact.mixed")}</option><option value="Grupo com várias fazendas">{t("contact.multifarm")}</option><option value="Outro">{t("contact.other")}</option></select></label>
      <label className="full"><span><CalendarDays size={15}/> {t("contact.preferredTime")}</span><select value={selectedSlot} onChange={event=>setSelectedSlot(event.target.value)}><option value="">{t("contact.scheduleLater")}</option>{slots.map(slot=><option value={slot} key={slot}>{new Date(slot).toLocaleString(language,{dateStyle:"full",timeStyle:"short"})}</option>)}</select></label>
      <label className="full"><span>{t("contact.message")}</span><textarea name="message" rows={5} required minLength={10} maxLength={3000} placeholder={t("contact.messagePlaceholder")}/></label>
    </div>
    <label className="contact-consent"><input type="checkbox" required/> <span>{t("contact.consent")}</span></label>
    <button className="marketing-button primary" type="submit" disabled={loading}>{loading?t("contact.sending"):t("contact.send")} {!loading&&<ArrowRight size={17}/>}</button>
    {process.env.NEXT_PUBLIC_WHATSAPP_NUMBER&&<a className="marketing-button whatsapp" href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER}?text=${encodeURIComponent(t("contact.whatsappMessage"))}`} target="_blank" rel="noreferrer"><MessageCircle size={17}/> {t("contact.whatsapp")}</a>}
    <small>{t("contact.supportNote")}</small>
  </form>;
}
