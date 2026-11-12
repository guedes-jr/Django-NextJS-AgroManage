# Sistema de Design & Guia de Estilo Web — Fazenda+ / AgroManage

Este documento estabelece as diretrizes de design, tokens visuais, paleta de cores e padrões de interface para o desenvolvimento da plataforma **Web (Next.js / TypeScript)** do ecossistema Fazenda+ / AgroManage.

---

## 1. Princípios e Filosofia de Design

1. **Agro-fresh & Profissional**: Identidade visual enraizada no agronegócio moderno — tons de verde floresta, sálvia natural e acentos dourados (trigo/milho), combinados com fundos limpos e alto contraste para legibilidade no campo e escritório.
2. **Densidade e Alta Produtividade ("Referência 75%")**: Interfaces ricas em dados, tabelas compactas e uso eficiente do espaço de tela, evitando espaçamentos exagerados e rolagem desnecessária. No desktop, o workspace opera com tipografia base de 87.5% e controles otimizados.
3. **Consistência de Estado**: Todas as páginas e formulários devem implementar explicitamente os estados: *Carregando (`loading`)*, *Erro (`error`)*, *Vazio (`empty`)*, *Somente Leitura (`read-only`)* e *Responsivo*.
4. **Sem hacks de zoom**: A compactação é obtida via classes CSS e tokens (`app-workspace`, `workspace.css`), nunca através de `zoom`, transformações de escala ou hacks no elemento `html`.

---

## 2. Paleta de Cores (Design Tokens)

### 2.1 Tema Claro (Padrão do Workspace)

| Token CSS | Valor OKLCH / Hex aproximado | Uso Principal |
|---|---|---|
| `--background` | `oklch(0.99 0.01 110)` / `#F9FAF6` | Fundo geral da página do workspace |
| `--foreground` | `oklch(0.22 0.04 150)` / `#142719` | Texto principal e títulos |
| `--card` | `oklch(1 0 0)` / `#FFFFFF` | Superfície de cartões, tabelas e modais |
| `--card-foreground` | `oklch(0.22 0.04 150)` / `#142719` | Conteúdo dentro de cards |
| `--primary` | `oklch(0.48 0.14 145)` / `#1D752D` | Cor primária, botões de ação principal, destaques |
| `--primary-foreground` | `oklch(0.99 0.01 110)` / `#FFFFFF` | Texto em botões primários |
| `--secondary` | `oklch(0.95 0.03 140)` / `#EAF2E8` | Fundo de botões secundários, badges sutis |
| `--secondary-foreground` | `oklch(0.32 0.08 150)` / `#1B5226` | Texto de botões secundários |
| `--muted` | `oklch(0.96 0.015 130)` / `#EDF2EC` | Fundos desabilitados, bordas de cabeçalho |
| `--muted-foreground` | `oklch(0.5 0.03 150)` / `#536353` | Textos secundários, legendas e rótulos de data |
| `--accent` | `oklch(0.93 0.09 95)` / `#F2E7BA` | Acento quente (trigo/colheita) |
| `--accent-foreground` | `oklch(0.32 0.1 95)` / `#59430A` | Texto sobre acentos |
| `--border` | `oklch(0.9 0.02 140)` / `#DCE5D8` | Bordas de cards, inputs e divisores |
| `--input` | `oklch(0.92 0.02 140)` / `#E2E9DF` | Borda padrão de campos de texto |
| `--ring` | `oklch(0.55 0.14 145)` / `#288E3B` | Anel de foco em acessibilidade |

### 2.2 Estados & Alertas Semânticos

| Estado | Token | Valor aproximado | Uso |
|---|---|---|---|
| **Sucesso** | `--success` | `#228A3C` (`oklch(0.65 0.16 150)`) | Confirmações, fêmeas gestantes/ativas, saldo positivo |
| **Aviso** | `--warning` | `#C68A0E` (`oklch(0.78 0.15 75)`) | Pendências, alertas de estoque, datas de carência |
| **Erro / Crítico** | `--destructive` | `#BD2E2E` (`oklch(0.6 0.22 27)`) | Despesas, descarte de leite, animais mortos, exclusões |
| **Dourado / Finanças** | `--gold` | `#D4A017` (`oklch(0.78 0.15 85)`) | Receitas, indicadores financeiros nobres |

