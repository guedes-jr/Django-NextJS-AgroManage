# Design mobile — Fazenda Mais

## Referência e intenção

A **Agenda atualizada do app é a base conceitual dos estilos e da experiência operacional**. Cada tela deve ajudar o usuário a entender os dados, identificar o que precisa de atenção e encontrar o caminho para a operação. A experiência deve ser simples, intuitiva e funcional.

Esta orientação substitui as prescrições visuais anteriores à atualização da Agenda. A referência é sua organização e hierarquia: contexto, controles compactos, conteúdo e ação. Aplicar esses princípios aos demais módulos conforme a tarefa, sem exigir calendário, os mesmos filtros ou a mesma composição em todas as telas.

Referências de implementação:

- [AgendaScreen](src/features/agenda/AgendaScreen.tsx): composição da tela, período, modos, filtros, resumo e atividades.
- [Interface da Agenda](src/features/agenda/ui.tsx): superfícies, espaçamentos, tipografia e estados.
- [AgendaDetailScreen](src/features/agenda/AgendaDetailScreen.tsx): detalhe progressivo e acesso à origem da atividade.
- [WorkspaceShell](src/features/workspace/WorkspaceShell.tsx): cabeçalho, navegação e seleção de módulos compartilhados.
- [Tokens](src/theme/tokens.ts): cores compartilhadas e dimensões próprias da autenticação.

Código e contratos definem o que existe e quem pode acessar. Este guia define a direção de design; não comprova que todos os componentes atuais já atendem a ela. Os [mockups antigos](docs/mockups/PROMPT.md) são registros ilustrativos, sem precedência sobre esta orientação. O [guia de experiência](docs/EXPERIENCIA.md) descreve os percursos do usuário.

## 1. Dados e caminhos para agir

Uma tela operacional deve responder, nesta ordem:

1. **Onde estou?** Módulo, fazenda e período, animal, lote ou outro contexto relevante.
2. **O que está acontecendo?** Registros reais, situação, quantidade/unidade e indicação de atenção quando aplicável.
3. **O que posso fazer?** Abrir a ficha, registrar uma operação, acompanhar uma pendência ou consultar o histórico.

Mostrar primeiro as informações necessárias para a decisão. Campos complementares ficam no detalhe; a lista deve permitir reconhecer o registro e sua situação sem abrir cada item. Incluir atalhos que resolvam tarefas reais, com rótulos como “Registrar pesagem” ou “Ver atividade”. Evitar repetir botões genéricos ou apresentar vários caminhos equivalentes para a mesma ação.

Ações de criar já recebem o contexto disponível e autorizado. Ao voltar de um detalhe, preservar seleção, filtros e posição da lista quando possível; criação e edição não devem obrigar o usuário a procurar novamente o mesmo registro. Esse é um requisito da experiência, não uma garantia de todos os fluxos atuais.

Uma atividade prevista, um resultado estimado, um rascunho e uma execução confirmada têm significados distintos. Explicitar essas diferenças e os efeitos de estoque ou financeiro antes da confirmação.

## 2. Composição inspirada na Agenda

A Agenda atual organiza fazenda e criação de atividade, calendário com período e modos **Mês / Semana / Lista**, filtros por domínio, resumo do dia ou período e cartões de atividades. Essa sequência orienta a hierarquia do app.

| Camada | Diretriz | Adaptação por tarefa |
| --- | --- | --- |
| Contexto | Mostrar a seleção que determina os dados e as ações | Fazenda, data, segmento, lote ou animal |
| Navegação local | Agrupar controles relacionados em uma área coesa | Período na Agenda/Leite; situação ou categoria no Rebanho/Estoque |
| Filtros | Usar rótulos curtos, seleção visível e poucos filtros frequentes | Chips para opções curtas; busca/seletor para catálogos extensos |
| Resumo | Explicar o conjunto exibido sem disputar atenção com os registros | Data, quantidade de atividades, saldo com unidade ou pendências |
| Conteúdo | Lista legível com situação e acesso ao detalhe | Atividades, animais, lotes, produtos ou movimentos |
| Operação | Deixar evidente a ação principal permitida no contexto | Nova atividade, lançar leite, registrar trato, conferir ocorrência |

Calendário é um recurso dos fluxos em que a data ajuda a decidir. Em outras telas, usar o seletor adequado ao domínio. Não reproduzir Mês/Semana/Lista em módulos sem essa necessidade.

