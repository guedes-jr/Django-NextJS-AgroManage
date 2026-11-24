import {z} from 'zod';
import type {User} from '../auth/contracts';
import {canOpenModule} from '../home/contracts';

export function canReadStructures(user:User){return !user.force_password_change&&!user.is_platform_staff&&!user.affiliate_portal_only&&canOpenModule(user.access,'structure');}
export const structureCategories=['corral','pigsty','poultry_house','warehouse','irrigation','water_reservoir','facility','fence','other'] as const;
export type StructureCategory=typeof structureCategories[number];
const decimal=z.union([z.string(),z.number()]).transform(v=>String(v));
export const structureItemSchema=z.object({id:z.uuid(),name:z.string(),quantity:decimal,unit:z.string(),value:decimal.optional()});
export const structureSchema=z.object({
 id:z.uuid(),farm:z.uuid(),farm_name:z.string(),category:z.enum(structureCategories),category_label:z.string(),name:z.string(),description:z.string(),
 built_area_m2:decimal.nullable(),length_m:decimal.nullable(),width_m:decimal.nullable(),quantity:z.number(),
 acquisition_value:decimal.optional(),current_value:decimal.optional(),acquisition_date:z.iso.date().nullable(),last_maintenance_date:z.iso.date().nullable(),next_maintenance_date:z.iso.date().nullable(),maintenance_notes:z.string(),
 maintenance_status:z.enum(['not_scheduled','overdue','due_soon','scheduled']),is_active:z.boolean(),notes:z.string(),items:z.array(structureItemSchema),items_value:decimal.optional(),
});
export type FarmStructure=z.infer<typeof structureSchema>;
export const structurePageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable().optional().transform(v=>v??null),results:z.array(structureSchema)});
export const structureQuerySchema=z.object({category:z.enum(['',...structureCategories]).default(''),search:z.string().trim().max(100).default(''),farm:z.uuid().optional(),page:z.number().int().min(1).max(100000).default(1)});
export type StructureQuery=z.input<typeof structureQuerySchema>;
