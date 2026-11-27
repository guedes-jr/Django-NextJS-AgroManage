import { z } from 'zod';
import { languages } from '../../i18n/messages';

export const credentialsSchema = z.object({
  email: z.string().trim().pipe(z.email('invalidEmail')),
  password: z.string().min(1, 'requiredPassword'),
});
export type Credentials = z.infer<typeof credentialsSchema>;
export const registrationSchema = z.object({
  full_name: z.string().trim().min(1, 'requiredName').max(255, 'nameTooLong'),
  email: credentialsSchema.shape.email,
  phone: z.string().trim().max(30, 'phoneTooLong'),
  phone_is_whatsapp: z.boolean(),
  receive_system_alerts: z.boolean(),
  password: z.string().min(8, 'passwordLength'),
  password_confirm: z.string().min(1, 'passwordMismatch'),
}).superRefine((value, context) => {
  if (value.password !== value.password_confirm) context.addIssue({ code: 'custom', path: ['password_confirm'], message: 'passwordMismatch' });
  if (value.phone_is_whatsapp && !value.phone) context.addIssue({ code: 'custom', path: ['phone'], message: 'requiredWhatsAppPhone' });
});
export type Registration = z.infer<typeof registrationSchema>;
export type RegistrationField = keyof Registration;
export const tokensSchema = z.object({ access: z.string().min(1), refresh: z.string().min(1) });
export type Tokens = z.infer<typeof tokensSchema>;
export const userSchema = z.object({
  id: z.string().min(1), email: z.string(), full_name: z.string(),
  force_password_change: z.boolean(), is_platform_staff: z.boolean(), affiliate_portal_only: z.boolean(),
  access: z.object({
    role: z.enum(['admin', 'manager', 'operator', 'veterinarian']),
    can_manage_users: z.boolean(), can_view_financial: z.boolean(), can_operate_crops: z.boolean(),
    livestock_species: z.array(z.string()).nullable(), read_only: z.boolean(),
    // Segments this member can open now (contracted ∩ role scope) and those the organization contracted.
    segments: z.array(z.string()).optional(), contracted_segments: z.array(z.string()).optional(),
    // Área do veterinário contracted and allowed for this role; segment options (Configurações).
    veterinary: z.boolean().optional(),
    segment_features: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
    // "suspended": the API answers 402 outside the payment screen (see backend enforce_request).
    subscription_status: z.string().nullable().optional(),
  }),
});
export type User = z.infer<typeof userSchema>;
export const VETERINARY_SEGMENT = 'area-veterinario';
/** Subscription suspended for non-payment: only the payment screen opens. */
export const isSuspended = (user: Pick<User, 'access'>) => user.access.subscription_status === 'suspended';
export const isVeterinarian = (user: Pick<User, 'access'>) => user.access.role === 'veterinarian';
/** Operator and veterinarian only open the segments enabled for them in Membros. */
export const isScoped = (access: User['access']) => access.role === 'operator' || access.role === 'veterinarian';
/** A veterinarian without other segments works only in the Área do veterinário. */
export const isVeterinaryOnly = (access: User['access']) => access.role === 'veterinarian' && !(access.segments ?? []).some(code => code !== VETERINARY_SEGMENT);
/** Segment opened by the member now; older payloads without the list keep the previous behaviour. */
export const hasSegment = (access: User['access'], code: string) => !access.segments || access.segments.includes(code);
/** Business areas that work with the cattle herd (backend apps/billing/segments.py CATTLE_SEGMENTS). */
export const BEEF_SEGMENT = 'gado-de-corte';
export const DAIRY_SEGMENT = 'pecuaria-leiteira';
export const SWINE_SEGMENT = 'suinocultura';
export const CATTLE_SEGMENTS = [BEEF_SEGMENT, DAIRY_SEGMENT] as const;
export const hasAnySegment = (access: User['access'], codes: readonly string[]) => codes.some(code => hasSegment(access, code));
export const organizationSchema = z.object({ id: z.string().min(1), name: z.string(), language: z.enum(languages) });
export type Organization = z.infer<typeof organizationSchema>;
export type Session = { user: User; organization: Organization };
export const newPasswordSchema = z.object({
  password: z.string().min(8, 'passwordLength'),
  confirmation: z.string().min(1, 'passwordMismatch'),
}).refine(value => value.password === value.confirmation, { path: ['confirmation'], message: 'passwordMismatch' });
