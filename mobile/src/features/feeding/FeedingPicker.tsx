import {useState} from 'react';
import {Keyboard} from 'react-native';
import {useAuth} from '../auth/AuthProvider';
import {workspaceMessages} from '../workspace/messages';
import {DairyIcon} from '../cattle/DairyIcon';
import {colors} from '../../theme/tokens';
import {IconTile,ListRow,PickerModal} from '../../components/mobile';
import {useInfinitePages} from '../../components/mobile/useInfinitePages';
import type {Production} from '../cattle/contracts';
import {feedingProductPage,feedingFormulaPage,type FeedingProduct,type FeedingFormula} from './contracts';
import {feedingMessages} from './messages';
export function FeedingPicker({production,kind,onSelect,onClose}:{production:Production;kind:'products'|'formulas';onSelect:(value:FeedingProduct|FeedingFormula)=>void;onClose:()=>void}){
 const {controller,language}=useAuth();const t=feedingMessages[language],w=workspaceMessages[language];const [search,setSearch]=useState('');
 const list=useInfinitePages<FeedingProduct|FeedingFormula>({queryKey:['feeding-picker',kind,production,search,'infinite'],enabled:true,fetchPage:async(page,signal)=>{const data=await controller.dailyFeeding({production,resource:kind,search,page},signal);return kind==='products'?feedingProductPage.parse(data):feedingFormulaPage.parse(data);}});
 return <PickerModal<FeedingProduct|FeedingFormula> title={kind==='products'?t.chooseProduct:t.chooseFormula} language={language} onClose={onClose} search={search} onSearch={setSearch} searchPlaceholder={t.searchChoice} list={list} keyExtractor={row=>row.id} emptyLabel={t.empty} errorLabel={w.error}
  renderItem={item=><ListRow title={item.name} subtitle={'item_name' in item?`${t.product}: ${item.item_name}`:undefined} leading={<IconTile tone="warning"><DairyIcon name="wheat" size={20} color={colors.warning}/></IconTile>} accessibilityLabel={`${t.select}: ${item.name}`} onPress={()=>{Keyboard.dismiss();onSelect(item);}}/>}/>;
}
