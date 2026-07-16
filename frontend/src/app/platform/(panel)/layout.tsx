import { PlatformShell } from "@/components/platform/PlatformShell";

export default function PlatformPanelLayout({ children }: { children: React.ReactNode }) {
  return <PlatformShell>{children}</PlatformShell>;
}
