import { translateMessage, type AppLanguage, type TranslationKey } from "@/lib/localeMessages";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { agendaDays, agendaMonday, addAgendaDays, agendaDate } from "./agendaDates";
import type { AgendaEvent } from "./organizationAgendaService";

export type AgendaPdfOptions = { language?: AppLanguage; start: string; end: string; view: "list" | "calendar" | "month"; farmLabel: string; activityLabel: string; includeRecorded: boolean; holidays?: {date:string;name:string}[]; today?: string };
type Color = [number,number,number];
const ink:Color=[35,55,45], muted:Color=[105,120,111], border:Color=[223,231,226], green:Color=[25,135,84];
const colors:Record<string,Color>={livestock:green,crops:[200,140,40],tasks:[67,135,195],holidays:[166,96,158]};
const tint=(color:Color,amount=.08):Color=>color.map(value=>Math.round(255-(255-value)*amount)) as Color;

/** Printable web-style calendar, with full details for anything that does not fit its preview. */
export function buildAgendaPdf(events:AgendaEvent[],options:AgendaPdfOptions) {
  const language = options.language ?? "pt-BR";
  const t = (key: TranslationKey, values?: Record<string, string | number>) => translateMessage(language, key, values);
  const domains:Record<string,string>={livestock:t("workspace.herds"),crops:t("users.crops"),tasks:t("workspace.eventsAndTasks"),holidays:t("workspace.holidays")};
  const dateLabel=(value:string)=>agendaDate(value).toLocaleDateString(language);
  const statusLabel=(event:AgendaEvent)=>["recorded","done"].includes(event.status)?t("workspace.recordedLabel"):event.estimated?t("workspace.estimate"):t("workspace.scheduled");
  const doc=new jsPDF({orientation:options.view==="list"?"portrait":"landscape",unit:"mm",format:"a4"});
  const width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight(),left=12,usable=width-24;
  const today=options.today||new Intl.DateTimeFormat("en-CA",{timeZone:"America/Fortaleza",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const sorted=[...events].sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title,language)||a.id.localeCompare(b.id));
  const details=new Map<string,AgendaEvent>();
  const holidayMap=new Map<string,string[]>();
  for(const item of [...(options.holidays||[]),...events.filter(event=>event.kind==="holiday").map(event=>({date:event.date,name:event.title}))]) {
    const names=holidayMap.get(item.date)||[];
    if(!names.includes(item.name))names.push(item.name);
    holidayMap.set(item.date,names);
  }
  function text(value:string,x:number,y:number,size=8,color:Color=ink,bold=false) {
    doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(size);doc.setTextColor(...color);doc.text(value,x,y);
  }
  function lines(value:string,maxWidth:number,size:number,maxLines:number) {
    doc.setFont("helvetica","normal");doc.setFontSize(size);
    const all=doc.splitTextToSize(value,maxWidth) as string[];
    const visible=all.slice(0,maxLines);
    if(all.length>maxLines) {
      let last=visible[visible.length-1];
      while(last.length&&doc.getTextWidth(`${last}...`)>maxWidth)last=last.slice(0,-1);
      visible[visible.length-1]=`${last}...`;
    }
    return {visible,truncated:all.length>maxLines};
  }
  function heading(subtitle:string) {
    text(t("workspace.fazendaMaisOrganizationPlanning"),left,12,6.5,muted,true);
    text(t("sidebar.agenda"),left,22,20,ink,true);
    const title=options.view==="month"?agendaDate(options.start).toLocaleDateString(language,{month:"long",year:"numeric"}):`${dateLabel(options.start)} – ${dateLabel(options.end)}`;
    text(`${title.charAt(0).toUpperCase()+title.slice(1)} · ${subtitle}`,left,29,10,muted);
    doc.setFillColor(247,249,248);doc.setDrawColor(...border);doc.roundedRect(left,34,usable,12,2,2,"FD");
    const filters=lines(`${options.farmLabel}  ·  ${options.activityLabel}  ·  ${options.includeRecorded?t("workspace.includesRecordedEvents"):t("workspace.scheduledOnly")}`,usable-8,7.5,2);
    filters.visible.forEach((line,i)=>text(line,left+4,39+i*3.5,7.5,muted));
    text(t("workspace.countEventsInThisPeriod", { count: events.length }),left,52,7.5,ink,true);
    let x=width-12;
    for(const [domain,label] of Object.entries(domains).reverse()) {
      doc.setFontSize(6.5); const length=doc.getTextWidth(label)+9;x-=length;
      doc.setFillColor(...colors[domain]);doc.circle(x+1,51,0.8,"F");text(label,x+4,52,6.5,muted);
    }
  }
  function table(rows:AgendaEvent[],startY:number) {
    autoTable(doc,{startY,margin:{top:16,left,right:12,bottom:16},theme:"plain",rowPageBreak:"avoid",
      head:[[t("lotReport.date"), t("workspace.event"), t("workspace.activitySpecies"), t("dairy.home.farm"), t("structure.dedicated.status")]],
      body:rows.length?rows.map(event=>[dateLabel(event.date),event.title,[domains[event.domain]||event.domain,event.species].filter(Boolean).join(" / "),event.farm_name,statusLabel(event)]):[["", t("workspace.noEventsInThisPeriodWithTheSelectedFilters"), "", "", ""]],
      styles:{fontSize:8,cellPadding:3,lineColor:border,lineWidth:{bottom:.15},textColor:ink,overflow:"linebreak"},
      headStyles:{fillColor:[244,247,245],textColor:muted,fontStyle:"bold",fontSize:7},
      didParseCell:data=>{if(data.section==="body"&&data.column.index===1&&rows[data.row.index])data.cell.styles.fillColor=tint(colors[rows[data.row.index].domain]||green);},
      didDrawCell:data=>{if(data.section==="body"&&data.column.index===1&&rows[data.row.index]){doc.setDrawColor(...(colors[rows[data.row.index].domain]||green));doc.setLineWidth(.7);doc.line(data.cell.x,data.cell.y+2,data.cell.x,data.cell.y+data.cell.height-2);}},
    });
  }
  heading(options.view==="month"?t("dashboard.month"):options.view==="calendar"?t("workspace.week"):t("workspace.list"));
  if(options.view==="list")table(sorted,57);
  else {
    const dates=options.view==="month"?agendaDays(agendaMonday(options.start),addAgendaDays(agendaMonday(options.end),6)):agendaDays(options.start,options.end);
    const columnCount=options.view==="month"?7:dates.length;
    const rowCount=options.view==="month"?dates.length/7:1;
    const top=64,cellWidth=usable/columnCount,cellHeight=(height-19-top)/rowCount;
    for(let column=0;column<columnCount;column++) {
      const day=agendaDate(dates[column]).getDay();
      const color=day===6?colors.tasks:day===0?[185,102,96] as Color:muted;
      doc.setFillColor(...(day===0||day===6?tint(color):[246,248,247] as Color));doc.rect(left+column*cellWidth,56,cellWidth,8,"F");
      text(agendaDate(dates[column]).toLocaleDateString(language,{weekday:"short"}).replace(".","").toUpperCase(),left+column*cellWidth+3,61,6.5,color,true);
    }
    dates.forEach((date,index)=>{
      const column=index%columnCount,row=Math.floor(index/columnCount),x=left+column*cellWidth,y=top+row*cellHeight;
      const outside=date<options.start||date>options.end,day=agendaDate(date).getDay(),holiday=!outside&&holidayMap.has(date);
      const base=holiday?colors.holidays:day===6?colors.tasks:day===0?[185,102,96] as Color:green;
      doc.setFillColor(...(outside?[246,248,247] as Color:holiday||day===0||day===6?tint(base):date===today?tint(green,.04):[255,255,255] as Color));
      doc.setDrawColor(...border);doc.setLineWidth(.2);doc.rect(x,y,cellWidth,cellHeight,"FD");
      if(holiday){doc.setFillColor(...colors.holidays);doc.rect(x,y,cellWidth,.7,"F");}
      const number=String(agendaDate(date).getDate());
      if(!outside&&date===today){doc.setFillColor(...green);doc.circle(x+5,y+4.2,2.6,"F");text(number,x+5-doc.getTextWidth(number)/2,y+5.1,7,[255,255,255],true);}
      else text(number,x+3,y+5.2,7.5,outside?[179,188,182]:holiday||day===0||day===6?base:ink,true);
      if(outside)return;
      const items=sorted.filter(event=>event.date===date);
      if(items.length){text(String(items.length),x+cellWidth-5,y+5.2,6.5,muted);}
      let cursor=y+6.5;
      for(const name of holidayMap.get(date)||[]) {
        if(cursor+6>y+cellHeight-4){const event=items.find(item=>item.kind==="holiday"&&item.title===name);if(event)details.set(event.id,event);continue;}
        const preview=lines(name,cellWidth-7,6.4,2);
        preview.visible.forEach((line,i)=>text(line,x+3,cursor+2+i*2.5,6.4,colors.holidays,true));
        cursor+=preview.visible.length*2.5+2;
        if(preview.truncated){const event=items.find(item=>item.kind==="holiday"&&item.title===name);if(event)details.set(event.id,event);}
      }
      const cards=items.filter(event=>event.kind!=="holiday");
      const cardHeight=options.view==="month"?6.5:15;
      const capacity=Math.max(0,Math.floor((y+cellHeight-2.8-cursor)/ (cardHeight+.7)));
      cards.slice(0,capacity).forEach(event=>{
        const color=colors[event.domain]||green;
        doc.setFillColor(...tint(color));doc.roundedRect(x+2,cursor,cellWidth-4,cardHeight,1,1,"F");
        doc.setFillColor(...color);doc.rect(x+2,cursor,.7,cardHeight,"F");
        const preview=lines(event.title,cellWidth-9,6.7,2);
        preview.visible.forEach((line,i)=>text(line,x+4,cursor+2.8+i*2.5,6.7));
        if(options.view!=="month") {
          const meta=lines(`${event.farm_name} · ${statusLabel(event)}`,cellWidth-9,6,2);
          meta.visible.forEach((line,i)=>text(line,x+4,cursor+9+i*2.4,6,muted));
          if(meta.truncated)details.set(event.id,event);
        }
        if(preview.truncated)details.set(event.id,event);
        cursor+=cardHeight+.7;
      });
      if(cards.length>capacity){cards.slice(capacity).forEach(event=>details.set(event.id,event));text(t("workspace.countEventsViewDetails", { count: cards.length - capacity }),x+3,y+cellHeight-1.6,5.8,muted);}
    });
    if(details.size){
      doc.addPage();text(t("workspace.eventDetailsHeading"),left,18,15,ink,true);
      text(t("workspace.fullContentOfEventsThatExceededTheCalendarSpace"),left,25,8,muted);
      table([...details.values()],31);
    }
  }
  const pages=doc.getNumberOfPages();
  for(let page=1;page<=pages;page++) {
    doc.setPage(page);text(t("workspace.fazendaMaisForecastsMustBeCheckedInTheField"),left,height-7,6.5,muted);
    doc.setFontSize(7);doc.text(`${page} / ${pages}`,width-12,height-7,{align:"right"});
  }
  return doc;
}
