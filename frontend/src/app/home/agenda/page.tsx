"use client";
import { useOrganizationLocale } from "@/lib/locale";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, List, ChevronLeft, ChevronRight, Download, ArrowUpRight, X, SlidersHorizontal, Plus } from "lucide-react";
import { organizationAgendaService, allAgendaEvents, type AgendaEvent, type AgendaPage, holidayService, type Holiday } from "@/services/organizationAgendaService";
import { financeError, financeService, type NamedOption } from "@/services/financeService";
import { AgendaTaskForm } from "@/components/agenda/AgendaTaskForm";
import { getOrganizationAccess } from "@/services/organizationAccess";
import { HolidayManager } from "@/components/agenda/HolidayManager";
import styles from "./page.module.css";
import { agendaIso as iso, agendaDate as parse, agendaMonday as monday, addAgendaDays as add, agendaRange, agendaDays, moveAgendaPeriod, type AgendaView } from "@/services/agendaDates";
export default function AgendaPageView() {
  const { language, t } = useOrganizationLocale();
  const label = (value: string) => parse(value).toLocaleDateString(language, { day:"2-digit", month:"2-digit" });
  const domains: Record<string,string> = { livestock:t("workspace.herds"), crops:t("users.crops"), tasks:t("workspace.eventsAndTasks"), holidays:t("workspace.holidays") };
  const [week,setWeek] = useState(() => iso(new Date()));
  const [view,setView] = useState<AgendaView>("month");
  const [domain,setDomain] = useState("all");
  const [farm,setFarm] = useState("");
  const [farms,setFarms] = useState<NamedOption[]>([]);
  const [recorded,setRecorded] = useState(false);
  const [focus,setFocus] = useState("");
  const [page,setPage] = useState(1);
  const [days,setDays] = useState<AgendaPage[]>([]);
  const [list,setList] = useState<AgendaPage | null>(null);
  const [exporting,setExporting] = useState(false);
  const [exportError,setExportError] = useState("");
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [holidayManager,setHolidayManager] = useState(false);
  const [holidays,setHolidays] = useState<Holiday[]>([]);
  const [holidayError,setHolidayError] = useState("");
  const [refresh,setRefresh] = useState(0);
  const [taskForm,setTaskForm] = useState<{id?:string;date:string}|null>(null);
  const [canCreate,setCanCreate] = useState(false);
  const [selected,setSelected] = useState<AgendaEvent | null>(null);
  const {start:periodStart,end:periodEnd} = useMemo(()=>agendaRange(week,view),[week,view]);
  const dates = useMemo(()=>agendaDays(periodStart,periodEnd),[periodStart,periodEnd]);
  const cells = useMemo(()=>view === "month" ? agendaDays(monday(periodStart),add(monday(periodEnd),6)) : dates,[view,periodStart,periodEnd,dates]);
  useEffect(()=>{getOrganizationAccess().then(access=>setCanCreate(!access.read_only)).catch(()=>{});},[]);
  useEffect(()=>{ const c=new AbortController(); financeService.farms(c.signal).then(setFarms).catch(()=>{}); return ()=>c.abort(); },[]);
  useEffect(()=>{
    const c=new AbortController();
    const params={domain, ...(farm ? {farm}:{}), include_recorded:recorded};
    queueMicrotask(() => { if (!c.signal.aborted) { setLoading(true); setError(""); } });
    const request = view !== "list"
      ? (async()=>{
          const previews: AgendaPage[]=[];
          for(let offset=0;offset<dates.length;offset+=4) {
            if(c.signal.aborted) return;
            previews.push(...await Promise.all(dates.slice(offset,offset+4).map(date=>organizationAgendaService.list({...params,start:date,end:date,page_size:view === "month" ? 2 : 3},c.signal))));
          }
          if(!c.signal.aborted) setDays(previews);
        })()
      : organizationAgendaService.list({...params,start:focus || periodStart,end:focus || periodEnd,page,page_size:20},c.signal).then(setList);
    request.catch(e=>{if(!c.signal.aborted)setError(financeError(e, language));}).finally(()=>{if(!c.signal.aborted)setLoading(false);});
    return ()=>c.abort();
  },[periodStart,periodEnd,view,domain,farm,recorded,focus,page,dates,refresh, language]);
  useEffect(()=>{
    const c=new AbortController();
    const years=Array.from(new Set([Number(periodStart.slice(0,4)),Number(periodEnd.slice(0,4))]));
    Promise.all(years.map(year=>holidayService.list(year,c.signal))).then(rows=>{if(!c.signal.aborted){setHolidays(rows.flat());setHolidayError("");}}).catch(e=>{if(!c.signal.aborted)setHolidayError(financeError(e, language));});
    return ()=>c.abort();
  },[periodStart,periodEnd,refresh, language]);
  async function exportPdf() {
    setExporting(true); setExportError("");
    const start = view === "list" && focus ? focus : periodStart;
    const end = view === "list" && focus ? focus : periodEnd;
    try {
      const years=Array.from(new Set([Number(start.slice(0,4)),Number(end.slice(0,4))]));
      const [events, holidayRows] = await Promise.all([allAgendaEvents({start, end, domain, ...(farm ? {farm}:{}), include_recorded:recorded}), Promise.all(years.map(year=>holidayService.list(year)))]);
      const { buildAgendaPdf } = await import("@/services/organizationAgendaPdf");
      buildAgendaPdf(events, {language, start, end, holidays:holidayRows.flat(), view: view === "week" ? "calendar" : view, farmLabel: farms.find(item=>item.id===farm)?.name || t("dairy.home.allFarms"), activityLabel: domains[domain] || t("workspace.allActivities"), includeRecorded:recorded}).save(`agenda-${view === "month" ? "mes" : view === "week" ? "semana" : "lista"}-${start}-${end}.pdf`);
    } catch (error) { setExportError(financeError(error, language)); }
    finally { setExporting(false); }
  }
  const reset=()=>{setPage(1);setFocus("");};
  const eventButton=(event: AgendaEvent)=><button key={event.id} className={`${styles.event} ${styles[event.domain] || ""}`} title={event.title} onClick={()=>event.domain === "tasks" ? setTaskForm({id:event.source_id||event.id.split(":")[1],date:event.date}) : setSelected(event)}><span className={styles.eventCategory}>{domains[event.domain]}{event.species ? ` · ${event.species}`:""}</span><strong>{event.title}</strong><span className="small text-muted">{event.farm_name} · {event.status === "recorded" || event.status === "done" ? t("workspace.recordedLabel") : event.estimated ? t("workspace.estimate") : t("workspace.scheduled")}</span></button>;
  return <div className={styles.agenda}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>{t("workspace.organizationPlanning")}</span><h1>{t("sidebar.agenda")}</h1><p>{t("workspace.theEntireFarmInOneCalendar")}</p></div>
      <div className="d-flex gap-2 flex-wrap">{canCreate&&<button className="btn btn-success d-flex align-items-center gap-2" onClick={()=>setTaskForm({date:focus||week})}><Plus size={16}/>  {t("workspace.newEvent")}</button>}<button className="btn btn-outline-success d-flex align-items-center gap-2" onClick={()=>setHolidayManager(true)}><CalendarDays size={16}/>  {t("workspace.holidays")}</button><button className="btn btn-success d-flex align-items-center gap-2" disabled={exporting || loading} onClick={exportPdf}><Download size={16}/> {exporting ? t("workspace.generatingPdf") : t("swine.exportPdf")}</button></div>
    </header>
    <div className={styles.workspace}>
      <div className={styles.toolbar}>
        <button className="btn btn-outline-secondary" aria-label={view === "week" ? t("workspace.previousWeek") : t("workspace.previousMonth")} onClick={()=>{setWeek(moveAgendaPeriod(week,view,-1));reset();}}><ChevronLeft size={18}/></button>
        <strong className={styles.period}>{view === "week" ? `${label(periodStart)} – ${label(periodEnd)}` : parse(periodStart).toLocaleDateString(language,{month:"long",year:"numeric"})}</strong>
        <button className="btn btn-outline-secondary" aria-label={view === "week" ? t("workspace.nextWeek") : t("workspace.nextMonth")} onClick={()=>{setWeek(moveAgendaPeriod(week,view,1));reset();}}><ChevronRight size={18}/></button>
        <button className="btn btn-outline-success" onClick={()=>{setWeek(iso(new Date()));reset();}}>{t("poultryReproduction.today")}</button>
        <input aria-label={t("workspace.selectDate")} type="date" className="form-control w-auto" value={week} onChange={e=>{if(e.target.value){setWeek(e.target.value);reset();}}}/>
        <div className={styles.viewSwitch}>{([{id:"month",label:t("dashboard.month")},{id:"week",label:t("workspace.week")},{id:"list",label:t("workspace.list")}] as const).map(item=><button key={item.id} aria-pressed={view===item.id} className={view===item.id?styles.activeView:""} onClick={()=>{setView(item.id);reset();}}>{item.id === "list" ? <List size={16}/> : <CalendarDays size={16}/>} {item.label}</button>)}</div>
      </div>
      <div className={styles.filters}><span className={styles.filterIcon} title={t("workspace.filters")}><SlidersHorizontal size={17}/></span>
        <label>{t("plantations.labor.activity")}<select className="form-select" value={domain} onChange={e=>{setDomain(e.target.value);reset();}}><option value="all">{t("workspace.allActivities")}</option>{Object.entries(domains).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
        <label>{t("dairy.home.farm")}<select className="form-select" value={farm} onChange={e=>{setFarm(e.target.value);reset();}}><option value="">{t("dairy.home.allFarms")}</option>{farms.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label className="form-check mb-2"><input type="checkbox" className="form-check-input" checked={recorded} onChange={e=>{setRecorded(e.target.checked);reset();}}/>{t("workspace.includeRecordedEvents")}</label>
      </div>
    <div className={styles.legend}><span className={styles.total}>{loading ? t("inventory.adjustment.loading") : t("workspace.countEventsInThisPeriod", { count: view === "list" ? list?.count ?? 0 : days.reduce((sum,day)=>sum+day.count,0) })}</span>{Object.entries(domains).map(([key,name])=><span key={key} className={styles.legendItem}><i className={styles[key]}/>{name}</span>)}</div>
    {holidayError && <div role="alert" className="alert alert-warning">{t("workspace.couldNotLoadHolidayHighlights")} {holidayError}</div>}
    {exportError && <div role="alert" className="alert alert-danger">{exportError}</div>}
    {error ? <div role="alert" className="alert alert-danger">{error} <button className="btn btn-sm btn-outline-danger ms-2" onClick={()=>setRefresh(value=>value+1)}>{t("lotReport.retry")}</button></div> : loading ? <div role="status" className={styles.loading}><CalendarDays size={32}/><p>{t("workspace.organizingYourEvents")}</p></div> : view !== "list" ? <>
      <div className={view === "month" ? styles.monthScroll : undefined}><div className={view === "month" ? styles.month : styles.week}>
        {view === "month" && Array.from({ length: 7 }, (_, index) => parse(add("2026-01-05", index)).toLocaleDateString(language, { weekday: "short" })).map((day,index)=><div key={day} className={`${styles.weekday} ${index===5?styles.saturday:index===6?styles.sunday:""}`}>{day}</div>)}
        {cells.map(date=>{
          const index=dates.indexOf(date); const day=days[index]; const outside=index<0; const dayHolidays=holidays.filter(item=>item.date===date); const weekday=parse(date).getDay();
          return <section key={date} className={`${styles.day} ${outside?styles.outside:""} ${date===iso(new Date())?styles.today:""} ${weekday===6?styles.saturday:weekday===0?styles.sunday:""} ${!outside&&dayHolidays.length?styles.holidayDay:""}`}>
            <div className={styles.dayHeader}><button disabled={outside} className={styles.dayNumber} aria-label={t("workspace.viewEventsForDate", { date: label(date) })} onClick={()=>{setWeek(date);setFocus(date);setPage(1);setView("list");}}>{view === "week" && <small>{parse(date).toLocaleDateString(language,{weekday:"short"})}</small>}<span>{parse(date).getDate()}</span></button>{!outside && date===iso(new Date()) && <span className={styles.todayLabel}>{t("poultryReproduction.today")}</span>}{!outside && !!day?.count && <span className={styles.dayCount}>{day.count}</span>}</div>
            {!outside && <>{dayHolidays.map(item=><span key={item.id} className={styles.holidayBadge} title={item.name}>{item.name}</span>)}<div className={styles.dayEvents}>{day?.results.filter(event=>event.kind!=="holiday").map(eventButton)}</div>{!day?.count && view === "week" && <p className={styles.emptyDay}>{t("workspace.freeDay")}</p>}{(day?.count ?? 0)>(view === "month" ? 2 : 3) && <button className={styles.more} onClick={()=>{setWeek(date);setFocus(date);setPage(1);setView("list");}}>+{day.count-(view === "month" ? 2 : 3)}  {t("plantations.history.unit.events")} <ArrowUpRight size={12}/></button>}</>}

          </section>;
        })}
      </div></div></> : <div className={styles.list}>
      <div className="d-flex justify-content-between mb-3"><strong>{list?.count ?? 0}  {t("plantations.history.unit.events")} {focus?t("workspace.onDate", { date: label(focus) }):t("workspace.thisMonth")}</strong>{focus && <button className="btn btn-sm btn-outline-success" onClick={reset}>{t("workspace.entireMonth")}</button>}</div>
      {!list?.count && <div className={styles.empty}><CalendarDays size={36}/><h2>{t("workspace.noEventsHere")}</h2><p>{t("workspace.chooseAnotherPeriodOrAdjustTheFiltersToViewYour")}</p></div>}
      {list?.results.map(event=><div key={event.id} className={styles.row}><div className={styles.listDate}><strong>{parse(event.date).getDate()}</strong><span>{parse(event.date).toLocaleDateString(language,{month:"short"})}</span><small>{parse(event.date).toLocaleDateString(language,{weekday:"short"})}</small></div>{eventButton(event)}</div>)}
      <div className="d-flex gap-3 align-items-center mt-3"><button className="btn btn-outline-secondary" disabled={!list?.previous} onClick={()=>setPage(page-1)}>{t("notifications.previous")}</button><span>{t("workspace.page")} {page}</span><button className="btn btn-outline-secondary" disabled={!list?.next} onClick={()=>setPage(page+1)}>{t("notifications.next")}</button></div>
    </div>}
    <footer className={styles.note}>{t("workspace.datesAndForecastsFollowModuleRecordsEstimatesMustBeChecked")}</footer>
    </div>
    {taskForm && <AgendaTaskForm {...taskForm} farms={farms} onClose={()=>setTaskForm(null)} onSaved={()=>{setTaskForm(null);setRefresh(value=>value+1);}}/>}
    {holidayManager && <HolidayManager year={parse(week).getFullYear()} onClose={()=>setHolidayManager(false)} onChanged={()=>setRefresh(value=>value+1)}/>}
    {selected && <div className={styles.overlay} onKeyDown={event=>{if(event.key === "Escape")setSelected(null);}} onClick={()=>setSelected(null)}><section role="dialog" aria-modal="true" aria-labelledby="agenda-detail-title" className={styles.detail} onClick={e=>e.stopPropagation()}><button aria-label={t("workspace.closeDetails")} className={styles.close} onClick={()=>setSelected(null)}><X size={20}/></button><span className={styles.eyebrow}>{domains[selected.domain]}</span><h2 id="agenda-detail-title" className="h4">{selected.title}</h2><p>{label(selected.date)} · {selected.farm_name}</p><p>{domains[selected.domain]} {selected.species}</p>{selected.estimated && <p className="text-muted">{t("workspace.forecastCalculatedFromTheLatestFeedingAndTheBatchRequirements")}</p>}<div className="d-flex gap-2 flex-wrap">{selected.source_url && <Link href={selected.source_url} className="btn btn-success">{t("workspace.openSourceModule")}</Link>}<button autoFocus className="btn btn-outline-secondary" onClick={()=>setSelected(null)}>{t("notifications.close")}</button></div></section></div>}
  </div>;
}
