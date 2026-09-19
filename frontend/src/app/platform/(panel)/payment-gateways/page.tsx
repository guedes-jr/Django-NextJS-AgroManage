"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CreditCard, Eye, EyeOff, KeyRound, Save, ShieldCheck, Star } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
import { platformService } from "@/services/platformApi";
import type { PlatformPaymentGateway } from "@/types/platform";

const fieldLabels:Record<string,string> = {client_id:"Client ID",client_secret:"Client Secret",certificate_pem:"Certificado público PEM",private_key_pem:"Chave privada PEM",webhook_secret:"Segredo HMAC do webhook"};

export default function PaymentGatewaysPage(){
  const {showToast}=useToast();
  const [gateways,setGateways]=useState<PlatformPaymentGateway[]>([]);
  const [loading,setLoading]=useState(true);
  const load=useCallback(()=>platformService.paymentGateways().then(setGateways).catch(()=>showToast("Não foi possível carregar os gateways.","error")).finally(()=>setLoading(false)),[showToast]);
  useEffect(()=>{void load();},[load]);
  if(loading)return <div className="spinner-border text-success"/>;
  return <><div className="mb-4"><div className="platform-label mb-2">Cobranças e pagamentos</div><h1 className="h2 fw-bold mb-1">Gateways de pagamento</h1><p className="text-muted mb-0">Configure credenciais e escolha o provedor padrão sem alterar o fluxo de cobrança.</p></div><div className="row g-4">{gateways.map(gateway=><GatewayCard gateway={gateway} onSaved={next=>setGateways(current=>current.map(item=>item.id===next.id?next:{...item,is_default:next.is_default?false:item.is_default}))} key={gateway.id}/>)}</div>{!gateways.length&&<div className="platform-card p-5 text-center text-muted">Nenhum adaptador de pagamento registrado.</div>}</>;
}

function GatewayCard({gateway,onSaved}:{gateway:PlatformPaymentGateway;onSaved:(gateway:PlatformPaymentGateway)=>void}){
  const {showToast}=useToast();
  const [environment,setEnvironment]=useState(gateway.environment);
  const [credentials,setCredentials]=useState<Record<string,string>>({});
  const [pixKey,setPixKey]=useState(String(gateway.settings.pix_key||""));
  const [showSecrets,setShowSecrets]=useState(false);
  const [saving,setSaving]=useState(false);
  const save=async(payload:Parameters<typeof platformService.updatePaymentGateway>[1])=>{setSaving(true);try{const next=await platformService.updatePaymentGateway(gateway.id,payload);onSaved(next);setCredentials({});showToast("Gateway atualizado.","success");}catch{showToast("Não foi possível atualizar o gateway.","error");}finally{setSaving(false);}};
  return <div className="col-xl-6"><article className="platform-card p-4 h-100"><header className="d-flex justify-content-between gap-3 mb-4"><div className="d-flex gap-3"><span className="platform-icon"><CreditCard size={20}/></span><div><h2 className="h5 fw-bold mb-1">{gateway.display_name}</h2><code>{gateway.provider}</code></div></div>{gateway.is_default&&<span className="platform-status active align-self-start"><Star size={12}/> Padrão</span>}</header><div className="row g-3 mb-4"><div className="col-6"><div className="border rounded p-3 h-100"><KeyRound size={17}/><div className="small text-muted mt-2">Credenciais</div><strong className={gateway.credential_configured?"text-success":"text-danger"}>{gateway.credential_configured?"Configuradas":"Pendentes"}</strong></div></div><div className="col-6"><div className="border rounded p-3 h-100"><ShieldCheck size={17}/><div className="small text-muted mt-2">Métodos</div><strong>{gateway.supported_methods.join(", ")||"—"}</strong></div></div></div><label className="form-label small fw-semibold">Ambiente</label><select className="form-select mb-3" value={environment} onChange={event=>setEnvironment(event.target.value as "sandbox"|"production")}><option value="sandbox">Homologação</option><option value="production">Produção</option></select><label className="form-label small fw-semibold">Chave PIX recebedora</label><input className="form-control mb-3" value={pixKey} onChange={event=>setPixKey(event.target.value)} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"/><div className="d-flex justify-content-between align-items-center mb-2"><strong className="small">Credenciais protegidas</strong><button className="btn btn-sm btn-outline-secondary" onClick={()=>setShowSecrets(value=>!value)}>{showSecrets?<EyeOff size={14}/>:<Eye size={14}/>}</button></div>{gateway.credential_fields.map(field=><label className="d-block mb-2" key={field}><span className="small text-muted">{fieldLabels[field]||field}</span>{field.endsWith("_pem")?<textarea className="form-control mt-1" rows={3} value={credentials[field]||""} placeholder={gateway.credential_configured?"Configurado — preencha para substituir":"Cole o conteúdo PEM"} onChange={event=>setCredentials(current=>({...current,[field]:event.target.value}))}/>:<input className="form-control mt-1" type={showSecrets?"text":"password"} autoComplete="new-password" value={credentials[field]||""} placeholder={gateway.credential_configured?"Configurado — preencha para substituir":"Obrigatório"} onChange={event=>setCredentials(current=>({...current,[field]:event.target.value}))}/>}</label>)}<small className="text-muted d-block mb-3">Os valores são criptografados no servidor e nunca retornam ao navegador.</small><div className="d-flex flex-wrap gap-2"><button className="btn btn-success d-flex gap-2 align-items-center" disabled={saving} onClick={()=>save({environment,settings:{...gateway.settings,pix_key:pixKey},credentials:Object.fromEntries(Object.entries(credentials).filter(([,value])=>value.trim()))})}><Save size={15}/>Salvar</button><button className="btn btn-outline-secondary" disabled={saving||gateway.is_enabled} onClick={()=>save({is_enabled:true,environment})}><CheckCircle2 size={15}/> Habilitar</button><button className="btn btn-outline-dark" disabled={saving||gateway.is_default||!gateway.is_enabled||!gateway.credential_configured||!pixKey} onClick={()=>save({is_default:true,settings:{...gateway.settings,pix_key:pixKey}})}>Definir como padrão</button></div></article></div>;
}
