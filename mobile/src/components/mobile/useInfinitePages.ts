import {useInfiniteQuery,type QueryKey} from '@tanstack/react-query';
import {useCallback,useMemo,useState} from 'react';

type Page<T>={results:T[];next:string|null;count?:number};

/**
 * Infinite list over the DRF page contracts already exposed by the controller.
 * Each page is still validated by the service; this hook only accumulates and
 * exposes pull-to-refresh state separate from background refetches.
 */
export function useInfinitePages<T>({queryKey,enabled,fetchPage}:{queryKey:QueryKey;enabled:boolean;fetchPage:(page:number,signal:AbortSignal)=>Promise<Page<T>>}){
 const query=useInfiniteQuery({
  queryKey,enabled,initialPageParam:1,
  queryFn:({pageParam,signal})=>fetchPage(pageParam,signal),
  getNextPageParam:(last,all)=>last.next?all.length+1:undefined,
 });
 const [refreshing,setRefreshing]=useState(false);
 const {refetch,hasNextPage,isFetchingNextPage,fetchNextPage}=query;
 const refresh=useCallback(async()=>{setRefreshing(true);try{await refetch();}finally{setRefreshing(false);}},[refetch]);
 const loadMore=useCallback(()=>{if(hasNextPage&&!isFetchingNextPage)void fetchNextPage();},[hasNextPage,isFetchingNextPage,fetchNextPage]);
 const rows=useMemo(()=>query.data?.pages.flatMap(page=>page.results)??[],[query.data]);
 const count=query.data?.pages[0]?.count;
 return {...query,rows,count,refreshing,refresh,loadMore};
}
