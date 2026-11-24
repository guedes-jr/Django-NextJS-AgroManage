import {useState} from 'react';
import {Keyboard} from 'react-native';
import {useAuth} from '../auth/AuthProvider';
import {workspaceMessages} from '../workspace/messages';
import {DairyIcon} from '../cattle/DairyIcon';
import {IconTile,ListRow,PickerModal} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import type {ClinicAnimal} from './contracts';
import {clinicMessages} from './messages';
/** Searchable list of the active animals the user may record health events for. */
export function AnimalPicker({farm,species,onSelect,onClose}:{farm?:string;species?:string;onSelect:(animal:ClinicAnimal)=>void;onClose:()=>void}){
 const {controller,language}=useAuth();const t=clinicMessages[language],w=workspaceMessages[language];const [search,setSearch]=useState('');
 const list=useInfinitePages<ClinicAnimal>({queryKey:['clinic-picker',farm,species,search,'infinite'],enabled:true,fetchPage:(page,signal)=>controller.clinicAnimals({kind:'health',page,search,species:species??'',start:'',end:'',...(farm?{farm}:{})},signal)});
 return <PickerModal<ClinicAnimal> title={t.choose} language={language} onClose={onClose} search={search} onSearch={setSearch} searchPlaceholder={t.animal} list={list} keyExtractor={row=>row.id} emptyLabel={t.empty} errorLabel={w.error}
  renderItem={item=><ListRow title={item.identifier} subtitle={`${item.farm_name} · ${t.labels[item.species]??item.species}`} leading={<IconTile tone="brand"><DairyIcon name="cow" size={20}/></IconTile>} accessibilityLabel={`${t.pick}: ${item.identifier} · ${item.farm_name}`} onPress={()=>{Keyboard.dismiss();onSelect(item);}}/>}/>;
}
