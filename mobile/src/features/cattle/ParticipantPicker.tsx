import {useState} from 'react';
import {useAuth} from '../auth/AuthProvider';
import {workspaceMessages} from '../workspace/messages';
import {colors} from '../../theme/tokens';
import {IconTile,ListRow,Notice,PickerModal} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {DairyIcon} from './DairyIcon';
import {cattleMessages,cattleLabel} from './messages';

type Participant={id:string;identifier:string;cattle_purpose:string;status?:string|null};
/** Multi-select of collective-management participants: search, infinite list, running count and limit. */
export function ParticipantPicker<T extends Participant>({title,searchLabel,chooseLabel,emptyLabel,limitLabel,countLabel,selected,max,queryKey,fetchPage,onClose,onSelect}:{title:string;searchLabel:string;chooseLabel:string;emptyLabel:string;limitLabel?:string;countLabel:string;selected:string[];max:number;queryKey:unknown[];fetchPage:(page:number,search:string,signal:AbortSignal)=>Promise<{results:T[];next:string|null}>;onClose:()=>void;onSelect:(row:T)=>void}){
 const {language}=useAuth();const w=workspaceMessages[language],c=cattleMessages[language];const [search,setSearch]=useState('');
 const list=useInfinitePages<T>({queryKey:[...queryKey,'infinite',search],enabled:true,fetchPage:(page,signal)=>fetchPage(page,search,signal)});
 const full=selected.length>=max;
 return <PickerModal<T> title={title} language={language} onClose={onClose} search={search} onSearch={setSearch} searchPlaceholder={searchLabel} list={list} keyExtractor={row=>row.id} emptyLabel={emptyLabel} errorLabel={w.error}
  header={<Notice tone={full?'warning':'info'} text={`${countLabel}: ${selected.length} / ${max}${full&&limitLabel?` · ${limitLabel}`:''}`}/>}
  renderItem={item=>{const chosen=selected.includes(item.id);return <ListRow title={item.identifier} subtitle={[cattleLabel(c,item.cattle_purpose),item.status?cattleLabel(c,item.status):null].filter(Boolean).join(' · ')} selected={chosen} disabled={chosen||full} status={chosen?{label:countLabel,tone:'success'}:undefined} leading={<IconTile tone={chosen?'success':'brand'}><DairyIcon name="cow" size={20} color={chosen?colors.success:colors.primary}/></IconTile>} accessibilityLabel={`${chooseLabel}: ${item.identifier}`} onPress={()=>onSelect(item)}/>;}}/>;
}
