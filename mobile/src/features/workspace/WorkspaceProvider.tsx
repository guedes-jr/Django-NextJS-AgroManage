import { createContext, useContext, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../auth/AuthProvider';
import type { Session } from '../auth/contracts';
import { agendaSelectionSchema, type AgendaSelection } from '../agenda/selection';
import type { Farm } from './contracts';
const Context=createContext<{farm:Farm|null;selectFarm:(farm:Farm|null)=>void;agendaSelection:AgendaSelection|null;saveAgendaSelection:(value:AgendaSelection)=>void}|null>(null);
export function WorkspaceProvider({children}:PropsWithChildren) {
  const {state}=useAuth();
  const session=state.status==='signedIn'?state.session:null;
  const [selection,setSelection]=useState<{session:Session|null;farm:Farm|null}>({session:null,farm:null});
  const [agenda,setAgenda]=useState<{session:Session|null;value:AgendaSelection|null}>({session:null,value:null});
  return <Context.Provider value={{farm:selection.session===session?selection.farm:null,selectFarm:farm=>{setSelection({session,farm});setAgenda({session,value:null});},agendaSelection:agenda.session===session?agenda.value:null,saveAgendaSelection:value=>setAgenda({session,value:agendaSelectionSchema.parse(value)})}}>{children}</Context.Provider>;
}
export function useWorkspace(){const context=useContext(Context);if(!context)throw new Error('WorkspaceProvider is required');return context;}
