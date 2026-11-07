/** Anonymous catalog: a module route alone never proves commercial availability. */
export type PublicSegment = {code:string;name:string;subtitle:string;description:string;metric:string;hasTiers:boolean};
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function text(entry:Record<string,unknown>,key:string):string{const value=entry[key];if(typeof value!=='string')throw new Error('Invalid public segment');return value;}
export function parsePublicSegments(value:unknown):PublicSegment[]{
  if(!Array.isArray(value))throw new Error('Invalid public catalog');
  return value.map((entry:unknown)=>{
    if(!record(entry)||!Array.isArray(entry.tiers)||!entry.tiers.every((tier:unknown)=>record(tier)&&typeof tier.id==='string'&&typeof tier.requires_quote==='boolean'&&(tier.monthly_price===null||typeof tier.monthly_price==='string')))throw new Error('Invalid public segment');
    const code=text(entry,'code');if(!code)throw new Error('Invalid public segment');
    return{code,name:text(entry,'name'),subtitle:text(entry,'subtitle'),description:text(entry,'description'),metric:text(entry,'metric_label'),hasTiers:entry.tiers.length>0};
  });
}
export async function getPublicSegments(signal:AbortSignal):Promise<PublicSegment[]>{
  const response=await fetch('/api/v1/public/plan-segments/',{signal,credentials:'omit',headers:{Accept:'application/json'},cache:'no-store'});
  if(!response.ok)throw new Error('Public catalog unavailable');
  return parsePublicSegments(await response.json());
}
