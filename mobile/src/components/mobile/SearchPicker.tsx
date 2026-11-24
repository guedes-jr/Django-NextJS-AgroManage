import {useState} from 'react';
import type {QueryKey} from '@tanstack/react-query';
import type {Language} from '../../i18n/messages';
import {ListRow,PickerModal} from './index';
import {useInfinitePages} from './useInfinitePages';

type Page<T>={results:T[];next:string|null|boolean;count?:number};
/** Single selection over a paginated API catalog: search, infinite list, tappable rows. */
export function SearchPicker<T>({title,language,searchPlaceholder,searchable=true,emptyLabel,errorLabel,selectLabel,queryKey,fetchPage,keyExtractor,row,onSelect,onClose}:{title:string;language:Language;searchPlaceholder?:string;searchable?:boolean;emptyLabel:string;errorLabel:string;selectLabel:string;queryKey:QueryKey;fetchPage:(page:number,search:string,signal:AbortSignal)=>Promise<Page<T>>;keyExtractor:(item:T)=>string;row:(item:T)=>{title:string;subtitle?:string;meta?:string;disabled?:boolean};onSelect:(item:T)=>void;onClose:()=>void}){
 const [search,setSearch]=useState('');
 const list=useInfinitePages<T>({queryKey:[...(Array.isArray(queryKey)?queryKey:[queryKey]),'search-picker',search],enabled:true,fetchPage:async(page,signal)=>{const data=await fetchPage(page,search,signal);return {results:data.results,count:data.count,next:typeof data.next==='boolean'?(data.next?String(page+1):null):data.next};}});
 return <PickerModal<T> title={title} language={language} onClose={onClose} search={searchable?search:undefined} onSearch={searchable?setSearch:undefined} searchPlaceholder={searchPlaceholder} list={list} keyExtractor={keyExtractor} emptyLabel={emptyLabel} errorLabel={errorLabel}
  renderItem={item=>{const r=row(item);return <ListRow meta={r.meta} title={r.title} subtitle={r.subtitle} disabled={r.disabled} accessibilityLabel={`${selectLabel}: ${r.title}`} onPress={()=>onSelect(item)}/>;}}/>;
}
