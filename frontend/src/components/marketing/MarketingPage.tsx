import type { ReactNode } from "react";
import { MarketingFooter } from "./MarketingFooter";
import { MarketingHeader } from "./MarketingHeader";

export function MarketingPage({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <><MarketingHeader/><main><section className="public-page-hero"><div className="marketing-container"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div></section>{children}</main><MarketingFooter/></>;
}
