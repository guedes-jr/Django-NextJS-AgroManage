export type AgendaView = "month" | "week" | "list";
export const agendaIso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
export const agendaDate = (value: string) => new Date(`${value}T12:00:00`);
export const addAgendaDays = (value: string, days: number) => { const date=agendaDate(value); date.setDate(date.getDate()+days); return agendaIso(date); };
export const agendaMonday = (value: string) => addAgendaDays(value,-(agendaDate(value).getDay()+6)%7);
export function agendaRange(anchor: string, view: AgendaView) {
  if (view === "week") { const start=agendaMonday(anchor); return {start,end:addAgendaDays(start,6)}; }
  const date=agendaDate(anchor);
  return {start:agendaIso(new Date(date.getFullYear(),date.getMonth(),1,12)),end:agendaIso(new Date(date.getFullYear(),date.getMonth()+1,0,12))};
}
export function agendaDays(start: string, end: string) {
  const days: string[]=[];
  for(let value=start;value<=end;value=addAgendaDays(value,1)) days.push(value);
  return days;
}
export function moveAgendaPeriod(anchor: string, view: AgendaView, direction: number) {
  if(view === "week") return addAgendaDays(anchor,direction*7);
  const date=agendaDate(anchor);
  return agendaIso(new Date(date.getFullYear(),date.getMonth()+direction,1,12));
}
