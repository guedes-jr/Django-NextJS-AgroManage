import "./marketing.css";
import { MarketingMotion } from "@/components/marketing/MarketingMotion";
import { MarketingAnalytics } from "@/components/marketing/MarketingAnalytics";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const siteUrl=process.env.NEXT_PUBLIC_SITE_URL||"https://agromanage.com";
  const organization={"@context":"https://schema.org","@type":"Organization",name:"AgroManage",url:siteUrl,logo:`${siteUrl}/logo_primary.png`,email:"contato@agromanage.com",contactPoint:{"@type":"ContactPoint",contactType:"sales",email:"contato@agromanage.com",availableLanguage:"Portuguese"}};
  return <div className="marketing-root" data-bs-theme="light"><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(organization)}}/><a className="skip-link" href="#marketing-main">Pular para o conteúdo</a><MarketingAnalytics/><MarketingMotion />{children}</div>;
}
