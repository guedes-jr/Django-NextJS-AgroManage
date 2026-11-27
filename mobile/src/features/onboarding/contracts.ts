import {z} from 'zod';
import {priceSchema} from '../organization/contracts';

/** First access (segments → price → terms) and end of the free trial; same contract as the web. */
export type BillingCycle='monthly'|'yearly';
export type SegmentSelection={segment_code:string;quantity:number|null};
const tier=z.object({id:z.string(),label:z.string(),minimum_quantity:z.number().nullable(),maximum_quantity:z.number().nullable(),monthly_price:z.string().nullable(),requires_quote:z.boolean()});
export const catalogSchema=z.array(z.object({code:z.string(),name:z.string(),subtitle:z.string().default(''),metric_label:z.string().default(''),tiers:z.array(tier)}).passthrough());
export type CatalogSegment=z.infer<typeof catalogSchema>[number];
export type CatalogTier=CatalogSegment['tiers'][number];
export const onboardingStateSchema=z.object({pending:z.boolean(),can_complete:z.boolean(),trial_days:z.number(),terms_version:z.string()});
export type OnboardingState=z.infer<typeof onboardingStateSchema>;
export const onboardingSummarySchema=z.object({
 price:priceSchema.extend({lines:z.array(priceSchema.shape.lines.element.extend({quantity:z.number().nullable().optional()}))}),
 billing_cycle:z.enum(['monthly','yearly']),months:z.number(),cycle_total:z.string(),unpriced:z.array(z.string()),
 trial_days:z.number(),trial_ends_at:z.string(),coupon_applied:z.boolean(),coupon_error:z.string(),terms_version:z.string(),
});
export type OnboardingSummary=z.infer<typeof onboardingSummarySchema>;
export const subscribeResultSchema=z.object({invoice:z.object({id:z.string(),number:z.string(),total:z.string()}).passthrough().nullable()}).passthrough();

/** A segment priced by size needs a quantity (tiers with a range). */
export const isSized=(segment:CatalogSegment)=>segment.tiers.some(t=>t.minimum_quantity!==null||t.maximum_quantity!==null);
/** Active tier covering the quantity (catalog order), the single tier for unsized segments. */
export function tierFor(segment:CatalogSegment,quantity:number|null):CatalogTier|null{
 if(!isSized(segment))return segment.tiers[0]??null;
 if(quantity===null||!(quantity>=1))return null;
 return segment.tiers.find(t=>(t.minimum_quantity===null||quantity>=t.minimum_quantity)&&(t.maximum_quantity===null||quantity<=t.maximum_quantity))??null;
}
/** Selection sent to the server, or null while a chosen sized segment has no valid quantity. */
export function buildSelection(catalog:CatalogSegment[],chosen:Record<string,string>):SegmentSelection[]|null{
 const rows=catalog.filter(segment=>segment.code in chosen).map(segment=>({segment_code:segment.code,quantity:isSized(segment)?Number.parseInt(chosen[segment.code]??'',10):null}));
 if(!rows.length||rows.some(row=>row.quantity!==null&&!(row.quantity>=1)))return null;
 return rows;
}
/** Whole days left in the free trial (0 on its last day). */
export const trialDaysLeft=(endsAt:string,now=Date.now())=>Math.max(0,Math.ceil((new Date(endsAt).getTime()-now)/86400000));
