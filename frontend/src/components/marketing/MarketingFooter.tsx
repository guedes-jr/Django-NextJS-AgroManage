import Link from "next/link";
import { Sprout } from "lucide-react";

export function MarketingFooter() {
  return <footer className="marketing-footer">
    <div className="marketing-container footer-grid">
      <div><div className="footer-brand"><Sprout size={22} /> AgroManage</div><p>Tecnologia para decisões melhores no campo.</p></div>
      <div><strong>Produto</strong><Link href="/recursos">Recursos</Link><Link href="/planos">Planos</Link><Link href="/demo">Demonstração</Link><Link href="/calculadora">Calculadora</Link><Link href="/login">Entrar</Link></div>
      <div><strong>Conteúdo</strong><Link href="/gestao-pecuaria">Pecuária</Link><Link href="/gestao-agricola">Agricultura</Link><Link href="/conteudos">Guias</Link><Link href="/contato">Contato</Link><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos</Link></div>
    </div>
    <div className="marketing-container footer-bottom">© {new Date().getFullYear()} AgroManage. Todos os direitos reservados.</div>
  </footer>;
}
