"use client";

import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="auth-container">
      <div className="auth-card" style={{ maxWidth: "600px" }}>
        <div className="auth-logo">
          <h1>Termos de Uso</h1>
        </div>

        <div className="legal-content" style={{ maxHeight: "400px", overflowY: "auto", padding: "1rem 0" }}>
          <h2>1. Aceitação dos Termos</h2>
          <p>
            Ao acessar e usar o AgroManage, você concorda em cumprir estes Termos de Uso. 
            Se você não concorda com qualquer parte destes termos, não use nossa aplicação.
          </p>

          <h2>2. Uso da Aplicação</h2>
          <p>
            O AgroManage é uma plataforma de gestão agropecuária destinada a produtores 
            rurais e profissionais do setor agronegócios. Você concorda em usar a aplicação 
            apenas para fins legítimos.
          </p>

          <h2>3. Conta de Usuário</h2>
          <p>
            Você é responsável por manter a confidencialidade da sua conta e senha. 
            Você concorda em aceitar responsabilidade por todas as atividades que ocorrem 
            sob sua conta.
          </p>

          <h2>4. Privacidade</h2>
          <p>
            Sua privacidade é importante para nós. Nossa Política de Privacidade descreve 
            como coletamos, usamos e protegemos suas informações pessoais.
          </p>

          <h2>5. Limitação de Responsabilidade</h2>
          <p>
            O AgroManage não será responsável por quaisquer danos diretos, indiretos, 
            incidentais ou conseqenciais decorrentes do uso ou incapacidade de usar 
            a aplicação.
          </p>

          <h2>6. Modificações</h2>
          <p>
            Reservamos o direito de modificar estes termos a qualquer momento. 
            O uso contínuo da aplicação após alterações constitui aceitação dos novos termos.
          </p>

          <h2>7. Contato</h2>
          <p>
            Se você tiver dúvidas sobre estes Termos de Uso, entre em contato conosco através 
            do email: suporte@agromanage.com.br
          </p>
        </div>

        <div className="text-center mt-3">
          <Link href="/login" className="btn btn-agro">
            Voltar para Login
          </Link>
        </div>
      </div>
    </div>
  );
}