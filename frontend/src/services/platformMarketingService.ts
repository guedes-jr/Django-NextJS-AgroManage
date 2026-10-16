import { platformApi } from './platformApi';
export type AudienceFilters = { search?: string; state?: string; plans?: string[]; statuses?: string[]; organizations?: string[]; roles: string[] };
export type Audience = { id: string; name: string; filters: AudienceFilters };
export type MarketingImage = { id: string; image: string; mime_type: string };
export type Campaign = { id: string; title: string; body: string; link_url: string; link_label: string; images: string[]; image_details: MarketingImage[]; audience: string; audience_name: string; send_in_app: boolean; send_whatsapp: boolean; status: string; recipient_count: number; summary: {prepared: number; skipped: number; read: number; deliveries: {deliveries__status: string; total: number}[]} };
export type CampaignInput = Pick<Campaign, 'title' | 'body' | 'link_url' | 'link_label' | 'images' | 'audience' | 'send_in_app' | 'send_whatsapp'>;
export type AudiencePreview = { organizations: number; recipients: number; in_app: number; whatsapp: number; sample: {id: string; name: string}[]; token: string };
type Option = {value: string; label: string};
export const platformMarketingService = {
  async options() { return (await platformApi.get<{roles: Option[]; statuses: Option[]; plans: {code: string; name: string}[]}>('platform/marketing/options/')).data; },
  async audiences() { return (await platformApi.get<{results: Audience[]}>('platform/marketing/audiences/', {params: {page_size: 100}})).data.results; },
  async saveAudience(data: Pick<Audience, 'name' | 'filters'>, id?: string) { return (id ? await platformApi.patch<Audience>(`platform/marketing/audiences/${id}/`, data) : await platformApi.post<Audience>('platform/marketing/audiences/', data)).data; },
  async audiencePreview(id: string) { return (await platformApi.get<{count: number; results: {id: string; name: string}[]}>(`platform/marketing/audiences/${id}/preview/`)).data; },
  async queryOrganizations(filters: AudienceFilters) { return (await platformApi.post<{count: number; results: {id: string; name: string}[]}>('platform/marketing/audiences/query/', {...filters, roles: undefined})).data; },
  async campaigns(page = 1) { return (await platformApi.get<{results: Campaign[]; next: string | null; previous: string | null}>('platform/marketing/campaigns/', {params: {page}})).data; },
  async saveCampaign(data: CampaignInput, id?: string) { return (id ? await platformApi.patch<Campaign>(`platform/marketing/campaigns/${id}/`, data) : await platformApi.post<Campaign>('platform/marketing/campaigns/', data)).data; },
  async upload(image: File) { const form = new FormData(); form.append('image', image); return (await platformApi.post<MarketingImage>('platform/marketing/images/', form, {headers: {'Content-Type': 'multipart/form-data'}})).data; },
  async preview(id: string) { return (await platformApi.get<AudiencePreview>(`platform/marketing/campaigns/${id}/preview/`)).data; },
  async publish(id: string, token: string) { return (await platformApi.post<Campaign>(`platform/marketing/campaigns/${id}/publish/`, {confirm: true, token})).data; },
  async cancel(id: string) { return (await platformApi.post<Campaign>(`platform/marketing/campaigns/${id}/cancel/`)).data; },
};
