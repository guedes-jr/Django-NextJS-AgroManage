import {z} from 'zod';
import type {User} from '../auth/contracts';
import {canWriteClinic} from './contracts';
import {normalizedDecimal} from './vaccinationContracts';
export function canApplyMedication(user:User){return canWriteClinic(user)&&['admin','manager'].includes(user.access.role);}
const decimal=z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/);
export const medicationLotSchema=z.object({id:z.uuid(),item:z.uuid(),name:z.string(),unit:z.string().min(1).max(20),number:z.string(),balance:decimal,expiry:z.iso.date().nullable(),received:z.iso.date(),withdrawal_days:z.number().int().nonnegative()});
export type MedicationLot=z.infer<typeof medicationLotSchema>;
export const medicationLotsSchema=z.object({count:z.number().int().nonnegative(),next:z.string().nullable(),previous:z.string().nullable(),results:z.array(medicationLotSchema)});
export const medicationOptionsSchema=z.object({today:z.iso.date(),timezone:z.string().min(1)});
export const medicationInputSchema=z.object({animal:z.uuid(),expected_farm:z.uuid(),inventory_lot:z.uuid(),expected_unit:z.string().min(1).max(20),quantity:z.string().regex(/^\d{1,8}(?:[.,]\d{1,2})?$/).refine(v=>Number(v.replace(',','.'))>0).transform(normalizedDecimal),date:z.iso.date(),description:z.string().trim().min(1).max(200),responsible:z.string().trim().max(100),notes:z.string().trim().max(2000),milk_withdrawal_until:z.iso.date().nullable(),meat_withdrawal_until:z.iso.date().nullable()}).refine(v=>(!v.milk_withdrawal_until||v.milk_withdrawal_until>=v.date)&&(!v.meat_withdrawal_until||v.meat_withdrawal_until>=v.date));
export type MedicationInput=z.infer<typeof medicationInputSchema>;
export const medicationReviewSchema=z.object({animal:z.object({id:z.uuid(),identifier:z.string(),farm:z.uuid(),farm_name:z.string()}),lot:medicationLotSchema,quantity:decimal,remaining:decimal,minimum_withdrawal:z.iso.date().nullable(),command:medicationInputSchema,preview_token:z.string().min(1).max(60000)});
export type MedicationReview=z.infer<typeof medicationReviewSchema>;
export function medicationKey(value:MedicationInput){return JSON.stringify(medicationInputSchema.parse(value));}
export function validateMedicationReview(review:MedicationReview,input:MedicationInput){const v=medicationInputSchema.parse(input);if(medicationKey(review.command)!==medicationKey(v)||review.animal.id!==v.animal||review.animal.farm!==v.expected_farm||review.lot.id!==v.inventory_lot||review.lot.unit!==v.expected_unit||normalizedDecimal(review.quantity)!==v.quantity)throw Error('medication review scope');return review;}
