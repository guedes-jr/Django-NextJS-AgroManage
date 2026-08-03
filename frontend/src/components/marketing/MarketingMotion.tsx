"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const revealSelector = [
  ".section-heading",
  ".feature-card",
  ".workflow-grid article",
  ".results-grid > div",
  ".audience-grid article",
  ".pricing-card",
  ".security-card",
  ".faq-grid > div",
  ".final-cta-card",
  ".resource-row",
  ".resource-security-grid > div",
  ".plan-guide > *",
  ".assurance-grid article",
  ".contact-layout > *",
  ".contact-expectations .marketing-container > div",
  ".legal-content > *",
].join(",");

export function MarketingMotion() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".marketing-root");
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const elements = Array.from(root.querySelectorAll<HTMLElement>(revealSelector));
    elements.forEach((element, index) => {
      element.classList.add("marketing-reveal");
      element.style.setProperty("--reveal-delay", `${Math.min(index % 4, 3) * 70}ms`);
    });
    root.classList.add("motion-enabled");

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        (entry.target as HTMLElement).classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.08 });

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
