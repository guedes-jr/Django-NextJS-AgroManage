"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Handshake, Lock, Mail } from "lucide-react";
import { apiClient } from "@/services/api";
import styles from "./page.module.css";

const extractError = (error: unknown) => {
  const response = error as { response?: { data?: { detail?: string; non_field_errors?: string[] } } };
  return response.response?.data?.detail
    || response.response?.data?.non_field_errors?.[0]
    || "Não foi possível entrar. Confira suas credenciais.";
};

export default function AffiliateLoginPage(){
  const router=useRouter();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const submit=async(event:FormEvent)=>{event.preventDefault();setLoading(true);setError("");try{const {data}=await apiClient.post("/affiliates/auth/login/",{email,password});localStorage.setItem("access_token",data.access);localStorage.setItem("refresh_token",data.refresh);localStorage.setItem("affiliate_user",JSON.stringify(data.user));localStorage.setItem("affiliate_profile",JSON.stringify(data.affiliate));router.replace("/afiliados/painel");}catch(value){setError(extractError(value));}finally{setLoading(false);}};
  return <main className={styles.root}><section className={styles.card}><div className={styles.brand}><span><Handshake size={25}/></span><div><strong>Portal do Afiliado</strong><small>Gestão Agro</small></div></div><div className={styles.heading}><h1>Acesse sua conta</h1><p>Acompanhe indicações, conversões e comissões.</p></div>{error&&<div className="alert alert-danger py-2 small">{error}</div>}<form onSubmit={submit} className={styles.form}><label>E-mail<div className={styles.input}><Mail size={18}/><input type="email" autoComplete="email" required value={email} onChange={event=>setEmail(event.target.value)} placeholder="vendedor@exemplo.com"/></div></label><label>Senha<div className={styles.input}><Lock size={18}/><input type="password" autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)} placeholder="Sua senha"/></div></label><button disabled={loading}>{loading?<span className="spinner-border spinner-border-sm"/>:"Entrar no portal"}</button></form><p className={styles.help}>Problemas com o acesso? Entre em contato com o administrador da plataforma.</p></section></main>;
}
