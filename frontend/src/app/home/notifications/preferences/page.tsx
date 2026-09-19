"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NotificationPreferences } from "@/components/notifications";

export default function NotificationPreferencesPage() {
  return <div style={{maxWidth:760,margin:"0 auto"}}>
    <Link href="/home/notifications" className="d-inline-flex align-items-center gap-2 text-decoration-none small mb-4"><ArrowLeft size={16}/> Voltar às notificações</Link>
    <div className="mb-4"><div className="text-primary text-uppercase fw-bold" style={{fontSize:".68rem",letterSpacing:".1em"}}>Canais e categorias</div><h1 className="h2 fw-black mt-1 mb-2">Preferências de notificações</h1><p className="text-muted small">Escolha quais assuntos deseja receber e com que frequência os e-mails devem ser enviados.</p></div>
    <NotificationPreferences />
  </div>;
}
