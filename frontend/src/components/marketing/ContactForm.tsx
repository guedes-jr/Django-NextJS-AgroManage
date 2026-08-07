"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, MessageCircle } from "lucide-react";

export function ContactForm() {
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
      if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(response.status===429?"Muitas solicitações. Tente novamente mais tarde.":Object.values(body).flat().join(" ")||"Não foi possível enviar a solicitação.");}
      setSent(true);form.reset();setSelectedSlot("");window.gtag?.("event","generate_lead",{event_category:"contact",selected_plan:plan});
    }catch(requestError){setError(requestError instanceof Error?requestError.message:"Não foi possível enviar a solicitação.");}
    finally{setLoading(false);}
  };

  return <form className="contact-form" onSubmit={submit}>
    {sent&&<div className="contact-success" role="status"><CheckCircle2 size={18}/> Solicitação enviada. O horário escolhido ficará reservado para confirmação da equipe.</div>}
    {error&&<div className="contact-error" role="alert">{error}</div>}
    <div className="form-grid">
      <label><span>Nome</span><input name="name" required autoComplete="name" placeholder="Como podemos chamar você?"/></label>
      <label><span>E-mail profissional</span><input name="email" type="email" required autoComplete="email" placeholder="voce@empresa.com"/></label>
      <label><span>Telefone</span><input name="phone" required autoComplete="tel" placeholder="(00) 00000-0000"/></label>
      <label><span>Organização ou propriedade</span><input name="organization" required placeholder="Nome da sua operação"/></label>
      <label className="full"><span>Plano de interesse</span><select value={plan} onChange={event=>setPlan(event.target.value)}><option value="">Ainda não sei</option><option value="essencial">Essencial</option><option value="profissional">Profissional</option><option value="gestao-plus">Gestão Plus</option></select></label>
      <label className="full"><span>Perfil da operação</span><select name="profile" defaultValue="" required><option value="" disabled>Selecione uma opção</option><option>Produção agrícola</option><option>Pecuária</option><option>Operação mista</option><option>Grupo com várias fazendas</option><option>Outro</option></select></label>
      <label className="full"><span><CalendarDays size={15}/> Horário preferido para a demonstração</span><select value={selectedSlot} onChange={event=>setSelectedSlot(event.target.value)}><option value="">Prefiro combinar depois</option>{slots.map(slot=><option value={slot} key={slot}>{new Date(slot).toLocaleString("pt-BR",{dateStyle:"full",timeStyle:"short"})}</option>)}</select></label>
      <label className="full"><span>O que você deseja organizar?</span><textarea name="message" rows={5} required minLength={10} maxLength={3000} placeholder="Conte brevemente seus principais desafios de gestão."/></label>
    </div>
    <label className="contact-consent"><input type="checkbox" required/> <span>Concordo em fornecer estes dados para que a equipe AgroManage entre em contato.</span></label>
    <button className="marketing-button primary" type="submit" disabled={loading}>{loading?"Enviando...":"Enviar solicitação"} {!loading&&<ArrowRight size={17}/>}</button>
    {process.env.NEXT_PUBLIC_WHATSAPP_NUMBER&&<a className="marketing-button whatsapp" href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER}?text=${encodeURIComponent("Olá! Quero conhecer o AgroManage.")}`} target="_blank" rel="noreferrer"><MessageCircle size={17}/> Falar pelo WhatsApp</a>}
    <small>A solicitação ficará disponível para análise na Central da Plataforma.</small>
  </form>;
}