A primeira área visível deve comunicar contexto e conteúdo útil. Cabeçalhos e filtros não devem empurrar desnecessariamente os dados para baixo. Em telas baixas, com teclado ou fonte ampliada, permitir rolagem e reorganização: a primeira dobra não é uma altura fixa nem motivo para reduzir fontes ou alvos de toque.

## 3. Estilo visual

- Fundo claro e suave, superfícies brancas, bordas discretas e verde para hierarquia, seleção e ação principal.
- Títulos curtos, separação consistente entre seções e poucas informações com grande destaque.
- Cards e linhas com cantos arredondados, sem depender de sombras ou decoração para diferenciar seu conteúdo.
- Ícones ajudam a reconhecer ações; rótulos continuam necessários quando o significado não for evidente.
- Cor sempre acompanhada de texto para situações, alertas e seleções. Pílulas, pontos e caixas de ícones são recursos opcionais, usados quando facilitam a leitura.
- Identidade de marca permanece no shell e na autenticação. Evitar repetir paisagens, ondas ou blocos promocionais no conteúdo operacional.

### Cores e fontes de verdade

Os valores abaixo existem em `src/theme/tokens.ts`. Não criar nomes de tokens que ainda não estejam exportados nem usar variantes locais como novos padrões globais.

| Token | Valor | Papel |
| --- | --- | --- |
| `colors.background` | `#F5F7F2` | Fundo compartilhado |
| `colors.surface` | `#FFFFFF` | Superfícies |
| `colors.forest` | `#163F2C` | Identidade escura |
| `colors.primary` | `#24663D` | Ação e destaque |
| `colors.text` | `#1C3025` | Leitura principal |
| `colors.muted` | `#53645A` | Informação secundária |
| `colors.border` | `#CDD7CD` | Bordas |
| `colors.soft` | `#EAF1E6` | Superfícies suaves |
| `colors.error` / `colors.errorSurface` | `#A62C32` / `#FFF0EF` | Erro |
| `colors.success` | `#1D6338` | Situação positiva |

A Agenda e o shell também têm estilos locais, como fundo `#F6F8F1` e verde `#205D32`. Eles são referências existentes de acabamento, não tokens compartilhados já consolidados. Uma consolidação futura deve atualizar os consumidores de forma consistente, sem criar um tema paralelo por módulo. `authSizing` atende à autenticação; suas dimensões não devem ser impostas às listas operacionais.

### Dimensões e legibilidade

Medidas em **unidades lógicas do React Native**, sem zoom ou escala global. A referência compacta de 75% se traduz em melhor uso de espaço e agrupamento.

| Elemento | Referência de uso |
| --- | --- |
| Conteúdo | Padding em torno de 16, espaçamentos de 8–12 e largura máxima atual de 720 quando adequada |
| Título de tela | Aproximadamente 18–22, sem altura rígida para o texto |
| Título de registro/seção | Aproximadamente 15–17, com hierarquia clara |
| Corpo | Aproximadamente 14–16, preservando leitura e escala do sistema |
| Metadados | Aproximadamente 12–13; apenas informação secundária |
| Campos editáveis | Fonte mínima de 16 |
| Botões, chips e navegação | Área interativa mínima de 44 × 44, incluindo espaço de toque adicional quando necessário |
| Cards | Padding em torno de 12–16, borda discreta e altura conforme o conteúdo |

Ícone ou círculo visual menor pode ficar dentro de uma área de toque maior. Permitir quebra de linha para nomes, estados e ações importantes. Truncar apenas informações secundárias que continuem acessíveis no detalhe. A exigência de 16 para campos atende à legibilidade nativa; não pressupor comportamentos de zoom do navegador no React Native.

## 4. Navegação compartilhada e operações

Reutilizar `WorkspaceShell` nas áreas principais. Sua composição atual contempla **Início, Agenda, ação de criação, Financeiro e Módulos**, conforme acesso e capacidade. O guia não exige cinco posições para todos os perfis. A criação abre opções permitidas; Financeiro só aparece para quem pode consultá-lo. O feeder mantém sua rotina autorizada e não recebe Agenda ou gestão por decisão visual.

O menu de módulos mantém os agrupamentos atuais: Operação, Segmentos, Gestão e Inteligência. Destinos disponíveis no app abrem suas telas; quando o fluxo ainda depende do web, comunicar essa alternativa claramente. Não apresentar uma transição ao navegador como operação nativa concluída.

