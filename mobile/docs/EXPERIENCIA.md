# Experiência mobile — dados e operações

A Agenda atualizada do app é a referência conceitual para a experiência das telas operacionais: contexto visível, controles compactos, informações legíveis e caminhos claros para agir. O objetivo é um aplicativo **simples, intuitivo e funcional**.

O [guia de design mobile](../DESIGN.md) é a referência das decisões visuais e de interação. Ele substitui prescrições antigas de layout, navegação e componentes. A composição da [Agenda atual](../src/features/agenda/AgendaScreen.tsx) orienta a hierarquia, sem exigir calendário em todos os módulos nem transformar detalhes ainda incompletos em padrão.

## Percurso principal

**Contexto → dados → detalhe ou ação → revisão → confirmação → retorno ao contexto.**

1. A tela informa módulo, fazenda e a seleção relevante: período, animal, lote ou produto.
2. A lista mostra os dados necessários para reconhecer o registro, sua situação e eventuais pendências.
3. O usuário abre a ficha ou inicia a operação permitida, recebendo o contexto já selecionado.
4. O formulário pede os campos exigidos pelo contrato, mostra erros junto das entradas e oferece revisão quando houver efeitos.
5. A confirmação remota informa o resultado. Erro ou resposta incerta preserva os dados e orienta a conferência.
6. O retorno permite continuar o trabalho sem refazer busca, filtros e seleção, conforme o fluxo suportado.

## Navegação e conteúdo

Reutilizar o `WorkspaceShell` atual: Início, Agenda, criação contextual, Financeiro e Módulos conforme o acesso. A proposta antiga de destinos fixos “Operação” e “Mais” não prescreve a navegação atual. Fichas e formulários mantêm retorno apropriado e espaço para teclado e ações.

| Área | O que deve ficar claro | Próximo passo |
| --- | --- | --- |
| Início | Prioridades e resumos úteis ao perfil | Abrir a atividade ou o lançamento relevante |
| Agenda | Período, atividades, situação e origem | Ver detalhe e seguir para a operação vinculada |
| Rebanho | Identificação, lote, situação e histórico | Abrir ficha e escolher manejo autorizado |
| Leite | Data, produção, descarte e pendências | Lançar/corrigir animal ou total, conforme contrato |
| Trato | Destino, produto, quantidade e fornecimento | Revisar impacto em estoque e confirmar |
| Estoque | Produto, saldo/unidade, validade e alertas | Consultar ficha/histórico ou registrar movimento permitido |
| Clínica | Animal/lote, ocorrência, data e acompanhamento | Consultar detalhe e realizar a ação disponível |

A tabela define a intenção da experiência, não a cobertura funcional de cada módulo. Verificar os destinos implementados antes de criar atalhos. Quando a operação ainda for web, identificar a abertura do navegador. O feeder mantém sua rotina e seus acessos próprios; ocultar um botão não substitui autorização do servidor.

## O que aproveitar da Agenda

- Fazenda e ação principal próximas do contexto de trabalho.
- Período e modos Mês/Semana/Lista agrupados quando a data for relevante; controles próprios do domínio nos demais módulos.
- Filtros frequentes com rótulos curtos e seleção evidente, sem deslocar os dados desnecessariamente.
- Resumo que explica a lista, cartões de leitura rápida e detalhe progressivo.
- Situação textual e destino compreensível para a próxima operação.

A hierarquia deve funcionar em telas pequenas e com fonte ampliada. Permitir rolagem em vez de apertar controles para caber uma quantidade fixa de conteúdo na primeira dobra. Preservar alvos de toque de 44 unidades lógicas, fonte de campo de 16 e áreas seguras. Medidas e acabamento estão no guia de design.

## Entrada da pecuária leiteira

`/cattle/dairy` abre um painel com fazenda compartilhada e três abas:

- **Visão geral:** leite do dia, volume aproveitável/descarte e indicadores do rebanho ativo. As barras comparam os dados efetivos da API; ausência/erro não vira zero nem gráfico ilustrativo.
- **Rebanho:** animais/lotes, cadastro contextual e busca/filtros sob demanda. O próprio cartão abre a ficha, sem um botão repetido em cada registro.
- **Rotinas:** destinos existentes agrupados em produção/armazenamento, rebanho/cuidados e manejos/operações, com descrições curtas e as permissões de cada perfil.

A composição aproveita a hierarquia da Agenda, adaptada ao domínio. Usa os contratos atuais de resumo de leite e visão do rebanho, sem agregar contagens de uma página parcial. A seleção de fazenda compõe as chaves de consulta; erros preservam um caminho de nova consulta e não aparentam histórico vazio. Validação técnica e prévia web em 320/768 px concluídas; homologação nativa Android/iOS permanece pendente.

## Exemplo de rotina de leite

1. Abrir Leite por um destino autorizado e manter a fazenda selecionada.
2. Localizar o animal ou selecionar o lançamento total, conforme as opções realmente disponíveis.
3. Informar data, turno, quantidade, descarte e demais campos exigidos pelo contrato; manter unidades e parsing de decimal nos quatro idiomas.
4. Revisar e enviar online; mostrar confirmação apenas depois da resposta do servidor. Se houver resultado incerto, orientar a conferência sem criar outra intenção de envio.
5. Continuar no mesmo contexto após a confirmação, oferecendo próximo animal apenas quando esse comportamento estiver implementado.

Rascunho offline, scanner, câmera e sincronização exigem implementação e contratos próprios. Um desenho com esses recursos não os torna disponíveis nem comprova segurança de reenvio.

## Referência visual anterior

![Mockup anterior à atualização da Agenda; registro ilustrativo](mockups/proposta-mobile.png)

Essa imagem foi gerada em 6 de novembro de 2026, antes da atualização usada como referência. Contém dados fictícios, outra proposta de navegação e um formulário de rascunho ilustrativo. Não é captura do app atual nem critério de aceite. O [arquivo de prompt](mockups/PROMPT.md) preserva a origem e registra a orientação para próximas peças; a imagem não foi regenerada nesta revisão.

## Validação da experiência

Avaliar no aparelho tarefas reais: consultar uma atividade e encontrar sua operação, localizar um animal e registrar uma rotina autorizada. Observar tempo, toques, erros, recuperação e compreensão dos rótulos. Testar Android/iOS, larguras pequena e maior, rede ruim, teclado aberto e fonte ampliada.

Um fluxo está bem resolvido quando o usuário reconhece os dados, entende sua situação, encontra a ação e sabe se ela foi confirmada. Mockup ou prévia web isolados não comprovam essa experiência nativa.
