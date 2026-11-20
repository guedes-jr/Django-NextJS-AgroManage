# AgroManage / Fazenda+ — Claude

Ponto de entrada do Claude neste repositório. As regras operacionais ficam em [AGENTS.md](AGENTS.md) (contexto mínimo, guardrails, roteamento de documentação, validação); leia-o antes de editar. Este arquivo só acrescenta o **padrão de estilos**. Para trabalho em `mobile/`, siga também [mobile/CLAUDE.md](mobile/CLAUDE.md).

Stack: Django 5 + DRF (`backend/`), Next.js 14 App Router + TypeScript (`frontend/`), React Native + Expo + TypeScript (`mobile/`), PostgreSQL, Celery + Redis, Nginx (`infra/`).

## Fontes de verdade de estilo

| Plataforma | Guia | Implementação |
|---|---|---|
| Web | [DESIGN.md](DESIGN.md) e a seção de dimensões de [docs/ai/frontend.md](docs/ai/frontend.md) | `frontend/src/app/workspace.css`, `globals.css`, shell `app-workspace` |
| Mobile | [mobile/DESIGN.md](mobile/DESIGN.md) | `mobile/src/theme/tokens.ts`, `mobile/src/features/agenda/ui.tsx`, `mobile/src/features/home/styles.ts`, `WorkspaceShell` |

O código vence a documentação. Se divergirem, siga o código e aponte o documento para correção. Web e mobile compartilham identidade e princípios, não implementação: não importe CSS, DOM ou Bootstrap no app nativo.

## Princípios comuns

- **Agenda como referência.** Toda tela operacional responde, nesta ordem: onde estou (contexto), o que está acontecendo (dados e situação) e o que posso fazer (ação principal permitida). Composição: contexto → navegação local/período → filtros em chips → resumo → lista → ação.
- **Densidade "75%"** por layout, espaçamento e agrupamento. Nunca use `zoom`, `transform: scale`, outra fonte-raiz ou escala global para simular compactação.
- **Cartão escaneável em 3 níveis:** metadado discreto (12–13), identificador principal (15–17, negrito), situação em texto (pílula opcional). Cor sempre acompanhada de texto.
- **Estados obrigatórios:** carregando, vazio, erro com recuperação, sem acesso, somente leitura e responsivo; no mobile, também sem rede, dados antigos e rascunho local versus confirmado.
- **Retorno com estado** (filtros, data, página e fazenda preservados) e **ações pré-contextualizadas** (o "+ Novo" herda o contexto em foco).
- **Identidade de marca** (verde profundo, lima, dourado, paisagens e ondas) fica no shell e na autenticação, não no conteúdo operacional.

## Cor e tipografia

- **Um acento.** Verde `primary` para ação, seleção e foco; verde-floresta para títulos. Não crie novos verdes, fundos quase iguais ou um tema paralelo por módulo.
- Texto secundário em verde acinzentado (`muted` / `--muted-foreground`), nunca cinza neutro.
- **Contraste medido:** texto ≥ 4,5:1, texto grande ≥ 3:1, contorno de controles e foco ≥ 3:1. Bordas decorativas de cards podem ser mais suaves; bordas de inputs não.
- Tons semânticos: sucesso, aviso, erro e informação, cada um com texto e superfície próprios. Cores categóricas de ícones (fase, domínio) são permitidas em tiles suaves.
- Títulos com tracking levemente negativo. Valores, quantidades e datas numéricas usam dígitos tabulares (`tabular-nums` / `fontVariant: ['tabular-nums']`).
- Ritmo: mais espaço acima de um título de seção do que abaixo dele. Agrupe por proximidade antes de adicionar bordas.

## Web (resumo; detalhes em DESIGN.md)

- Envolver páginas autenticadas em `app-workspace`. Desktop ≥ 992px: fonte-raiz 87,5% via `workspace.css`, controles com 36px, botões com 32–36px, tabelas compactas.
- Abaixo de 992px: controles com `min-height: 44px` e inputs com `font-size: 16px` (evita o zoom do iOS); safe areas com `env()`, `100dvh`, hover só em `@media (hover: hover)`.
- Use tokens CSS (`--primary`, `--muted-foreground`, `--border`…) e classes existentes. Não use tamanhos inline arbitrários.
- Strings visíveis via `useOrganizationLocale()` + `t("chave")`.

## Mobile (resumo; detalhes em mobile/DESIGN.md)

- Use `colors`, `space`, `radius`, `type` e `touchTarget` de `src/theme/tokens.ts`. Não reintroduza hex locais para papéis que já têm token. `brand` é exclusivo do shell. `authSizing` é exclusivo da autenticação.
- Reutilize `styles`, `AgendaButton`, `AgendaShell`, `Busy`, `FormField`, `StatusPill` e `ActionTile` de `features/agenda/ui.tsx` antes de criar estilos próprios. Cada etapa de formulário tem uma única ação `variant="primary"`.
- Rotinas de registro entram no catálogo único `features/workspace/quickActions.ts` (Home e botão "+"), com rótulo de verbo nos quatro idiomas e a mesma permissão da tela de destino.
- Unidades lógicas do RN: conteúdo com padding 16 e `maxWidth` 720; título de tela 22; seção 18–19; corpo 14–16; metadado 12–13 (nunca abaixo de 11, nem na navegação); campos editáveis com fonte 16.
- Todo pressionável tem pelo menos 44 × 44. Ícone ou círculo menor ganha `hitSlop` ou área externa.
- Permita quebra de linha para nomes e estados; trunque apenas informação secundária disponível no detalhe. Teste fonte ampliada, safe areas, teclado, largura pequena e larga, Android e iOS. Prévia web não comprova o comportamento nativo.

## Checklist antes de concluir mudança visual

1. Contexto, dados e próxima ação ficam claros na primeira dobra (cabeçalho, filtros e toolbar com no máximo 25–30% da altura).
2. Só tokens e componentes existentes; nenhum valor de cor novo sem papel definido.
3. Contrastes e alvos de toque dentro dos mínimos acima.
4. Estados aplicáveis implementados; textos em pt-BR, en, es e pt-PT cabem sem corte.
5. Validação mais estreita executada (web: ESLint/tsc do frontend; mobile: `npm run typecheck`, `npm run lint` e testes relevantes em `mobile/`). Informe o que não foi verificado visualmente ou em aparelho.