Fichas e formulários preservam retorno contextual, inclusive pelo sistema Android/iOS. A navegação inferior não deve encobrir campos ou ações com o teclado aberto. Um seletor de fazenda deve acrescentar contexto útil, sem repetir seleções a cada etapa.

| Área | Dados em evidência | Caminho operacional |
| --- | --- | --- |
| Início | Prioridades e poucos resumos úteis ao perfil | Abrir atividade, registro ou lançamento relevante |
| Agenda | Período, atividades, situação e origem | Detalhe → operação vinculada ou alternativa web identificada |
| Rebanho | Identificação, lote e situação | Ficha → manejo ou histórico autorizado |
| Leite | Data, produção, descarte e pendências | Animal/total → formulário → confirmação remota |
| Trato | Lote/animais, produto, quantidade e situação | Revisão → fornecimento autorizado → confirmação |
| Estoque | Produto, saldo/unidade, validade e alertas | Ficha → movimento permitido ou consulta do histórico |
| Clínica | Animal/lote, ocorrência, data e situação | Detalhe → acompanhamento ou procedimento autorizado |

O quadro orienta a apresentação, não declara todos os destinos ou ações implementados. Conferir os contratos de cada recorte antes de incluir um atalho.

## 5. Listas, detalhes e formulários

**Listas:** cartões ou linhas com identidade, contexto e situação. A Agenda oferece a referência de leitura: metadado discreto, título destacado e situação textual. Adaptar a ordem para que a identificação principal do domínio fique evidente. A linha abre o detalhe; ações adicionais aparecem apenas quando necessárias e sem criar toques ambíguos dentro do card.

**Detalhes:** mostrar o registro e sua situação antes de campos complementares. Expor ações relacionadas ao que está sendo consultado, com destino claro e acesso revalidado. Evitar transportar todos os campos da ficha para a listagem.

**Formulários:** rótulos persistentes, unidades próximas dos valores, campos agrupados pela tarefa e erros junto da entrada afetada. Preservar contexto e valores após erro; diferenciar adicionar à revisão, salvar rascunho e confirmar no servidor. Em operações com efeitos, apresentar os dados e o impacto antes de confirmar. Manter a ação principal alcançável com teclado e fonte ampliada.

Usar tela inteira para formulários extensos e folhas/modais para escolhas curtas. Evitar vários modais encadeados para concluir uma rotina simples. Só oferecer rascunho, captura por câmera ou outra função nativa quando o recorte estiver implementado e autorizado.

## 6. Estados, compatibilidade e validação

Cada fluxo contempla os estados aplicáveis: carregando, vazio, erro com recuperação, acesso negado, somente leitura, sessão expirada, sem rede e resultado incerto. Cache antigo e rascunho local precisam de identificação própria. Falha em um indicador secundário não deve bloquear os demais caminhos válidos.

Preservar Android/iOS, safe areas, fontes ampliadas, leitor de tela, contraste, gesto/botão voltar e preferência de movimento reduzido. Feedback de toque pode usar mudança de cor/opacidade; animação não é requisito para reconhecer a interação. Sombras, elevação e parâmetros de listas dependem da necessidade e do suporte real, sem prometer desempenho por configuração fixa.

Antes de concluir uma mudança visual, verificar:

- Contexto, dados principais e próxima ação são compreensíveis sem instrução externa.
- Ações e estados têm rótulos claros e respeitam o perfil, a espécie e a fazenda.
- Filtros e retorno não fazem o usuário repetir trabalho; formulários preservam a entrada após erro.
- Há espaço para nomes longos, idiomas pt-BR/en/es/pt-PT e fonte ampliada.
- Uma largura pequena e outra maior, teclado e orientação suportada não produzem sobreposição ou corte.
- Áreas interativas têm pelo menos 44 × 44; ícones pequenos não reduzem o alvo de toque.
- Validação web é complementar; funcionamento e usabilidade nativos exigem aparelho/build adequado.

### Aplicação da referência atual

A revisão dos documentos não altera telas nem conclui a padronização do app. Alguns controles atuais da Agenda, como `navButton`, `viewTab` e `chip`, ainda precisam de conferência/ajuste de área interativa; seus tamanhos visuais não são autorização para reduzir o mínimo de toque. Retorno com todos os filtros, posição da lista, origem nativa das operações e indicadores completos do calendário devem ser verificados por fluxo, sem presumir que estejam resolvidos pela aparência da Agenda.
