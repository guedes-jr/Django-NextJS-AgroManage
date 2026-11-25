/** Public plan data only. Subscription quotes remain authoritative on the server. */
export type PublicPlanTier={id:string;label:string;price:number|null;min:number|null;max:number|null};
export type PublicPlanSegment={id:string;name:string;subtitle:string;description:string;image:string;icon:string;accent:'green'|'wine';metric:string;annualDiscountPercent:number;tiers:PublicPlanTier[]};
const quantity=(value:unknown)=>typeof value==='number'&&Number.isInteger(value)&&value>=0?value:null;
/** Tier whose quantity range covers the amount (tiers keep the catalog order). */
export function tierForQuantity(tiers:PublicPlanTier[],amount:number){return tiers.find(tier=>(tier.min===null||amount>=tier.min)&&(tier.max===null||amount<=tier.max))??null;}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function text(value:Record<string,unknown>,key:string){if(typeof value[key]!=='string')throw new Error('Invalid plan catalog');return value[key] as string;}
function amount(value:unknown){if(typeof value!=='string'||!/^\d+(\.\d+)?$/.test(value)||!Number.isFinite(Number(value)))throw new Error('Invalid plan amount');return Number(value);}
export function parsePublicPlanCatalog(value:unknown):PublicPlanSegment[]{
  if(!Array.isArray(value))throw new Error('Invalid plan catalog');
  const codes=new Set<string>();const tierIds=new Set<string>();
  return value.map((entry:unknown)=>{
    if(!record(entry)||!Array.isArray(entry.tiers))throw new Error('Invalid plan catalog');
    const id=text(entry,'code');if(!id||codes.has(id))throw new Error('Duplicate plan');codes.add(id);
    const discount=amount(entry.annual_discount_percent);if(discount>100)throw new Error('Invalid discount');
    const tiers=entry.tiers.map((tier:unknown):PublicPlanTier=>{
      if(!record(tier)||typeof tier.requires_quote!=='boolean')throw new Error('Invalid plan tier');
      const id=text(tier,'id');if(!id||tierIds.has(id))throw new Error('Duplicate tier');tierIds.add(id);
      const price=tier.monthly_price===null?null:amount(tier.monthly_price);
      return{id,label:text(tier,'label'),price:tier.requires_quote?null:price,min:quantity(tier.minimum_quantity),max:quantity(tier.maximum_quantity)};
    });
    return{id,name:text(entry,'name'),subtitle:text(entry,'subtitle'),description:text(entry,'description'),image:typeof entry.image_path==='string'&&/^\/(?!\/)/.test(entry.image_path)?entry.image_path:'/farm-hero.jpg',icon:text(entry,'icon'),metric:typeof entry.metric_label==='string'?entry.metric_label:'',accent:entry.accent==='wine'?'wine' as const:'green' as const,annualDiscountPercent:discount,tiers};
  }).filter(entry=>entry.tiers.length>0);
}
export async function getPublicPlanCatalog(signal:AbortSignal){
  const response=await fetch('/api/v1/public/plan-segments/',{signal,credentials:'omit',cache:'no-store',headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('Public catalog unavailable');return parsePublicPlanCatalog(await response.json());
}
export async function createPublicSubscriptionQuote(tierIds:string[],billing:'monthly'|'yearly'){
  const response=await fetch('/api/v1/public/subscription-quotes/',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({tier_ids:tierIds,billing_cycle:billing})});
  if(!response.ok)throw new Error('Quote unavailable');const quote:unknown=await response.json();
  if(!record(quote)||typeof quote.public_token!=='string'||!quote.public_token||typeof quote.requires_contact!=='boolean')throw new Error('Invalid quote');
  return{public_token:quote.public_token,requires_contact:quote.requires_contact};
}