### 2.3 Gradientes & Sombras

```css
--gradient-primary: linear-gradient(135deg, #1E7E34, #155724);
--gradient-gold: linear-gradient(135deg, #E5A919, #B88107);
--gradient-card: linear-gradient(180deg, #FFFFFF, #F8FAF7);
--shadow-soft: 0 4px 16px -4px rgba(22, 63, 44, 0.08);
--shadow-elegant: 0 10px 30px -5px rgba(0, 0, 0, 0.05);
```

---

## 3. Estrutura de Layout e Espaçamento (`app-workspace`)

O shell da aplicação web é estruturado sob a classe raiz `.app-workspace`, que governa as proporções globais:

```
+---------------------------------------------------------------------------------+
| TopBar (H: 60px) | Menu | Back Button | Search | Notifications | User Avatar    |
+-------------------+-------------------------------------------------------------+
| Sidebar (232px)   | Workspace Content (max-width: 1600px; padding: clamp(16, 2vw, 28px))|
|                   |                                                             |
| - Operação        | + Page Header (Title, Subtitle, Actions Toolbar)            |
| - Segmentos       | + KPI Cards Grid (4 colunas / 2 colunas)                   |
| - Gestão          | + Filters Toolbar & Action Chips                            |
| - Inteligência    | + Data Table / Calendar / Cards Grid                        |
+-------------------+-------------------------------------------------------------+
```

### 3.1 Regras de Dimensão do Workspace Desktop (≥ 992px)
- **Root Font-Size**: `font-size: 87.5%` aplicado a `html:has(.app-workspace)` (respeita o zoom natural do navegador).
- **Sidebar**: Largura fixa de `232px`.
- **TopBar**: Altura mínima de `60px` com `padding: 10px 24px`.
- **Controles de Formulário (`.form-control`, `.form-select`)**:
  - Altura mínima: `36px`.
  - Fonte: `14px`.
  - Label: `13px` com `font-weight: 600`.
- **Botões (`.btn`)**: Altura mínima de `32px` para botões compactos e `36px` para botões principais.
- **Tabelas (`.agro-table`)**:
  - Cabeçalho (`th`): `padding-block: 10px; font-size: 12px; font-weight: 700; text-transform: uppercase`.
  - Linhas (`td`): `padding-block: 8px; font-size: 13.5px; vertical-align: middle`.

### 3.2 Regras para Telas Menores (< 992px)
- Controles de formulário voltam para `min-height: 44px` e `font-size: 16px` para evitar zoom automático em navegadores mobile.
- A barra lateral recolhe em um Drawer / Overlay ativado pelo botão hambúrguer.

---

## 4. Tipografia & Hierarquia de Texto

| Nível | Tamanho | Peso | Line-Height | Uso |
|---|---|---|---|---|
| **H1** | `24px` – `28px` | `800` | `1.2` | Título da página ou módulo |
| **H2** | `20px` – `22px` | `700` | `1.3` | Títulos de seções principais |
| **H3** | `16px` – `18px` | `700` | `1.35` | Títulos de cards ou agrupadores |
| **Body (Normal)** | `14px` | `400` / `500` | `1.5` | Textos corridos, dados de tabela |
| **Label / Subtitle**| `13px` | `600` | `1.4` | Rótulos de campos, filtros |
| **Caption / Badge** | `11px` – `12px` | `600` / `700` | `1.3` | Badges, datas, notas e contadores |

---

## 5. Padrões de Componentes Web

### 5.1 Barra de Ferramentas & Filtros (Toolbar Pattern)
Inspirado na página de Agenda e Gestão de Rebanho:
- Navegação de período, seletores de modo e filtros devem residir em uma **única barra compacta e flexível**.
- Não empilhe controles idênticos verticalmente. Utilize grupos horizontais (`d-flex align-items-center gap-2 flex-wrap`).
- Controles de ação primária (ex.: *+ Nova atividade*, *Exportar PDF*) ficam à direita do cabeçalho ou no topo da toolbar.

