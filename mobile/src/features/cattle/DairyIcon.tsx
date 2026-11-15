import Svg,{Circle,Ellipse,Path,Rect} from 'react-native-svg';
import {HomeIcon,type HomeIconName} from '../home/HomeIcon';
export type DairyIconName=HomeIconName|'cow'|'bull'|'calf'|'lactation'|'milk'|'milk-off'|'tank'|'wheat'|'reproduction'|'pasture'|'clipboard'|'herd';
const domainIcons=new Set<DairyIconName>(['cow','bull','calf','lactation','milk','milk-off','tank','wheat','reproduction','pasture','clipboard','herd']);
export function DairyIcon({name,color='#24663D',size=24}:{name:DairyIconName;color?:string;size?:number}){
 if(!domainIcons.has(name))return <HomeIcon name={name as HomeIconName} color={color} size={size}/>;
 return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
  {(['cow','bull','calf'] as DairyIconName[]).includes(name)&&<>
   {name==='bull'?<Path d="M7 7C3 7 2 4 3 2c1 3 3 2 5 3m9 2c4 0 5-3 4-5-1 3-3 2-5 3"/>:name==='cow'?<Path d="M8 6 6 3m10 3 2-3"/>:null}
   <Path d="M7 7C3 5 1 7 2 10c2 1 4 0 5-1m10-2c4-2 6 0 5 3-2 1-4 0-5-1M8 6h8l2 7-2 6H8l-2-6Z"/>
   <Rect x={7} y={15} width={10} height={6} rx={3}/><Path d="M10 18h.01M14 18h.01M9 10h.01M15 10h.01"/>
  </>}
  {name==='lactation'&&<><Path d="M5 3v5c0 4 2 6 7 6s7-2 7-6V3M8 13v4m4-3v3m4-4v4"/><Path d="M8 20c0-1 1-2 1-2s1 1 1 2a1 1 0 0 1-2 0Zm7 0c0-1 1-2 1-2s1 1 1 2a1 1 0 0 1-2 0Z"/></>}
  {(name==='milk'||name==='milk-off')&&<><Path d="M9 3h6v3l3 4v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V10l3-4ZM9 6h6M6 12h12M9 2h6"/>{name==='milk-off'&&<Path d="m3 3 18 18"/>}</>}
  {name==='tank'&&<><Ellipse cx={12} cy={5} rx={8} ry={3}/><Path d="M4 5v12c0 4 16 4 16 0V5M7 20v2m10-2v2M8 11h8M12 8v6"/></>}
  {name==='wheat'&&<><Path d="M12 22V5M12 9C7 9 5 6 5 3c4 0 7 2 7 6Zm0 5c-5 0-7-3-7-6 4 0 7 2 7 6Zm0 5c-5 0-7-3-7-6 4 0 7 2 7 6Zm0-10c5 0 7-3 7-6-4 0-7 2-7 6Zm0 5c5 0 7-3 7-6-4 0-7 2-7 6Zm0 5c5 0 7-3 7-6-4 0-7 2-7 6Z"/></>}
  {name==='reproduction'&&<><Circle cx={8} cy={13} r={5}/><Path d="M8 18v5m-3-2h6"/><Circle cx={16} cy={9} r={4}/><Path d="m19 6 3-4m-4 0h4v4"/></>}
  {name==='pasture'&&<><Path d="M2 20h20M4 20v-9m8 9v-9m8 9v-9M2 13h20M2 17h20M3 8c4-5 9-5 13-2l5-3"/><Circle cx={6} cy={4} r={2}/></>}
  {name==='clipboard'&&<><Rect x={5} y={4} width={14} height={18} rx={2}/><Rect x={9} y={2} width={6} height={4} rx={1}/><Path d="m8 12 2 2 5-5M8 18h8"/></>}
  {name==='herd'&&<><Rect x={3} y={9} width={12} height={12} rx={3}/><Path d="M6 9V6m6 3V6M3 11 1 8m14 3 2-3M6 17h.01M12 17h.01M7 13h.01M11 13h.01M16 4h3l2 4v8m-4-6h4M17 4V2m3 2 2-2"/></>}
 </Svg>;
}
