import { QueryClient } from '@tanstack/react-query';
export function createSessionQueryClient(scope='test'){
  return new QueryClient({defaultOptions:{queries:{retry:false,staleTime:30000,gcTime:300000,refetchOnWindowFocus:false,meta:{scope}},mutations:{retry:false}}});
}
