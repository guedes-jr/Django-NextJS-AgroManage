import {useState} from 'react';
import {useAuth} from '../auth/AuthProvider';
import {workspaceMessages} from '../workspace/messages';
import {colors} from '../../theme/tokens';
import {IconTile,ListRow,Notice,PickerModal} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {batchMessages} from './batchMessages';
import {cattleMessages,cattleLabel} from './messages';
import {DairyIcon} from './DairyIcon';
import type {CattleAnimal,CattleBatch,Production} from './contracts';
export function CattlePicker({source,production,animals,selected,onAnimal,onDestination,onClose}:{source:CattleBatch;production:Production;animals:boolean;selected:string[];onAnimal:(record:CattleAnimal)=>void;onDestination:(record:CattleBatch)=>void;onClose:()=>void}){
 const {controller,language}=useAuth();const w=workspaceMessages[language];const b=batchMessages[language];const t=cattleMessages[language];const [search,setSearch]=useState('');
 const list=useInfinitePages<CattleAnimal|CattleBatch>({queryKey:['cattle-picker',production,source.id,animals,search,'infinite'],enabled:true,fetchPage:(page,signal)=>controller.cattleList({production,farm:source.farm_id,kind:animals?'animals':'batches',batch:animals?source.id:undefined,status:'active',page,search},signal)});
 return <PickerModal<CattleAnimal|CattleBatch> title={animals?b.participants:b.destination} language={language} onClose={onClose} search={search} onSearch={setSearch} searchPlaceholder={t.search} list={list} keyExtractor={r=>r.id} emptyLabel={t.empty} errorLabel={w.error}
  header={animals?<Notice tone="info" text={`${b.selected}: ${selected.length}`}/>:undefined}
  renderItem={item=>{
   const compatible='identifier' in item?item.batch===source.id&&item.farm===source.farm_id:item.id!==source.id&&item.farm_id===source.farm_id&&item.category===source.category&&item.gender===source.gender&&item.cattle_purpose===source.cattle_purpose;
   const isSelected=selected.includes(item.id);
   const disabled=!compatible||(!isSelected&&animals&&selected.length>=1000);
   return <ListRow title={'identifier' in item?item.identifier:item.batch_code} meta={item.name||undefined} subtitle={[cattleLabel(t,item.category),cattleLabel(t,item.gender),'quantity' in item?`${item.quantity} ${t.quantity.toLowerCase()}`:null].filter(Boolean).join(' · ')} selected={isSelected} disabled={disabled} status={!compatible?{label:b.incompatible,tone:'neutral'}:isSelected?{label:b.choose,tone:'success'}:undefined} leading={<IconTile tone={isSelected?'success':'brand'}><DairyIcon name={'identifier' in item?'cow':'herd'} size={20} color={isSelected?colors.success:colors.primary}/></IconTile>} accessibilityLabel={`${b.choose}: ${'identifier' in item?item.identifier:item.batch_code}`} onPress={()=>'identifier' in item?onAnimal(item):onDestination(item)}/>;
  }}/>;
}