### 5.2 Cards de Indicadores (KPI Cards)
- Formato compacto: ícone colorido em tom suave (`iconTone`), valor numérico destacado (`20px - 22px`, `font-weight: 800`) e legenda descritiva curta.
- Grade padrão: `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))`.

### 5.3 Tabelas de Dados
- Sempre encapsuladas em contêiner com rolagem horizontal controlada (`.table-responsive`).
- Manter paginação fixa ao final da tabela com contagem clara (*"Página X de Y · Total de Z registros"*).

---

## 6. Diretrizes de Estética Lovable / SaaS Moderno

Para que qualquer nova tela atinja o padrão visual sofisticado e moderno (estilo **Lovable / Linear**), aplique as seguintes regras:

### 6.1 Profundidade, Vidro e Cartões
- **Fundo vs Card**: O fundo do workspace nunca é cinza opaco puro, mas um tom suave bio-neutro (`oklch(0.99 0.01 110)` / `#F9FAF6`). Os cards devem ser branco puro (`#FFFFFF`).
- **Borda de Alta Fidelidade**: Em vez de bordas duras, use bordas com leve transparência:
  ```css
  border: 1px solid rgba(22, 63, 44, 0.08); /* Ou var(--border) */
  border-radius: 14px;
  ```
- **Sombras Multicamadas**:
  ```css
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03), 0 6px 16px -4px rgba(22, 63, 44, 0.05);
  ```
- **Vidro Sutil (Glassmorphism)** em barras flutuantes, filtros fixos ou modais:
  ```css
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(22, 63, 44, 0.07);
  ```

### 6.2 Tipografia Sofisticada
- **Títulos**: Use tracking levemente reduzido para conferir acabamento tipográfico editorial:
  ```css
  letter-spacing: -0.025em;
  font-weight: 700;
  ```
- **Métricas e Valores Numéricos**: Use obrigatoriamente números tabulares para que dígitos não oscilem ou desalinhem:
  ```css
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
  ```

### 6.3 Pílulas de Status com Indicador "Dot"
Substitua badges maciços pesados por pílulas suaves com ponto indicador:
```css
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--status-bg);
  color: var(--status-text);
  border: 1px solid var(--status-border);
}

.status-pill::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentColor;
}
```

### 6.4 Ícones em Contêineres Temáticos (Squircle Icon Tile)
Ícones nunca soltos sem hierarquia; use contêineres arredondados em cores pastéis:
- **Agrícola/Rebanho**: Fundo `#EFF6E6`, ícone verde floresta `#1B5226`.
- **Financeiro**: Fundo `#FEF9E7`, ícone dourado/âmbar `#8F660A`.
- **Agenda/Tarefas**: Fundo `#EBF5FF`, ícone azul ardósia `#1C4F82`.
- **Saúde/Reprodução**: Fundo `#FDF2F4`, ícone vinho/rosé `#8F1D35`.

### 6.5 Microinterações e Feedback
- Hover suave nos cartões e botões:
  ```css
  transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.15s ease, border-color 0.15s ease;
  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 20px -4px rgba(22, 63, 44, 0.09);
  }
  ```

---

## 7. Regras de Ouro para o Desenvolvimento Web

1. **Reutilize `app-workspace`**: Sempre envolva as páginas autenticadas na estrutura padrão.
2. **Sem classes inline arbitrárias para tamanhos**: Utilize os tokens de espaçamento e classes do Bootstrap/CSS Modules já aprovados.
3. **Consistência de Linguagem**: Utilize sempre `useOrganizationLocale()` com `t("chave")` para strings visíveis ao usuário.
4. **Isolamento de Tenant**: Garanta que seletores de fazenda (`FarmContext`) atualizem o estado sem alterar o escopo organizacional seguro.
