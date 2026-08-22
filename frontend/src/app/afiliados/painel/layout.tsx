"use client";

import { Handshake, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AffiliatePortalLayout({children}:{children:React.ReactNode}){
  const router=useRouter();
  const logout=()=>{localStorage.removeItem("access_token");localStorage.removeItem("refresh_token");localStorage.removeItem("affiliate_user");localStorage.removeItem("affiliate_profile");router.replace("/afiliados/login");};
  return <div style={{minHeight:"100vh",background:"var(--background)"}}><header className="bg-white border-bottom sticky-top"><div className="container-fluid px-3 px-lg-5 py-3 d-flex justify-content-between align-items-center"><div className="d-flex align-items-center gap-3"><span className="d-grid place-items-center rounded-3 text-white bg-success" style={{width:42,height:42}}><Handshake size={22}/></span><div><div className="fw-bold">Portal do Afiliado</div><div className="text-muted small">Gestão Agro</div></div></div><button className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-2" onClick={logout}><LogOut size={15}/>Sair</button></div></header><main className="container-fluid p-3 p-lg-5">{children}</main></div>;
}
