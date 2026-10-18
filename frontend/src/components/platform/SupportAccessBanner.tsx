"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, X } from "lucide-react";
import { platformService } from "@/services/platformApi";
import { useToast } from "@/components/ui/Toast";

export function SupportAccessBanner(){
 const router=useRouter();
 const {showToast}=useToast();
 const [closing,setClosing]=useState(false);
 const [context]=useState<{id:string;organization_name:string;expires_at:string}|null>(()=>{if(typeof window==="undefined")return null;try{return JSON.parse(localStorage.getItem("support_context")||"null");}catch{return null;}});
 if(!context)return null;
 const exit=async()=>{
  setClosing(true);
  try {
   await platformService.revokeSupportAccess(context.id);
   localStorage.removeItem("support_access_token");
   localStorage.removeItem("support_context");
   localStorage.removeItem("user");
   router.push("/platform/organizations");
  } catch {showToast("Não foi possível encerrar o acesso. Tente novamente.","error");}
  finally {setClosing(false);}
 };
 return <div className="d-flex align-items-center justify-content-between px-3 py-2 text-white" style={{background:"#b45309",position:"sticky",top:0,zIndex:1000}}><div className="d-flex align-items-center gap-2 small"><Eye size={17}/><strong>Acesso assistido completo:</strong><span>{context.organization_name}</span><span className="opacity-75">até {new Date(context.expires_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span></div><button className="btn btn-sm btn-light d-flex gap-1 align-items-center" onClick={exit} disabled={closing}><X size={14}/>{closing?"Encerrando...":"Encerrar"}</button></div>;
}
