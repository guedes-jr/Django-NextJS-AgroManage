import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, Beef, Boxes, CheckCircle2, ClipboardCheck, HeartPulse, Layers3, MapPinned, Quote, ShieldCheck, Sprout, Star, Tractor, UsersRound, WalletCards, Wheat } from "lucide-react";

import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { PublicPlans } from "@/components/marketing/PublicPlans";

export const metadata: Metadata = {
  title: "AgroManage | Gestão rural em um só lugar",
  description: "Controle fazendas, plantações, rebanhos, estoque e finanças com uma plataforma feita para o produtor brasileiro.",
};

const features = [
  { icon: Wheat, title: "Produção agrícola", text: "Planeje plantios, insumos, operações e colheitas com histórico completo." },
  { icon: Beef, title: "Gestão de rebanhos", text: "Acompanhe lotes, reprodução, alimentação, saúde e desempenho animal." },
  { icon: Boxes, title: "Estoque inteligente", text: "Movimentações, alertas, fornecedores e custos sempre atualizados." },
  { icon: WalletCards, title: "Financeiro rural", text: "Centralize receitas, despesas e indicadores da sua operação." },
  { icon: HeartPulse, title: "Clínica veterinária", text: "Consultas, vacinas, medicamentos e exames integrados ao rebanho." },
  { icon: BarChart3, title: "Relatórios claros", text: "Transforme dados do dia a dia em decisões rápidas e confiáveis." },
];

const audiences = [
  { icon: Tractor, title: "Produtores e propriedades", text: "Organize a rotina da propriedade e acompanhe custos, estoque e produção sem depender de várias planilhas." },
  { icon: UsersRound, title: "Equipes de campo", text: "Distribua responsabilidades e mantenha informações acessíveis para quem executa e para quem supervisiona." },
  { icon: MapPinned, title: "Operações com várias fazendas", text: "Tenha uma visão consolidada sem perder o acompanhamento individual de cada unidade produtiva." },
];

const testimonials = [
  { quote: "Hoje consigo acompanhar estoque, custos e atividades da fazenda sem procurar informação em várias planilhas.", name: "Carlos Menezes", role: "Produtor rural", initials: "CM" },
  { quote: "A equipe passou a registrar a rotina no mesmo lugar. Isso trouxe mais agilidade para identificar pendências e tomar decisões.", name: "Mariana Lopes", role: "Gestora de operações", initials: "ML" },
  { quote: "Ter a visão financeira conectada à produção deixou o planejamento muito mais claro para toda a propriedade.", name: "Rafael Andrade", role: "Administrador rural", initials: "RA" },
];

const faqs = [
  ["Preciso instalar algum programa?", "Não. O AgroManage é acessado pelo navegador e funciona em computadores, tablets e celulares conectados à internet."],
  ["Consigo cadastrar mais de uma fazenda?", "Sim. A quantidade disponível depende do plano contratado e pode acompanhar o crescimento da operação."],
  ["Minha equipe pode ter acessos diferentes?", "Sim. Cada usuário recebe um papel com permissões adequadas às suas responsabilidades."],
  ["É possível testar antes de contratar?", "Planos com período de teste exibem essa informação na seção de preços. A equipe comercial também pode apresentar uma demonstração orientada."],
  ["Os módulos funcionam de forma integrada?", "Sim. Estoque, produção, rebanhos, financeiro e relatórios compartilham o contexto da mesma organização."],
];

