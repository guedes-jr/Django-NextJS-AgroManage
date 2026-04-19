"use client";

import Link from "next/link";

export default function LicensePage() {
  return (
    <div className="auth-container">
      <div className="auth-card" style={{ maxWidth: "600px" }}>
        <div className="auth-logo">
          <h1>Licença de Uso</h1>
        </div>

        <div className="legal-content" style={{ maxHeight: "400px", overflowY: "auto", padding: "1rem 0" }}>
          <h2>Licença MIT</h2>
          <p>
            Copyright (c) 2024 AgroManage
          </p>
          <p>
            Permission is hereby granted, free of charge, to any person obtaining a copy 
            of this software and associated documentation files (the &ldquo;Software&rdquo;), to deal 
            in the Software without restriction, including without limitation the rights 
            to use, copy, modify, merge, publish, distribute, sublicense, and/or sell 
            copies of the Software, and to permit persons to whom the Software is 
            furnished to do so, subject to the following conditions:
          </p>
          <p>
            The above copyright notice and this permission notice shall be included in all 
            copies or substantial portions of the Software.
          </p>
          <p>
            THE SOFTWARE IS PROVIDED &ldquo;AS IS&rdquo;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, 
            INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A 
            PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR 
            COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER 
            IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN 
            CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
          </p>

          <h2>Tecnologias Utilizadas</h2>
          <ul>
            <li>Next.js - Framework React</li>
            <li>Django - Backend Python</li>
            <li>PostgreSQL - Banco de Dados</li>
            <li>Tailwind CSS - Estilização</li>
          </ul>

          <h2>Direitos de Propriedade Intelectual</h2>
          <p>
            O AgroManage e todos os seus componentes são propriedade de seus criadores. 
            Todos os direitos não expressamente concedidos nesta licença são reservados.
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