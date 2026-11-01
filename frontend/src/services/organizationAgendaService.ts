import { apiClient } from "./api";
export type AgendaEvent = { id: string; source_id?: string; date: string; title: string; domain: string; species: string; farm_name: string; kind: string; status: string; source_url: string | null; estimated: boolean };
export type AgendaPage = { count: number; results: AgendaEvent[]; next: string | null; previous: string | null };
export const organizationAgendaService = {
  list: async (params: Record<string, string | number | boolean>, signal?: AbortSignal) => (await apiClient.get<AgendaPage>("/tasks/agenda/", { params, signal })).data,
};

/** Export every matching page, including events outside the visible preview. */
export async function allAgendaEvents(params: Record<string, string | number | boolean>, signal?: AbortSignal): Promise<AgendaEvent[]> {
  const events: AgendaEvent[] = [];
  for (let page = 1; ; page++) {
    const result = await organizationAgendaService.list({ ...params, page, page_size: 100 }, signal);
    events.push(...result.results);
    if (!result.next) return events;
  }
}

export type Holiday = { id: string; name: string; date: string; source: "manual" | "national" };
export type NationalHoliday = { name: string; date: string; registered: boolean };
export const holidayService = {
  list: async (year: number, signal?: AbortSignal) => {
    const rows: Holiday[]=[];
    for(let page=1;;page++) {
      const {data}=await apiClient.get<{results:Holiday[];next:string|null}>("/tasks/holidays/",{params:{year,page,page_size:100},signal});
      rows.push(...data.results);
      if(!data.next) return rows;
    }
  },
  national: async(year:number)=>(await apiClient.get<{source:string;results:NationalHoliday[]}>("/tasks/holidays/national/",{params:{year}})).data.results,
  importNational: async(year:number,dates:string[])=>(await apiClient.post<{created:number}>("/tasks/holidays/import-national/",{year,dates})).data,
  create: async(name:string,date:string)=>(await apiClient.post<Holiday>("/tasks/holidays/",{name,date})).data,
  remove: async(id:string)=>{await apiClient.delete(`/tasks/holidays/${id}/`);},
};

export type AgendaTask = {operational_link?:string|null;id:string;title:string;description:string;due_date:string|null;event_kind:"task"|"event"|"appointment";start_time:string|null;end_time:string|null;location:string;farm:string|null;status:string;priority:string;whatsapp_remind_at:string|null;reminder_status:string|null;created_by:string|null};
export type AgendaTaskOptions = {user_id:string;role:string;read_only:boolean;whatsapp_contact_ready:boolean;whatsapp_configured:boolean;channel_enabled:boolean;timezone:string};
export const agendaTaskService = {
  detail:async(id:string)=>(await apiClient.get<AgendaTask>(`/tasks/${id}/`)).data,
  options:async()=>(await apiClient.get<AgendaTaskOptions>("/tasks/agenda-options/")).data,
  create:async(payload:Record<string,unknown>)=>(await apiClient.post<AgendaTask>("/tasks/",payload)).data,
  update:async(id:string,payload:Record<string,unknown>)=>(await apiClient.patch<AgendaTask>(`/tasks/${id}/`,payload)).data,
};
