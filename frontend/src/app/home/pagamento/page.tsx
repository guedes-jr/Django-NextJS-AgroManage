import { SuspendedPayment } from "@/components/billing/SuspendedPayment";

/** Payment page for a subscription suspended for non-payment (the layout sends every route here). */
export default function PaymentPage() {
  return <SuspendedPayment/>;
}
