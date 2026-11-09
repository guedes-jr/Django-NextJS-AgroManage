import {z} from 'zod';

export const healthTypes=['medication','exam','surgery','other'] as const;
export const healthInputSchema=z.object({
 animal:z.uuid(),expected_farm:z.uuid(),treatment_type:z.enum(healthTypes),application_date:z.iso.date(),
 description:z.string().trim().min(1).max(8000),veterinary:z.string().trim().max(100),notes:z.string().trim().max(8000),
});
export const healthOptionsSchema=z.object({today:z.iso.date(),timezone:z.string().min(1),treatment_types:z.array(z.object({value:z.enum(healthTypes),label:z.string()})).min(1)});
export type HealthInput=z.infer<typeof healthInputSchema>;
export type HealthOptions=z.infer<typeof healthOptionsSchema>;
