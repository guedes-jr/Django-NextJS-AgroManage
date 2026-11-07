import { getPublicTranslator } from '@/lib/publicLocaleServer';
import type { Metadata } from 'next';
import { LegalDocument } from '@/components/marketing/LegalDocument';
export async function generateMetadata():Promise<Metadata>{const{t}=await getPublicTranslator();return{title:t('public.privacyFazendaMais'),description:t('public.howFazendaMaisHandlesAndProtectsYourOrganizationSInformation'),alternates:{canonical:'/privacidade'}};}
export default async function PrivacidadePage(){const{t,language}=await getPublicTranslator();return <LegalDocument kind="privacy" t={t} language={language}/>;}
