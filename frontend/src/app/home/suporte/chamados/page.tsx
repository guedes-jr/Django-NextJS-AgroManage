"use client";
import { useOrganizationLocale } from "@/lib/locale";
import Link from "next/link";
import { SupportTicketList } from "@/components/support/SupportTicketList";
export default function CustomerTicketsPage() {
  const { t } = useOrganizationLocale();
  return <main className="container-fluid py-3"><Link className="btn btn-outline-secondary mb-3" href="/home/suporte">{t("workspace.backToSupportCenter")}</Link><SupportTicketList/></main>;
}
