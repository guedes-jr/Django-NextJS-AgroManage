"use client";
import { useOrganizationLocale } from "@/lib/locale";
import {useEffect,useState} from "react";
import {X,Plus,Download,CalendarDays} from "lucide-react";
import {holidayService,type Holiday,type NationalHoliday} from "@/services/organizationAgendaService";
import {financeError} from "@/services/financeService";
import {getOrganizationAccess} from "@/services/organizationAccess";
import styles from "@/app/home/agenda/page.module.css";
export function HolidayManager({year:initialYear,onClose,onChanged}:{year:number;onClose:()=>void;onChanged:()=>void}) {
  const { language, t } = useOrganizationLocale();
  const [year,setYear]=useState(initialYear);
  const [tab,setTab]=useState("saved");
  const [rows,setRows]=useState<Holiday[]>([]);
  const [national,setNational]=useState<NationalHoliday[]>([]);
  const [selection,setSelection]=useState<string[]>([]);
  const [canWrite,setCanWrite]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [name,setName]=useState("");
  const [date,setDate]=useState(`${initialYear}-01-01`);
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{getOrganizationAccess().then(access=>setCanWrite(["admin","manager"].includes(access.role) && !access.read_only)).catch(()=>{});},[]);
  useEffect(()=>{
    const c=new AbortController();
    holidayService.list(year,c.signal).then(rows=>{if(!c.signal.aborted)setRows(rows);}).catch(e=>{if(!c.signal.aborted)setError(financeError(e, language));}).finally(()=>{if(!c.signal.aborted)setLoading(false);});
    return ()=>c.abort();
  },[year,refresh, language]);
  const changed=()=>{setRefresh(value=>value+1);onChanged();};
  async function lookup() {
    setBusy(true);setError("");setSuccess("");setNational([]);setSelection([]);
    try {setNational(await holidayService.national(year));} catch(e){setError(financeError(e, language));} finally{setBusy(false);}
  }
  async function importSelected() {
    setBusy(true);setError("");setSuccess("");
    try {
      const result=await holidayService.importNational(year,selection);
      setNational(rows=>rows.map(row=>selection.includes(row.date)?{...row,registered:true}:row));
      setSelection([]);setSuccess(t("workspace.countHolidaySRegisteredExistingDatesWerePreserved", { count: result.created }));changed();
    }catch(e){setError(financeError(e, language));}finally{setBusy(false);}
  }
  const available=national.filter(row=>!row.registered);
  return <div className={styles.overlay} onKeyDown={e=>{if(e.key==="Escape"&&!busy)onClose();}} onClick={()=>{if(!busy)onClose();}}><section className={`${styles.detail} ${styles.holidayManager}`} role="dialog" aria-modal="true" aria-labelledby="holiday-title" onClick={e=>e.stopPropagation()}>
    <button autoFocus disabled={busy} aria-label={t("workspace.closeHolidays")} className={styles.close} onClick={onClose}><X size={20}/></button>
    <span className={styles.eyebrow}>{t("workspace.organizationCalendar")}</span><h2 id="holiday-title" className="h4"><CalendarDays size={22}/>  {t("workspace.holidays")}</h2>
    <p className="small text-muted">{t("workspace.registerDaysToHighlightForTheEntireOrganizationEachEntry")}</p>
    <div className={`${styles.viewSwitch} mb-3`}>{[{id:"saved",label:t("workspace.registered")},...(canWrite?[{id:"national",label:t("workspace.importNationalHolidays")},{id:"manual",label:t("workspace.newHoliday")}]:[])].map(item=><button disabled={busy} key={item.id} className={tab===item.id?styles.activeView:""} onClick={()=>{setTab(item.id);setError("");setSuccess("");}}>{item.label}</button>)}</div>
    {error&&<div role="alert" className="alert alert-danger py-2">{error}</div>}{success&&<div role="status" className="alert alert-success py-2">{success}</div>}
    {tab!=="manual"&&<label className="d-flex gap-2 align-items-center mb-3">{t("swine.year")}<select disabled={busy} className="form-select w-auto" value={year} onChange={e=>{setYear(Number(e.target.value));setNational([]);setSelection([]);setLoading(true);setError("");setSuccess("");}}>{Array.from(new Set([initialYear,...Array.from({length:11},(_,i)=>new Date().getFullYear()-5+i)])).sort().map(value=><option key={value}>{value}</option>)}</select>{tab==="national"&&<button disabled={busy} className="btn btn-outline-success" onClick={lookup}>{busy?t("workspace.lookingUp"):t("workspace.lookUpHolidays")}</button>}</label>}
    {tab==="saved"&&(loading?<p role="status">{t("workspace.loadingHolidays")}</p>:rows.length?<div className={styles.holidayRows}>{rows.map(row=><div key={row.id}><span><strong>{new Date(`${row.date}T12:00:00`).toLocaleDateString(language)}</strong> · {row.name}<small>{row.source==="national"?t("workspace.importedFromBrasilapi"):t("workspace.manualEntry")}</small></span>{canWrite&&<button disabled={busy} className="btn btn-sm btn-outline-danger" onClick={async()=>{if(!window.confirm(t("workspace.removeTheHolidayName", { name: row.name })))return;setBusy(true);setError("");try{await holidayService.remove(row.id);changed();}catch(e){setError(financeError(e, language));}finally{setBusy(false);}}}>{t("plantations.operation.removeRecord")}</button>}</div>)}</div>:<p className="text-muted">{t("workspace.noHolidaysRegisteredFor")} {year}.</p>)}
    {tab==="national"&&<><p className="small text-muted">{t("workspace.source")} <a href="https://brasilapi.com.br/docs" target="_blank" rel="noreferrer">BrasilAPI</a>{t("workspace.reviewTheDatesTheSourceCalendarMayIncludeReligiousOr")}</p>{national.length>0&&<><label className="form-check mb-3"><input className="form-check-input" disabled={busy||!available.length} type="checkbox" checked={available.length>0&&available.every(row=>selection.includes(row.date))} onChange={e=>setSelection(e.target.checked?available.map(row=>row.date):[])}/>{t("workspace.selectAllAvailable")}</label><div className={styles.holidayRows}>{national.map(row=><label key={`${row.date}:${row.name}`}><input disabled={busy||row.registered} type="checkbox" checked={row.registered||selection.includes(row.date)} onChange={e=>setSelection(values=>e.target.checked?[...values,row.date]:values.filter(value=>value!==row.date))}/><span><strong>{new Date(`${row.date}T12:00:00`).toLocaleDateString(language)}</strong> · {row.name}{row.registered&&<small>{t("workspace.alreadyRegistered")}</small>}</span></label>)}</div><button className="btn btn-success mt-3" disabled={busy||!selection.length} onClick={importSelected}><Download size={16}/> {busy?t("workspace.registering"):t("workspace.registerSelectedCount", { count: selection.length })}</button></>}</>}
    {tab==="manual"&&canWrite&&<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");setSuccess("");try{await holidayService.create(name,date);setName("");setSuccess(t("workspace.holidayRegistered"));changed();}catch(e){setError(financeError(e, language));}finally{setBusy(false);}}}><label className="d-block mb-3">{t("workspace.holidayName")}<input disabled={busy} required maxLength={150} className="form-control mt-1" value={name} onChange={e=>setName(e.target.value)} placeholder={t("workspace.eGTownAnniversary")}/></label><label className="d-block mb-3">{t("lotReport.date")}<input disabled={busy} required type="date" className="form-control mt-1" value={date} onChange={e=>setDate(e.target.value)}/></label><button disabled={busy||!name.trim()} className="btn btn-success"><Plus size={16}/> {busy?t("users.saving"):t("workspace.registerHoliday")}</button></form>}
  </section></div>;
}
