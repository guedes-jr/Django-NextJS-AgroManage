import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, type PropsWithChildren } from 'react';
import { useAuth } from '../features/auth/AuthProvider';
import { createSessionQueryClient } from './sessionQueryClient';
export function SessionQueryProvider({children}:PropsWithChildren){
  const {state,controller}=useAuth();
  const scope=state.status==='signedIn'?`${state.session.user.id}:${state.session.organization.id}:${controller.getSessionEpoch()}`:state.status;
  const client=useMemo(()=>createSessionQueryClient(scope),[scope]);
  useEffect(()=>()=>{void client.cancelQueries().then(()=>client.clear());},[client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
