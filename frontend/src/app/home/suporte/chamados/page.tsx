"use client";
import Link from "next/link";
import { SupportTicketList } from "@/components/support/SupportTicketList";
export default function CustomerTicketsPage() {
  return <main className="container-fluid py-3"><Link className="btn btn-outline-secondary mb-3" href="/home/suporte">Voltar à central de suporte</Link><SupportTicketList/></main>;
}
