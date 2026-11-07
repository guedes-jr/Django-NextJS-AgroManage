import { getPublicTranslator } from '@/lib/publicLocaleServer';
import type { Metadata } from 'next';
import { LegalDocument } from '@/components/marketing/LegalDocument';
export async function generateMetadata():Promise<Metadata>{const{t}=await getPublicTranslator();return{title:t('public.termsOfUseFazendaMais'),description:t('public.generalConditionsForUsingFazendaMaisServices'),alternates:{canonical:'/termos'}};}
export default async function TermosPage(){const{t,language}=await getPublicTranslator();return <LegalDocument kind="terms" t={t} language={language}/>;}