export default function MarketingHomePage() {
  return <>
    <MarketingHeader />
    <main>
      <section className="marketing-hero">
        <div className="marketing-container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><Sprout size={16} /> Gestão rural simples e integrada</div>
            <h1>Mais controle no campo. <span>Mais resultado</span> na sua operação.</h1>
            <p>Fazendas, produção, rebanhos, estoque e finanças conectados em uma única plataforma — do planejamento à decisão.</p>
            <div className="hero-actions"><Link href="/contato" className="marketing-button primary">Solicitar demonstração <ArrowRight size={18} /></Link><Link href="/recursos" className="marketing-button secondary">Conhecer recursos</Link></div>
            <div className="hero-proof"><span><CheckCircle2 size={17} /> Implantação assistida</span><span><CheckCircle2 size={17} /> Suporte especializado</span><span><CheckCircle2 size={17} /> Dados protegidos</span></div>
          </div>
          <div className="hero-visual">
            <Image src="/farm-hero.jpg" alt="Produção agrícola acompanhada pelo AgroManage" fill priority sizes="(max-width: 900px) 100vw, 46vw" />
            <div className="hero-overlay" />
            <div className="hero-floating-card top"><span>Visão da operação</span><strong>Indicadores em tempo real</strong></div>
            <div className="hero-floating-card bottom"><BarChart3 size={22} /><div><span>Decisões orientadas por dados</span><strong>Do campo ao financeiro</strong></div></div>
          </div>
        </div>
      </section>

      <section className="marketing-section" id="recursos"><div className="marketing-container"><div className="section-heading"><div className="eyebrow">Uma plataforma, toda a operação</div><h2>Gestão completa sem perder a simplicidade</h2><p>Informação organizada para sua equipe trabalhar melhor e você decidir com segurança.</p></div><div className="feature-grid">{features.map(({icon:Icon,title,text})=><article className="feature-card" key={title}><div className="feature-icon"><Icon size={22}/></div><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>

      <section className="workflow-section"><div className="marketing-container"><div className="section-heading left"><div className="eyebrow">Do cadastro à decisão</div><h2>Uma rotina simples para manter a gestão em dia</h2><p>O AgroManage acompanha o fluxo real da operação, transformando registros cotidianos em visão gerencial.</p></div><div className="workflow-grid"><article><span>01</span><div className="workflow-icon"><Layers3 size={23}/></div><h3>Configure sua operação</h3><p>Cadastre organização, fazendas, equipe, estruturas, rebanhos e áreas produtivas.</p></article><article><span>02</span><div className="workflow-icon"><ClipboardCheck size={23}/></div><h3>Registre o que acontece</h3><p>Centralize movimentações, manejos, custos, tarefas, compras e atividades de campo.</p></article><article><span>03</span><div className="workflow-icon"><BarChart3 size={23}/></div><h3>Acompanhe e decida</h3><p>Use indicadores e relatórios para identificar desvios, oportunidades e prioridades.</p></article></div></div></section>

      <section className="results-section"><div className="marketing-container results-grid"><div><div className="eyebrow light">Operação conectada</div><h2>Menos planilhas. Mais rastreabilidade.</h2><p>O AgroManage reúne o histórico operacional e financeiro da propriedade para reduzir retrabalho, antecipar riscos e melhorar margens.</p><Link href="/recursos" className="text-link">Veja tudo que você pode gerenciar <ArrowRight size={17}/></Link></div><div className="results-list"><div><strong>01</strong><span><b>Centralize</b> dados de toda a fazenda</span></div><div><strong>02</strong><span><b>Acompanhe</b> custos e produtividade</span></div><div><strong>03</strong><span><b>Decida</b> com indicadores confiáveis</span></div></div></div></section>

      <section className="marketing-section audience-section"><div className="marketing-container"><div className="section-heading"><div className="eyebrow">Feito para quem vive a operação</div><h2>Do campo à gestão estratégica</h2><p>Uma experiência que atende diferentes níveis de responsabilidade sem complicar o trabalho.</p></div><div className="audience-grid">{audiences.map(({icon:Icon,title,text})=><article key={title}><Icon size={28}/><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>

      <section className="marketing-section pricing-section" id="planos"><div className="marketing-container"><div className="section-heading"><div className="eyebrow">Planos que acompanham seu crescimento</div><h2>Comece com o que sua operação precisa</h2><p>Preços e limites sempre sincronizados com a oferta comercial do AgroManage.</p></div><PublicPlans compact /><div className="section-action"><Link href="/planos" className="text-link">Comparar todos os planos <ArrowRight size={17}/></Link></div></div></section>

      <section className="marketing-section testimonials-section"><div className="marketing-container"><div className="section-heading"><div className="eyebrow">Experiência de quem está no campo</div><h2>Mais clareza para cuidar da operação</h2><p>Veja como uma gestão conectada transforma a rotina de produtores e equipes rurais.</p></div><div className="testimonials-grid">{testimonials.map((testimonial)=><article className="testimonial-card" key={testimonial.name}><div className="testimonial-top"><div className="testimonial-stars" aria-label="5 de 5 estrelas">{Array.from({length:5}).map((_,index)=><Star key={index} size={15} fill="currentColor" />)}</div><Quote size={28}/></div><blockquote>“{testimonial.quote}”</blockquote><div className="testimonial-author"><span>{testimonial.initials}</span><div><strong>{testimonial.name}</strong><small>{testimonial.role}</small></div></div></article>)}</div></div></section>

      <section className="security-section"><div className="marketing-container security-card"><div className="security-icon"><ShieldCheck size={30}/></div><div><h2>Seus dados protegidos, sua equipe no controle</h2><p>Ambientes separados por organização, permissões por função, auditoria e acesso administrativo controlado.</p></div><Link href="/contato" className="marketing-button light">Falar com um especialista</Link></div></section>

      <section className="marketing-section faq-section"><div className="marketing-container faq-grid"><div><div className="eyebrow">Perguntas frequentes</div><h2>Antes de começar</h2><p>Respostas rápidas sobre acesso, implantação e uso da plataforma.</p><Link href="/contato" className="text-link">Ainda tem dúvidas? Fale conosco <ArrowRight size={17}/></Link></div><div className="faq-list">{faqs.map(([question,answer])=><details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div></div></section>

      <section className="final-cta"><div className="marketing-container final-cta-card"><div><div className="eyebrow light">Pronto para organizar sua operação?</div><h2>Leve mais clareza para cada decisão no campo.</h2><p>Conheça o AgroManage em uma demonstração orientada à realidade da sua propriedade.</p></div><div className="final-cta-actions"><Link href="/contato" className="marketing-button light">Solicitar demonstração <ArrowRight size={18}/></Link><Link href="/planos" className="marketing-button outline-light">Ver planos</Link></div></div></section>
    </main>
    <MarketingFooter />
  </>;
}
