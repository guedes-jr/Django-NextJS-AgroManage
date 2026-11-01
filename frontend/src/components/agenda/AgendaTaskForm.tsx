"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {X,MessageCircle,CalendarPlus} from "lucide-react";
import {agendaTaskService,type AgendaTask,type AgendaTaskOptions} from "@/services/organizationAgendaService";
import {financeError,type NamedOption} from "@/services/financeService";
import styles from "@/app/home/agenda/page.module.css";
const reminderLocal=(value:string)=>{const date=new Date(value);return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date).replace(' ','T');};
const statuses:Record<string,string>={pending:"Na fila de envio",sent:"Enviado",failed:"Falha no envio",skipped:"Envio suspenso",unknown:"Resultado a confirmar"};
export function AgendaTaskForm({id,date,farms,onClose,onSaved}:{id?:string;date:string;farms:NamedOption[];onClose:()=>void;onSaved:()=>void}) {
  const [task,setTask]=useState<AgendaTask|null>(null);
  const [options,setOptions]=useState<AgendaTaskOptions|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [title,setTitle]=useState("");
  const [description,setDescription]=useState("");
  const [kind,setKind]=useState("appointment");
  const [day,setDay]=useState(date);
  const [start,setStart]=useState("");
  const [end,setEnd]=useState("");
  const [location,setLocation]=useState("");
  const [farm,setFarm]=useState("");
  const [status,setStatus]=useState("open");
  const [priority,setPriority]=useState("medium");
  const [reminder,setReminder]=useState(false);
  const [remindAt,setRemindAt]=useState("");
  useEffect(()=>{
    let active=true;
    Promise.all([agendaTaskService.options(),id?agendaTaskService.detail(id):Promise.resolve(null)]).then(([options,task])=>{
      if(!active)return;
      setOptions(options);setTask(task);
      if(task){setTitle(task.title);setDescription(task.description);setKind(task.event_kind);setDay(task.due_date||date);setStart(task.start_time?.slice(0,5)||"");setEnd(task.end_time?.slice(0,5)||"");setLocation(task.location);setFarm(task.farm||"");setStatus(task.status);setPriority(task.priority);setReminder(!!task.whatsapp_remind_at);setRemindAt(task.whatsapp_remind_at?reminderLocal(task.whatsapp_remind_at):"");}
    }).catch(e=>{if(active)setError(financeError(e));}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[id,date]);
  const own=!task||task.created_by===options?.user_id;
  const editable=!!options&&!options.read_only&&(own||["admin","manager"].includes(options.role));
  const terminal=!!task&&["done","cancelled"].includes(task.status);
  return <div className={styles.overlay} onClick={()=>{if(!busy)onClose();}} onKeyDown={e=>{if(e.key==="Escape"&&!busy)onClose();}}><section role="dialog" aria-modal="true" aria-labelledby="task-form-title" className={`${styles.detail} ${styles.holidayManager}`} onClick={e=>e.stopPropagation()}><button autoFocus aria-label="Fechar evento" disabled={busy} className={styles.close} onClick={onClose}><X size={20}/></button><span className={styles.eyebrow}>AGENDA DA ORGANIZAÇÃO</span><h2 id="task-form-title" className="h4"><CalendarPlus size={22}/> {id?"Detalhes do evento":"Novo evento ou compromisso"}</h2>
    {error&&<div role="alert" className="alert alert-danger py-2">{error}</div>}
    {loading?<p role="status">Carregando…</p>:options&&task?.operational_link?<div><h3 className="h5">{task.title}</h3><p>{task.description}</p><p className="small text-muted">Esta atividade pertence a uma rotina bovina. Registre sua execução na origem para manter o histórico e os efeitos integrados.</p><Link className="btn btn-success" href={task.operational_link}>Abrir Central de manejo</Link></div>:options&&<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{
      const payload={title,description,event_kind:kind,due_date:day,start_time:start||null,end_time:end||null,location,farm:farm||null,status,priority,...(own?{whatsapp_remind_at:reminder?(task?.whatsapp_remind_at&&remindAt===reminderLocal(task.whatsapp_remind_at)?task.whatsapp_remind_at:new Date(`${remindAt}:00-03:00`).toISOString()):null}:{})};
      if(id)await agendaTaskService.update(id,payload);else await agendaTaskService.create(payload);
      onSaved();
    }catch(e){setError(financeError(e));}finally{setBusy(false);}}}>
      <fieldset disabled={busy||terminal||!editable} className="border-0 p-0 m-0">
      <label className="d-block mb-3">Título<input required maxLength={255} className="form-control mt-1" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Visita do veterinário"/></label>
      <div className="row g-3 mb-3"><label className="col-sm-6">Tipo<select className="form-select mt-1" value={kind} onChange={e=>setKind(e.target.value)}><option value="appointment">Compromisso</option><option value="event">Evento</option><option value="task">Tarefa</option></select></label><label className="col-sm-6">Data<input required type="date" className="form-control mt-1" value={day} onChange={e=>setDay(e.target.value)}/></label><label className="col-sm-6">Horário inicial<input type="time" className="form-control mt-1" value={start} onChange={e=>setStart(e.target.value)}/></label><label className="col-sm-6">Horário final<input type="time" className="form-control mt-1" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
      <p className="small text-muted">Sem horário: evento de dia inteiro. Horários de Brasília (UTC−3).</p>
      <label className="d-block mb-3">Fazenda<select className="form-select mt-1" value={farm} onChange={e=>setFarm(e.target.value)}><option value="">Organização (sem fazenda)</option>{farms.map(farm=><option key={farm.id} value={farm.id}>{farm.name}</option>)}</select></label>
      <label className="d-block mb-3">Local<input maxLength={255} className="form-control mt-1" value={location} onChange={e=>setLocation(e.target.value)} placeholder="Ex.: Escritório da fazenda"/></label>
      <label className="d-block mb-3">Descrição<textarea rows={3} className="form-control mt-1" value={description} onChange={e=>setDescription(e.target.value)}/></label>
      <div className="row g-3 mb-3"><label className="col-sm-6">Situação<select className="form-select mt-1" value={status} onChange={e=>setStatus(e.target.value)}><option value="open">Aberto</option><option value="in_progress">Em andamento</option><option value="done">Concluído</option><option value="cancelled">Cancelado</option></select></label><label className="col-sm-6">Prioridade<select className="form-select mt-1" value={priority} onChange={e=>setPriority(e.target.value)}><option value="low">Baixa</option><option value="medium">Normal</option><option value="high">Alta</option><option value="critical">Crítica</option></select></label></div>
      <div className={styles.reminderBox}><label className="d-flex align-items-center gap-2"><input type="checkbox" disabled={!own||(!options.whatsapp_contact_ready&&!reminder)} checked={reminder} onChange={e=>setReminder(e.target.checked)}/><MessageCircle size={18}/> Lembrar pelo meu WhatsApp</label><p className="small text-muted mt-2 mb-0">O lembrete vai para o contato autorizado do criador deste evento. Nenhuma mensagem é enviada ao salvar.</p>
      {!options.whatsapp_contact_ready&&<p className="small text-warning mt-2 mb-0">Para ativar, cadastre um telefone válido como WhatsApp e autorize os alertas no seu perfil.</p>}
      {(!options.whatsapp_configured||!options.channel_enabled)&&<p className="small text-warning mt-2 mb-0">O envio depende da conexão do WhatsApp e da categoria Agenda habilitada nas notificações da plataforma.</p>}
      {reminder&&<label className="d-block mt-3">Quando enviar o lembrete<input required disabled={!own} type="datetime-local" className="form-control mt-1" value={remindAt} onChange={e=>setRemindAt(e.target.value)}/></label>}
      {task?.whatsapp_remind_at&&<p className="small fw-semibold mt-2 mb-0">{terminal?"Lembrete desativado: evento encerrado.":task.reminder_status?statuses[task.reminder_status]||task.reminder_status:"Agendamento registrado; aguardando processamento"}</p>}
      </div>
      <button className="btn btn-success mt-3" disabled={!title.trim()}>{busy?"Salvando…":id?"Salvar alterações":"Cadastrar evento"}</button>
      </fieldset>{terminal&&<p className="small text-muted mt-3">Evento concluído ou cancelado.</p>}
    </form>}
  </section></div>;
}
