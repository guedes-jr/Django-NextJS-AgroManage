"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, X } from "lucide-react";

export function SupportAccessBanner(){
 const router=useRouter();
 const [context]=useState<{organization_name:string;expires_at:string}|null>(()=>{if(typeof window==="undefined")return null;try{return JSON.parse(localStorage.getItem("support_context")||"null");}catch{return null;}});
 if(!context)return null;
 const exit=()=>{localStorage.removeItem("support_access_token");localStorage.removeItem("support_context");router.push("/platform/organizations");};
 return <div className="d-flex align-items-center justify-content-between px-3 py-2 text-white" style={{background:"#b45309",position:"sticky",top:0,zIndex:1000}}><div className="d-flex align-items-center gap-2 small"><Eye size={17}/><strong>Acesso assistido somente leitura:</strong><span>{context.organization_name}</span><span className="opacity-75">até {new Date(context.expires_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span></div><button className="btn btn-sm btn-light d-flex gap-1 align-items-center" onClick={exit}><X size={14}/>Encerrar</button></div>;
}
