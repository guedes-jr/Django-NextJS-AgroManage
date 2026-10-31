import { Icon, type LucideProps } from "lucide-react";
import { bullHead, cowHead, cowUdderDroplets } from "@lucide/lab";

export function CowIcon(props: LucideProps) {
  return <Icon iconNode={cowHead} strokeWidth={1.8} {...props} />;
}

export function BullIcon(props: LucideProps) {
  return <Icon iconNode={bullHead} strokeWidth={1.8} {...props} />;
}

export function LactationIcon(props: LucideProps) {
  return <Icon iconNode={cowUdderDroplets} strokeWidth={1.8} {...props} />;
}
