import {z} from 'zod';
import type {User} from '../auth/contracts';
import {canOpenModule} from '../home/contracts';

/** Same gate as the module menu: managers/admins, or operators with crops permission. */
export function canReadCrops(user:User){return !user.force_password_change&&!user.is_platform_staff&&!user.affiliate_portal_only&&canOpenModule(user.access,'crops');}

export const cropStatuses=['planned','planting','growing','management','harvesting','finished','cancelled'] as const;
export type CropStatus=typeof cropStatuses[number];
const decimal=z.union([z.string(),z.number()]).transform(v=>String(v));
const optionalDecimal=decimal.nullable().optional();
export const plantationSchema=z.object({
 id:z.uuid(),name:z.string(),field:z.uuid().optional(),crop_type:z.string().optional(),notes:z.string().optional(),field_name:z.string().nullable().optional(),farm:z.uuid().nullable().optional(),farm_name:z.string().nullable().optional(),
 crop_type_display:z.string().optional(),crop_name:z.string().nullable().optional(),variety:z.string().nullable().optional(),
 planted_area_ha:optionalDecimal,planting_date:z.iso.date().nullable().optional(),expected_harvest_date:z.iso.date().nullable().optional(),
 status:z.enum(cropStatuses),status_display:z.string().optional(),estimated_production_kg:optionalDecimal,estimated_bags:optionalDecimal,responsible_name:z.string().nullable().optional(),
});
export type Plantation=z.infer<typeof plantationSchema>;
export const plantationPageSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable().optional(),results:z.array(plantationSchema)});
export const plantationQuerySchema=z.object({status:z.enum(['',...cropStatuses]).default(''),search:z.string().trim().max(100).default(''),farm:z.uuid().optional(),page:z.number().int().min(1).max(100000).default(1)});
export type PlantationQuery=z.input<typeof plantationQuerySchema>;

/** Plantation dashboard read model; financial figures may be absent for profiles without financial visibility. */
export const plantationDashboardSchema=z.object({
 id:z.uuid(),name:z.string(),crop_name:z.string().nullable().optional(),crop_type_display:z.string().optional(),field_name:z.string().optional(),farm_name:z.string().optional(),variety:z.string().optional(),
 area_ha:decimal,planting_date:z.iso.date().nullable().optional(),expected_harvest_date:z.iso.date().nullable().optional(),actual_harvest_date:z.iso.date().nullable().optional(),
 status:z.enum(cropStatuses),status_display:z.string().optional(),days_in_cultivation:z.number().nullable().optional(),days_remaining:z.number().nullable().optional(),
 investment_total:optionalDecimal,cost_per_ha:optionalDecimal,estimated_revenue:optionalDecimal,estimated_profit:optionalDecimal,estimated_roi:optionalDecimal,real_profit:optionalDecimal,
 estimated_production_kg:optionalDecimal,estimated_bags:optionalDecimal,population:z.union([z.number(),z.string()]).nullable().optional(),spacing:z.string().nullable().optional(),responsible_name:z.string().nullable().optional(),
});
export type PlantationDashboard=z.infer<typeof plantationDashboardSchema>;

/** Operation histories share a lenient read model: identity, date, label, quantity/unit and optional cost. */
export const cropActivityKinds=['land-preparations','plantings','fertilizations','pesticides','irrigations','harvests'] as const;
export type CropActivityKind=typeof cropActivityKinds[number];
export const activityFilter:Record<CropActivityKind,string>={'land-preparations':'plantation',plantings:'plantation',fertilizations:'plantation',pesticides:'plantation',irrigations:'plantation',harvests:'planting_cycle'};
export const activitySchema=z.object({
 id:z.uuid(),date:z.string().nullable().optional(),planting_date:z.string().nullable().optional(),application_date:z.string().nullable().optional(),harvest_date:z.string().nullable().optional(),start_date:z.string().nullable().optional(),
 item_name:z.string().nullable().optional(),operation_type_display:z.string().nullable().optional(),pesticide_type_display:z.string().nullable().optional(),application_method_display:z.string().nullable().optional(),irrigation_system_display:z.string().nullable().optional(),harvest_type_display:z.string().nullable().optional(),execution_type_display:z.string().nullable().optional(),destination_display:z.string().nullable().optional(),
 quantity:optionalDecimal,unit:z.string().nullable().optional(),total_price:optionalDecimal,
});
export type CropActivity=z.infer<typeof activitySchema>;
export const activityPageSchema=z.union([z.array(activitySchema).transform(results=>({count:results.length,next:null as string|null,results})),z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),results:z.array(activitySchema)})]);
export function activityDate(row:CropActivity){return row.harvest_date??row.application_date??row.planting_date??row.date??row.start_date??null;}
export function activityLabel(row:CropActivity){return row.item_name??row.operation_type_display??row.harvest_type_display??row.irrigation_system_display??row.pesticide_type_display??null;}
export function activityDetail(row:CropActivity){return [row.pesticide_type_display,row.application_method_display,row.execution_type_display,row.destination_display].filter((v):v is string=>!!v&&v!==activityLabel(row)).join(' · ');}

/** Operations follow the API write roles (admin/manager/operator with crops), never for read-only access. */
export function canWriteCrops(user:User){return canReadCrops(user)&&!user.access.read_only&&['admin','manager','operator'].includes(user.access.role);}
/** Plantation registration/edition is a management action on the web; same roles here. */
export function canManagePlantations(user:User){return canWriteCrops(user);}

