# Referências para mockups mobile

## Orientação atual — Agenda como base conceitual

A Agenda atualizada do app orienta as próximas peças de design. Consultar o [guia de design](../../DESIGN.md), o [guia de experiência](../EXPERIENCIA.md) e a composição atual de [AgendaScreen](../../src/features/agenda/AgendaScreen.tsx) com seus [estilos](../../src/features/agenda/ui.tsx). Uma imagem nova precisa comunicar contexto, dados e caminho para realizar a operação, com uma experiência simples, intuitiva e funcional.

Antes de gerar outra peça, usar capturas atuais da Agenda e do shell como referência visual, com dados fictícios. Não deduzir detalhes de implementação a partir do prompt histórico abaixo.

### Brief para a próxima prévia

- Mostrar um conjunto pequeno de telas que conte um percurso: lista/contexto → detalhe → operação/revisão → resultado. Usar apenas ações e estados suportados pelo recorte representado.
- Preservar a identidade do `WorkspaceShell`: cabeçalho e navegação conforme o perfil ilustrado, sem inventar posições fixas ou ampliar permissões.
- Aplicar a hierarquia da Agenda: contexto visível, controles agrupados, filtros curtos, resumo e registros legíveis. A Agenda pode mostrar Mês/Semana/Lista; calendários não são obrigatórios nas outras telas.
- Usar fundos claros, superfícies brancas, bordas discretas, verde para seleção/ação e tipografia legível. Deixar claro o estado do registro e o destino da ação principal.
- Priorizar dados e operações. Usar ícones, badges e métricas quando contribuírem para reconhecer uma tarefa, sem acrescentar decoração ou indicadores sem propósito.
- Mostrar nomes de ações específicos, como “Ver atividade”, “Registrar pesagem” ou “Confirmar fornecimento”, conforme o fluxo escolhido. Retorno e cancelamento preservam o contexto.
- Respeitar áreas seguras, fonte ampliada, área de toque de pelo menos 44 unidades lógicas e campos com fonte de 16. Permitir rolagem; não comprimir o conteúdo para forçar todas as informações na primeira dobra.
- Identificar abertura no web, resultado estimado, estado local ou resposta incerta quando esses casos fizerem parte do recorte. Não anunciar recursos offline, scanner ou envio confirmado apenas por aparecerem no desenho.
- Identificar dados fictícios e finalidade conceitual. Mockup não substitui validação nativa nem define autorização, contrato ou regra de negócio.

Esta revisão atualiza a orientação; não gera uma imagem nova. `proposta-mobile.png` permanece como registro da proposta anterior.

## Prompt histórico — 6 de novembro de 2026

O texto a seguir registra como a imagem anterior foi gerada. Sua navegação e o formulário de rascunho são ilustrativos; não prescrevem a experiência atual.

Gerado pela ferramenta integrada `imagegen`, em 6 de novembro de 2026. Arquivo final: `proposta-mobile.png`. Conceito ilustrativo, não captura de um aplicativo implementado.

High fidelity ui-mockup presentation board for Fazenda Mais agricultural management native mobile app. Landscape board, four full straight-on phone screens, large crisp legible Portuguese text. Elegant compact functional enterprise design, forest green #24663D, warm off-white backgrounds, charcoal text, rounded white cards, fine line icons, accessible spacious touch targets, no decorative photos. Board title 'Fazenda Mais · Proposta mobile', subtitle 'Rotinas de campo, com menos etapas'. Shared top farm context 'Fazenda Boa Vista'. Shared bottom navigation exactly five positions: 'Início', 'Agenda', large central circular green '+' with 'Lançar', 'Operação', 'Mais'. Four phone screens left to right: 1 Início / 'Bom dia, João' / small 'Dados atualizados' / metric 'Leite hoje 420 L' / 'Para fazer hoje' task cards 'Trato do lote 02 · 08:00', 'Vacinação · 14:00' / 'Acesso rápido' with 'Leite', 'Trato', 'Rebanho', 'Estoque'; 2 Agenda / 'Hoje, 6 novembro' / date strip / vertically arranged simple task cards with time and farm context and 'Ver tarefa' action; 3 Operação / 'O que vamos fazer?' / big actionable rows 'Rebanho', 'Pecuária leiteira', 'Tratos', 'Plantações', 'Clínica' / small permission-aware label 'Seus módulos'; 4 'Lançar leite' full screen form / 'Fazenda Boa Vista' / 'Animal 0284' / scan icon next to animal / 'Quantidade' big '18,5 L' / 'Ordenha da manhã' / amber subdued badge 'Rascunho no aparelho' / helper 'Envie quando estiver conectado' / green button 'Salvar rascunho'. For last form omit bottom nav and use back arrow and primary bottom button. All values fictional. Tiny board footer 'Conceito visual • Dados fictícios • Recursos sujeitos à implementação'. Flat clean app UI, polished realistic design, no code no gradients no invented logos no claims that app already exists.
