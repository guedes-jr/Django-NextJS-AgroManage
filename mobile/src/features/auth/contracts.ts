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
    role: z.enum(['admin', 'manager', 'operator', 'feeder']),
    can_manage_users: z.boolean(), can_view_financial: z.boolean(), can_operate_crops: z.boolean(),
    livestock_species: z.array(z.string()).nullable(), read_only: z.boolean(),
  }),
});
export type User = z.infer<typeof userSchema>;
export const organizationSchema = z.object({ id: z.string().min(1), name: z.string(), language: z.enum(languages) });
export type Organization = z.infer<typeof organizationSchema>;
export type Session = { user: User; organization: Organization };
export const newPasswordSchema = z.object({
  password: z.string().min(8, 'passwordLength'),
  confirmation: z.string().min(1, 'passwordMismatch'),
}).refine(value => value.password === value.confirmation, { path: ['confirmation'], message: 'passwordMismatch' });
