"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function RouteScrollManager() {
  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.querySelectorAll<HTMLElement>("main, [data-route-scroll-container]").forEach((element) => {
      element.scrollTo({ top: 0, left: 0, behavior: "instant" });
    });
  }, [pathname]);

  return null;
}
