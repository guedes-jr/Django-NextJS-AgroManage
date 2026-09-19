# Plano de implementação — planos por segmento e porte

## Objetivo

Permitir que cada cliente monte uma assinatura combinando segmentos (por exemplo, suinocultura e plantações), com preço definido pela faixa de quantidade de cada atividade. A contratação deve exibir seleção, revisão, ciclo mensal/anual e encaminhamento para pagamento ou atendimento comercial.

## Experiência proposta

1. **Seleção:** o cliente ativa um ou mais segmentos e escolhe a faixa de porte de cada um.
2. **Cálculo:** o total mensal é atualizado imediatamente. O ciclo anual aplica 15% de desconto.
3. **Revisão:** os módulos, faixas e valores são apresentados separadamente e somados em um resumo.
4. **Contratação:** combinações com preços definidos seguem para checkout; faixas personalizadas seguem para atendimento comercial.
5. **Gestão:** a equipe comercial administra segmentos, faixas, preços, ordem de exibição e disponibilidade no painel da plataforma.

## Entregue nesta etapa

- Nova interface pública em `/planos`, próxima às referências fornecidas.
- Três segmentos iniciais: Suinocultura — Ciclo completo, Suinocultura — Engorda e Plantações.
- Seleção independente de segmentos e faixas.
- Carrinho com inclusão, remoção e totalização.
- Alternância entre assinatura mensal e anual com desconto de 15%.
- Segunda etapa de revisão do pedido.
- Encaminhamento final para o formulário comercial com a composição do plano na URL.
- Tratamento de faixas com preço sob consulta.
- Layout adaptado para desktop, tablet e celular.
- Estados acessíveis para radio buttons, botões e navegação por teclado.

## Próximas fases

### 1. Catálogo e API — concluído

- Criado `PlanSegment` para nome, código, descrição, imagem, ícone, cor, ordem, desconto anual e status.
- Criado `PlanTier` para unidade, mínimo, máximo, preço mensal e indicação de preço personalizado.
- Endpoint público somente de leitura disponível em `/api/v1/public/plan-segments/`.
- CRUD inicial disponível no Django Admin, com as faixas editáveis dentro de cada segmento.
- O configurador consome a API e mantém um catálogo local como fallback de disponibilidade.

### 2. Orçamento — concluído; checkout — pendente

- Criados `SubscriptionQuote` e `SubscriptionQuoteItem` com composição, snapshots, ciclo, subtotal, descontos, total e validade de sete dias.
- Todos os valores são recalculados no servidor; o navegador envia somente as faixas e o ciclo.
- A API rejeita faixas indisponíveis e mais de uma faixa do mesmo segmento.
- A criação pública de orçamentos possui limitação por IP configurável por `SUBSCRIPTION_QUOTE_RATE`.
- Integrar o provedor de pagamento e usar idempotência na criação da cobrança.
- Transformar o orçamento aprovado em assinatura e entitlements por segmento.

### 2.1. Arquitetura de gateways — concluída

- Contrato abstrato para criar, consultar, reembolsar e interpretar webhooks de cobranças.
- Registro central de adaptadores, permitindo adicionar provedores sem alterar o domínio de cobrança.
- Gerencianet / Efí registrado como primeiro adaptador para PIX, boleto e cartão.
- Credenciais genéricas criptografadas e nunca retornadas pela API.
- Seleção transacional e auditada do gateway padrão em `/platform/payment-gateways`.
- Ambiente de homologação ou produção configurável no backoffice.
- Pendente: transporte HTTP, certificado efetivo, webhooks e idempotência específicos do Gerencianet.

### 3. Regras do produto

- Definir a métrica oficial de cada segmento (matrizes, animais alojados, hectares ativos etc.).
- Definir regras para mudança de faixa, pró-rata, downgrade e ultrapassagem de limite.
- Validar desconto anual, período mínimo e política de cancelamento com a área comercial.
- Registrar no histórico o preço e a faixa contratados, preservando contratos antigos após reajustes.

### 4. Qualidade e métricas

- Testes unitários do cálculo, desconto e faixas limítrofes.
- Testes de integração do orçamento e checkout.
- Testes E2E do fluxo seleção → revisão → contratação.
- Eventos de analytics para seleção, troca de faixa, abandono e conversão.
- Revisão final com dados reais, textos jurídicos e imagens definitivas dos segmentos.

## Decisões pendentes

- Preços e limites definitivos de cada faixa.
- Se o anual será cobrado à vista ou parcelado, mantendo o equivalente mensal na interface.
- Provedor de pagamento e meios aceitos.
- Destino das faixas sob consulta: CRM, WhatsApp ou formulário comercial.
- Política de combinação e eventuais descontos progressivos por quantidade de segmentos.
