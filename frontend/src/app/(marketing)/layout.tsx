import "./marketing.css";
import { getPublicTranslator } from "@/lib/publicLocaleServer";
import { MarketingMotion } from "@/components/marketing/MarketingMotion";
import { MarketingAnalytics } from "@/components/marketing/MarketingAnalytics";
import { PublicLocaleProvider } from "@/lib/publicLocale";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const { language, t } = await getPublicTranslator();
  const siteUrl=process.env.NEXT_PUBLIC_SITE_URL||"https://fazendamais.com";
  const organization={"@context":"https://schema.org","@type":"Organization",name:"Fazenda Mais",url:siteUrl,logo:`${siteUrl}/logo_agro_leaf.png`,email:"contato@agromanage.com",contactPoint:{"@type":"ContactPoint",contactType:"sales",email:"contato@agromanage.com",availableLanguage:["Portuguese (Brazil)","English","Spanish","Portuguese (Portugal)"]}};
  return <PublicLocaleProvider initialLanguage={language}><div className="marketing-root" data-bs-theme="light"><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(organization)}}/><a className="skip-link" href="#marketing-main">{t("skip")}</a><MarketingAnalytics/><MarketingMotion />{children}</div></PublicLocaleProvider>;
}
