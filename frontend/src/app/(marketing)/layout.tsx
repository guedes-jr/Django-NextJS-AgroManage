import "./marketing.css";
import { MarketingMotion } from "@/components/marketing/MarketingMotion";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className="marketing-root" data-bs-theme="light"><MarketingMotion />{children}</div>;
}
