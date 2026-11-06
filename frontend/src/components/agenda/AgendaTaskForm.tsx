"use client";
import { useOrganizationLocale } from "@/lib/locale";
import Link from "next/link";
import {useEffect,useState} from "react";
import {X,MessageCircle,CalendarPlus} from "lucide-react";
import {agendaTaskService,type AgendaTask,type AgendaTaskOptions} from "@/services/organizationAgendaService";
import {financeError,type NamedOption} from "@/services/financeService";
import styles from "@/app/home/agenda/page.module.css";
const reminderLocal=(value:string)=>{const date=new Date(value);return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date).replace(' ','T');};
export function AgendaTaskForm({id,date,farms,onClose,onSaved}:{id?:string;date:string;farms:NamedOption[];onClose:()=>void;onSaved:()=>void}) {
  const { language, t } = useOrganizationLocale();
  const statuses:Record<string,string>={pending:t("workspace.queuedForSending"),sent:t("workspace.sent"),failed:t("workspace.sendingFailed"),skipped:t("workspace.sendingSuspended"),unknown:t("workspace.resultPendingConfirmation")};
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
    }).catch(e=>{if(active)setError(financeError(e, language));}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[id,date, language]);
  const own=!task||task.created_by===options?.user_id;
  const editable=!!options&&!options.read_only&&(own||["admin","manager"].includes(options.role));
  const terminal=!!task&&["done","cancelled"].includes(task.status);
  return <div className={styles.overlay} onClick={()=>{if(!busy)onClose();}} onKeyDown={e=>{if(e.key==="Escape"&&!busy)onClose();}}><section role="dialog" aria-modal="true" aria-labelledby="task-form-title" className={`${styles.detail} ${styles.holidayManager}`} onClick={e=>e.stopPropagation()}><button autoFocus aria-label={t("workspace.closeEvent")} disabled={busy} className={styles.close} onClick={onClose}><X size={20}/></button><span className={styles.eyebrow}>{t("workspace.organizationAgenda")}</span><h2 id="task-form-title" className="h4"><CalendarPlus size={22}/> {id?t("workspace.eventDetails"):t("workspace.newEventOrAppointment")}</h2>
    {error&&<div role="alert" className="alert alert-danger py-2">{error}</div>}
    {loading?<p role="status">{t("inventory.adjustment.loading")}</p>:options&&task?.operational_link?<div><h3 className="h5">{task.title}</h3><p>{task.description}</p><p className="small text-muted">{t("workspace.thisActivityBelongsToACattleRoutineRecordItsExecution")}</p><Link className="btn btn-success" href={task.operational_link}>{t("workspace.openManagementCenter")}</Link></div>:options&&<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{
      const payload={title,description,event_kind:kind,due_date:day,start_time:start||null,end_time:end||null,location,farm:farm||null,status,priority,...(own?{whatsapp_remind_at:reminder?(task?.whatsapp_remind_at&&remindAt===reminderLocal(task.whatsapp_remind_at)?task.whatsapp_remind_at:new Date(`${remindAt}:00-03:00`).toISOString()):null}:{})};
      if(id)await agendaTaskService.update(id,payload);else await agendaTaskService.create(payload);
      onSaved();
    }catch(e){setError(financeError(e, language));}finally{setBusy(false);}}}>
      <fieldset disabled={busy||terminal||!editable} className="border-0 p-0 m-0">
      <label className="d-block mb-3">{t("workspace.title")}<input required maxLength={255} className="form-control mt-1" value={title} onChange={e=>setTitle(e.target.value)} placeholder={t("workspace.eGVeterinarianVisit")}/></label>
      <div className="row g-3 mb-3"><label className="col-sm-6">{t("plantations.labor.workerType")}<select className="form-select mt-1" value={kind} onChange={e=>setKind(e.target.value)}><option value="appointment">{t("workspace.appointment")}</option><option value="event">{t("workspace.event")}</option><option value="task">{t("workspace.task")}</option></select></label><label className="col-sm-6">{t("lotReport.date")}<input required type="date" className="form-control mt-1" value={day} onChange={e=>setDay(e.target.value)}/></label><label className="col-sm-6">{t("workspace.startTime")}<input type="time" className="form-control mt-1" value={start} onChange={e=>setStart(e.target.value)}/></label><label className="col-sm-6">{t("workspace.endTime")}<input type="time" className="form-control mt-1" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
      <p className="small text-muted">{t("workspace.noTimeAllDayEventTimesUseBrasLiaTime")}</p>
      <label className="d-block mb-3">{t("dairy.home.farm")}<select className="form-select mt-1" value={farm} onChange={e=>setFarm(e.target.value)}><option value="">{t("workspace.organizationNoFarm")}</option>{farms.map(farm=><option key={farm.id} value={farm.id}>{farm.name}</option>)}</select></label>
      <label className="d-block mb-3">{t("workspace.location")}<input maxLength={255} className="form-control mt-1" value={location} onChange={e=>setLocation(e.target.value)} placeholder={t("workspace.eGFarmOffice")}/></label>
      <label className="d-block mb-3">{t("lotReport.description")}<textarea rows={3} className="form-control mt-1" value={description} onChange={e=>setDescription(e.target.value)}/></label>
      <div className="row g-3 mb-3"><label className="col-sm-6">{t("structure.dedicated.status")}<select className="form-select mt-1" value={status} onChange={e=>setStatus(e.target.value)}><option value="open">{t("workspace.open")}</option><option value="in_progress">{t("operator.inProgress")}</option><option value="done">{t("workspace.completed")}</option><option value="cancelled">{t("workspace.cancelled")}</option></select></label><label className="col-sm-6">{t("notifications.priority")}<select className="form-select mt-1" value={priority} onChange={e=>setPriority(e.target.value)}><option value="low">{t("clinical.low")}</option><option value="medium">{t("animalDetail.normal")}</option><option value="high">{t("clinical.high")}</option><option value="critical">{t("clinical.critical")}</option></select></label></div>
      <div className={styles.reminderBox}><label className="d-flex align-items-center gap-2"><input type="checkbox" disabled={!own||(!options.whatsapp_contact_ready&&!reminder)} checked={reminder} onChange={e=>setReminder(e.target.checked)}/><MessageCircle size={18}/>  {t("workspace.remindMeOnWhatsapp")}</label><p className="small text-muted mt-2 mb-0">{t("workspace.theReminderGoesToTheEventCreatorSAuthorizedContact")}</p>
      {!options.whatsapp_contact_ready&&<p className="small text-warning mt-2 mb-0">{t("workspace.toEnableThisRegisterAValidWhatsappNumberAndAuthorize")}</p>}
      {(!options.whatsapp_configured||!options.channel_enabled)&&<p className="small text-warning mt-2 mb-0">{t("workspace.sendingRequiresAWhatsappConnectionAndTheAgendaCategoryEnabled")}</p>}
      {reminder&&<label className="d-block mt-3">{t("workspace.whenToSendTheReminder")}<input required disabled={!own} type="datetime-local" className="form-control mt-1" value={remindAt} onChange={e=>setRemindAt(e.target.value)}/></label>}
      {task?.whatsapp_remind_at&&<p className="small fw-semibold mt-2 mb-0">{terminal?t("workspace.reminderDisabledEventClosed"):task.reminder_status?statuses[task.reminder_status]||task.reminder_status:t("workspace.scheduleRecordedAwaitingProcessing")}</p>}
      </div>
      <button className="btn btn-success mt-3" disabled={!title.trim()}>{busy?t("users.saving"):id?t("users.saveChanges"):t("workspace.createEvent")}</button>
      </fieldset>{terminal&&<p className="small text-muted mt-3">{t("workspace.eventCompletedOrCancelled")}</p>}
    </form>}
  </section></div>;
}
