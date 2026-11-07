import { createContext, useContext, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../auth/AuthProvider';
import type { Session } from '../auth/contracts';
import type { Farm } from './contracts';
const Context=createContext<{farm:Farm|null;selectFarm:(farm:Farm|null)=>void}|null>(null);
export function WorkspaceProvider({children}:PropsWithChildren) {
  const {state}=useAuth();
  const session=state.status==='signedIn'?state.session:null;
  const [selection,setSelection]=useState<{session:Session|null;farm:Farm|null}>({session:null,farm:null});
  return <Context.Provider value={{farm:selection.session===session?selection.farm:null,selectFarm:farm=>setSelection({session,farm})}}>{children}</Context.Provider>;
}
export function useWorkspace(){const context=useContext(Context);if(!context)throw new Error('WorkspaceProvider is required');return context;}
