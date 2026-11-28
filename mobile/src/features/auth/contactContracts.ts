import {z} from 'zod';

export const contactChannelSchema = z.enum(['email', 'whatsapp', 'telegram']);
export const userContactSchema = z.object({
  name: z.string().trim().min(1).max(150),
  kind: z.enum(['phone', 'email']),
  value: z.string().trim().min(1).max(255),
  is_whatsapp: z.boolean(),
  is_telegram: z.boolean(),
  notifications: z.array(contactChannelSchema).max(3),
});
export const userContactsSchema = z.array(userContactSchema).superRefine((contacts, context) => {
  const channels = contacts.flatMap(contact => contact.notifications);
  if (new Set(channels).size !== channels.length) {
    context.addIssue({code: 'custom', message: 'One contact per channel'});
  }
});
export type UserContact = z.infer<typeof userContactSchema>;

export function initialContacts(email: string, phone: string, whatsapp: boolean, telegram: boolean): UserContact[] {
  const contacts: UserContact[] = [];
  if (email) contacts.push({name: 'E-mail', kind: 'email', value: email, is_whatsapp: false, is_telegram: false, notifications: ['email']});
  if (phone) contacts.push({name: 'Telefone', kind: 'phone', value: phone, is_whatsapp: whatsapp, is_telegram: telegram,
    notifications: [...(whatsapp ? ['whatsapp' as const] : []), ...(telegram ? ['telegram' as const] : [])]});
  return contacts;
}
