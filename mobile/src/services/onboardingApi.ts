import type {AxiosInstance} from 'axios';
import type {Language} from '../i18n/messages';
import {catalogSchema,onboardingStateSchema,onboardingSummarySchema,subscribeResultSchema,type BillingCycle,type SegmentSelection} from '../features/onboarding/contracts';
import type {PaymentMethod} from '../features/organization/contracts';

type Tokens={access:string};
type Options=(language:Language,access?:string)=>{headers:Record<string,string>};
/** First access, end of the free trial and welcome tour (backend apps/billing/onboarding.py). */
export function createOnboardingEndpoints(http:AxiosInstance,options:Options){
 return {
  async onboardingState(tokens:Tokens,language:Language,signal?:AbortSignal){return onboardingStateSchema.parse((await http.get('organizations/me/onboarding/',{...options(language,tokens.access),signal})).data);},
  async planCatalog(tokens:Tokens,language:Language,signal?:AbortSignal){return catalogSchema.parse((await http.get('public/plan-segments/',{...options(language,tokens.access),signal})).data);},
  async onboardingPreview(tokens:Tokens,language:Language,segments:SegmentSelection[],billing_cycle:BillingCycle,coupon:string,signal?:AbortSignal){return onboardingSummarySchema.parse((await http.post('organizations/me/onboarding/preview/',{segments,billing_cycle,coupon},{...options(language,tokens.access),signal})).data);},
  async onboardingComplete(tokens:Tokens,language:Language,segments:SegmentSelection[],billing_cycle:BillingCycle,coupon:string,terms_version:string){await http.post('organizations/me/onboarding/complete/',{segments,billing_cycle,coupon,accepted_terms:true,terms_version},options(language,tokens.access));},
  async savePaymentMethod(tokens:Tokens,language:Language,payment_method:PaymentMethod){await http.put('organizations/me/subscription/payment-method/',{payment_method},options(language,tokens.access));},
  async confirmSubscription(tokens:Tokens,language:Language,payment_method:PaymentMethod){return subscribeResultSchema.parse((await http.post('organizations/me/subscription/subscribe/',{payment_method},options(language,tokens.access))).data);},
  async finishWelcomeTour(tokens:Tokens,language:Language){await http.post('auth/welcome-tour/',{},options(language,tokens.access));},
 };
}
