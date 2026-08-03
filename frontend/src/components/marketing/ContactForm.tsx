"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export function ContactForm() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setLoading(true); setError(""); setSent(false);
    try {
      const response = await fetch("/api/v1/public/demo-requests/", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ name:String(data.get("name")), email:String(data.get("email")), phone:String(data.get("phone")), organization_name:String(data.get("organization")), operation_profile:String(data.get("profile")), message:String(data.get("message")) }) });
      if (!response.ok) throw new Error(response.status === 429 ? "Muitas solicitações. Tente novamente mais tarde." : "Não foi possível enviar a solicitação.");
      setSent(true); form.reset();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Não foi possível enviar a solicitação."); }
    finally { setLoading(false); }
  };
  return <form className="contact-form" onSubmit={submit}>
    {sent && <div className="contact-success"><CheckCircle2 size={18}/> Solicitação enviada para análise da equipe AgroManage.</div>}
    {error && <div className="contact-error">{error}</div>}
    <div className="form-grid"><label><span>Nome</span><input name="name" required autoComplete="name" placeholder="Como podemos chamar você?"/></label><label><span>E-mail profissional</span><input name="email" type="email" required autoComplete="email" placeholder="voce@empresa.com"/></label><label><span>Telefone</span><input name="phone" required autoComplete="tel" placeholder="(00) 00000-0000"/></label><label><span>Organização ou propriedade</span><input name="organization" required placeholder="Nome da sua operação"/></label><label className="full"><span>Perfil da operação</span><select name="profile" defaultValue=""><option value="" disabled>Selecione uma opção</option><option>Produção agrícola</option><option>Pecuária</option><option>Operação mista</option><option>Grupo com várias fazendas</option><option>Outro</option></select></label><label className="full"><span>O que você deseja organizar?</span><textarea name="message" rows={5} required placeholder="Conte brevemente seus principais desafios de gestão."/></label></div>
    <label className="contact-consent"><input type="checkbox" required/> <span>Concordo em fornecer estes dados para que a equipe AgroManage entre em contato.</span></label>
    <button className="marketing-button primary" type="submit" disabled={loading}>{loading ? "Enviando..." : "Enviar solicitação"} {!loading && <ArrowRight size={17}/>}</button>
    <small>A solicitação ficará disponível para análise na Central da Plataforma.</small>
  </form>;
}
