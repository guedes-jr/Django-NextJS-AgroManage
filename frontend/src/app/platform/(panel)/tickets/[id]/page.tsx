"use client";
import { useParams } from "next/navigation";
import { SupportTicketDetail } from "@/components/support/SupportTicketDetail";
export default function TicketPage() {
  const { id } = useParams<{id: string}>();
  return <SupportTicketDetail key={id} id={id} platform/>;
}
