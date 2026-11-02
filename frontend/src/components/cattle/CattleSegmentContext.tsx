"use client";

import { createContext, Suspense, useContext, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cattleProduction, type CattleProduction } from "@/services/cattleNavigation";

const CattleSegment = createContext<CattleProduction | null>(null);
function Segment({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  return <CattleSegment.Provider value={cattleProduction(pathname, params)}>{children}</CattleSegment.Provider>;
}
export function CattleSegmentProvider({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p role="status">Carregando segmento...</p>}><Segment>{children}</Segment></Suspense>;
}
export function useCattleSegment() { return useContext(CattleSegment); }
