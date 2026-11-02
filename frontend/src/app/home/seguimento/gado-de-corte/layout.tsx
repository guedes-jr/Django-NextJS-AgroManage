import type { ReactNode } from "react";
import { CattleSegmentProvider } from "@/components/cattle/CattleSegmentContext";
export default function Layout({ children }: { children: ReactNode }) {
  return <CattleSegmentProvider>{children}</CattleSegmentProvider>;
}