export const cropsDashboardSchema=z.object({total_plantations:z.number().int(),total_active:z.number().int(),total_area_ha:decimal,total_investment:optionalDecimal,total_estimated_revenue:optionalDecimal,total_estimated_production_kg:optionalDecimal,avg_roi:optionalDecimal,upcoming_harvests:z.number().int(),status_counts:z.record(z.string(),z.number()),crop_type_counts:z.record(z.string(),z.number())});
export type CropsDashboard=z.infer<typeof cropsDashboardSchema>;
export const cropFieldSchema=z.object({id:z.uuid(),name:z.string(),farm:z.uuid(),farm_name:z.string().optional(),area_ha:optionalDecimal,is_active:z.boolean().optional()});
export type CropField=z.infer<typeof cropFieldSchema>;
export const cropFieldListSchema=z.union([z.array(cropFieldSchema),z.object({results:z.array(cropFieldSchema),next:z.string().nullable()}).transform(v=>v.results)]);
export const cropItemSchema=z.object({id:z.uuid(),nome:z.string(),unidade_medida:z.string(),estoque_atual:decimal.optional(),categoria:z.string().optional(),categorias:z.array(z.string()).optional(),ativo:z.boolean().optional()});
export type CropItem=z.infer<typeof cropItemSchema>;
export const cropItemListSchema=z.array(cropItemSchema);

export const cropTypes=['grain','fruit','vegetable','forage','fiber','other'] as const;
const day=z.iso.date();
const optionalNumber=z.string().trim().transform(v=>v.replace(',','.')).pipe(z.union([z.literal(''),z.string().regex(/^\d+(\.\d{1,2})?$/)])).transform(v=>v===''?null:v);
const requiredNumber=z.string().trim().transform(v=>v.replace(',','.')).pipe(z.string().regex(/^\d+(\.\d{1,2})?$/)).refine(v=>Number(v)>0);
export const plantationInputSchema=z.object({name:z.string().trim().max(255),field:z.uuid(),crop_type:z.enum(cropTypes),crop_name:z.string().trim().min(1).max(100),variety:z.string().trim().max(100),planted_area_ha:optionalNumber,planting_date:day,expected_harvest_date:z.union([z.literal(''),day]).transform(v=>v||null),status:z.enum(cropStatuses),estimated_production_kg:optionalNumber,notes:z.string().trim().max(2000)});
export type PlantationInput=z.input<typeof plantationInputSchema>;

export const cropOperationKinds=['plantings','fertilizations','pesticides','irrigations','land-preparations','harvests'] as const;
export type CropOperationKind=typeof cropOperationKinds[number];
/** Inventory categories offered per stock-consuming operation (same as the web forms). */
export const operationItemCategories:Partial<Record<CropOperationKind,string[]>>={plantings:['semente'],fertilizations:['fertilizante','corretivo'],pesticides:['defensivo','foliar']};
export const applicationMethods=['broadcast','row','foliar','soil_injection','other'] as const;
export const pesticideTypes=['insecticide','herbicide','fungicide','adjuvant','acaricide','bactericide','other'] as const;
export const irrigationSystems=['center_pivot','drip','sprinkler','micro_sprinkler','hose','other'] as const;
export const landOperations=['calagem','aracao','gradagem','subsolagem','nivelamento','rocagem','plantio','colheita','outro'] as const;
export const executionTypes=['own','rented'] as const;
export const harvestTypes=['partial','total'] as const;
export const harvestDestinations=['stock','sale','own_use','seed','other'] as const;
export const harvestUnits=['kg','sack','box','bale','bundle','truck'] as const;
const text=(max:number)=>z.string().trim().max(max);
const base={plantation:z.uuid(),operator:text(150),notes:text(2000)};
const stock={item:z.uuid(),quantity:requiredNumber,unit:text(20)};
export const cropOperationSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('plantings'),...base,...stock,planting_date:day,spacing:text(100)}),
 z.object({kind:z.literal('fertilizations'),...base,...stock,application_date:day,application_method:z.enum(applicationMethods),area_applied_ha:optionalNumber}),
 z.object({kind:z.literal('pesticides'),...base,...stock,application_date:day,pesticide_type:z.enum(pesticideTypes),active_ingredient:text(200),area_applied_ha:optionalNumber}),
 z.object({kind:z.literal('irrigations'),...base,date:day,irrigation_system:z.enum(irrigationSystems),hours:optionalNumber,flow_rate_l_per_h:optionalNumber}),
 z.object({kind:z.literal('land-preparations'),...base,date:day,operation_type:z.enum(landOperations),execution_type:z.enum(executionTypes),hours_worked:optionalNumber,fuel_liters:optionalNumber}),
 z.object({kind:z.literal('harvests'),plantation:z.uuid(),notes:text(200),harvest_type:z.enum(harvestTypes),harvest_date:day,quantity:requiredNumber,quantity_unit:z.enum(harvestUnits),unit_weight_kg:optionalNumber,destination:z.enum(harvestDestinations),buyer_name:text(255),unit_price:optionalNumber,quality_grade:text(50)}).superRefine((v,ctx)=>{if(v.destination==='sale'&&(!v.buyer_name||!v.unit_price))ctx.addIssue({code:'custom',path:[v.buyer_name?'unit_price':'buyer_name'],message:'sale'});}),
]);
export type CropOperationInput=z.input<typeof cropOperationSchema>;
export type CropOperation=z.output<typeof cropOperationSchema>;
/** API payload: harvest links through `planting_cycle`; prices are never sent except a sale price by financial profiles. */
export function operationPayload(value:CropOperation,financial:boolean):Record<string,unknown>{
 const {kind,...rest}=value;
 if(kind==='harvests'){const {plantation,unit_price,buyer_name,...h}=rest as Extract<CropOperation,{kind:'harvests'}>;const sale=h.destination==='sale';if(sale&&!financial)throw Error('financial');return {...h,planting_cycle:plantation,...(sale?{buyer_name,unit_price}:{buyer_name:''})};}
 return rest;
}
