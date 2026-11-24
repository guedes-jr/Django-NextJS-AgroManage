import {useState} from 'react';
import {Keyboard} from 'react-native';
import {useAuth} from '../auth/AuthProvider';
import {workspaceMessages} from '../workspace/messages';
import {HomeIcon} from '../home/HomeIcon';
import {colors} from '../../theme/tokens';
import {IconTile,ListRow,PickerModal} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import {inventoryMessages} from './messages';
import {launchMessages} from './launchMessages';
type Kind='items'|'lots'|'farms'|'suppliers';
type Row={id:string;label:string;disabled:boolean};
export function LaunchPicker({kind,item,today,unit,withdrawal=false,feedProduct,onSelect,onClose}:{kind:Kind;item?:string;today:string;unit?:string;withdrawal?:boolean;feedProduct?:'ingredient'|'final';onSelect:(id:string,label:string)=>void;onClose:()=>void}){
 const {controller,language}=useAuth();const t=launchMessages[language],i=inventoryMessages[language],w=workspaceMessages[language];const [search,setSearch]=useState('');
 const list=useInfinitePages<Row>({queryKey:['inventory-launch-picker',kind,item,search,feedProduct,'infinite'],enabled:true,fetchPage:async(page,signal)=>{
  if(kind==='farms'){const result=await controller.farms(page,signal);return {results:result.results.map(r=>({id:r.id,label:r.name,disabled:r.is_active===false})),next:result.next};}
  const result=await controller.inventoryPage({kind:kind==='lots'?'lots':kind, ...(kind==='lots'?{item}:{}),page,search,status:'all',category:''},signal);
  return {results:result.results.map(r=>({id:r.id,label:'numero_lote' in r?`${r.numero_lote||r.id.slice(0,8)} · ${r.quantidade_atual} ${unit??''}`:'nome' in r?r.nome:r.id,disabled:!!feedProduct&&('unidade_medida' in r&&(r.unidade_medida!=='kg'||feedProduct==='final'&&r.categoria!=='racao'&&!r.categorias.includes('racao')))||!('ativo' in r)||!r.ativo||('numero_lote' in r&&(r.data_entrada>today||!!r.data_validade&&r.data_validade<today||withdrawal&&Number(r.quantidade_atual)<=0))})),next:result.next};
 }});
 const title=kind==='items'?t.chooseProduct:kind==='lots'?t.chooseLot:kind==='farms'?t.chooseFarm:t.chooseSupplier;
 const searchable=kind==='items'||kind==='suppliers';
 return <PickerModal<Row> title={title} language={language} onClose={onClose} search={searchable?search:undefined} onSearch={searchable?setSearch:undefined} searchPlaceholder={title} list={list} keyExtractor={r=>r.id} emptyLabel={i.empty} errorLabel={w.error}
  renderItem={r=><ListRow title={r.label} disabled={r.disabled} status={r.disabled?{label:t.unavailable,tone:'neutral'}:undefined} leading={<IconTile tone="brand"><HomeIcon name={kind==='farms'?'home':kind==='suppliers'?'group':'box'} size={20} color={colors.primary}/></IconTile>} accessibilityLabel={r.disabled?`${t.unavailable}: ${r.label}`:`${t.pick}: ${r.label}`} onPress={()=>{Keyboard.dismiss();onSelect(r.id,r.label);}}/>}/>;
}
