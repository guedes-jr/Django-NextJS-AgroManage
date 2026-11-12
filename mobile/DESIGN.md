# Sistema de Design & Guia de Estilo Mobile — Fazenda+ / AgroManage

Este documento é a referência oficial e exclusiva para o design e desenvolvimento da aplicação **Mobile (React Native / Expo / TypeScript)** do Fazenda+ / AgroManage.

---

## 1. Princípios de Design Mobile

1. **Eficiência Operacional no Campo**: Telas limpas, de leitura rápida sob luz solar direta e toques precisos mesmo em movimento ou uso com apenas uma mão.
2. **Aproveitamento Máximo da Tela (Densidade "Referência 75%")**:
   - Eliminar alturas fixas gigantes e elementos puramente decorativos que empurram o conteúdo para fora da primeira dobra da tela.
   - O usuário deve ver imediatamente seus dados principais (cards do dashboard, tarefas do dia, cabeças de gado) sem precisar rolar a tela logo após entrar.
3. **Padrões Nativos & Acessibilidade**:
   - **Piso mínimo de toque**: Alvos de toque (`minHeight` e `minWidth`) de no mínimo **44px** (padrão Apple HIG e Google Material).
   - **Tamanho de fonte para inputs**: Mínimo de **16px** para evitar comportamentos inesperados de zoom automático em dispositivos móveis e garantir leitura clara.
4. **Alinhamento com a Experiência Web**: Navegação previsível, menus categorizados e botão de retorno contextual.

---

## 2. Paleta de Cores Mobile

Definida em `mobile/src/theme/tokens.ts` e refletida nos componentes de interface:

| Nome do Token | Valor Hex | Uso no App |
|---|---|---|
| `colors.forest` | `#163F2C` / `#00451F` | Fundo principal da TopBar, BottomBar ativa e títulos escuros |
| `colors.primary` | `#24663D` / `#1D752D` | Botões primários, destaques positivos e valores em verde |
| `colors.background`| `#F5F7F2` / `#F6F8F1`| Fundo de todas as telas (área de rolagem e área segura) |
| `colors.surface` | `#FFFFFF` | Cartões (Cards), superfícies elevadas e avatares |
| `colors.soft` | `#EAF1E6` / `#EBF0E7` | Fundo de botões secundários, caixas de busca e pílulas |
| `colors.border` | `#CDD7CD` / `#D4DED1` | Linhas divisórias, bordas de cards e de inputs |
| `colors.text` | `#142719` / `#1C3025` | Cor padrão de texto de leitura e cabeçalhos |
| `colors.muted` | `#526456` / `#53645A` | Rótulos secundários, datas, horas e notas |
| `colors.error` | `#9A3028` / `#A62C32` | Mensagens de alerta, despesas, erros e itens críticos |
| `colors.errorSurface`| `#FFF0EF` | Fundo de badges e cards com erro/urgência |
| `colors.success` | `#1D6338` | Badges de sucesso, prenhezes ativas, receitas |
| `brand.lime` | `#D1F900` / `#DFFF48` | Ícone flutuante de criação (+), abas ativas |
| `brand.gold` | `#FFD600` | Destaque do "+" na marca Fazenda+ |

---

## 3. Estrutura Estrutural do Shell Mobile (`WorkspaceShell`)

A casca padrão do aplicativo foi desenhada para maximizar a área de trabalho:

```
+---------------------------------------------------------------+  <- SafeAreaView top
| TopBar Compacta (H: ~54px)                                    |
| [ ‹ Voltar / Fazenda+ ]               [ 🔔 (Badge) ] [ Avatar]|
+~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~+  <- Onda suave (H: 14px)
|                                                               |
| CONTEÚDO DA TELA (Área de Rolagem Útil)                       |
| Max-width: 720px (centralizado em tablets e celulares grandes)|
|                                                               |
| - Home: [Olá, Nome!] -> [Seletor de Período] -> [Cards KPI]   |
| - Agenda: [Toolbar Data] -> [Chips Filtro] -> [Lista Eventos] |
| - Rebanho: [Filtros Segmento] -> [Busca] -> [Fichas Animais]  |
|                                                               |
+---------------------------------------------------------------+
| Bottom Navigation Bar Compacta (H: ~58px)                     |
| [ Início ]  [ Agenda ]   (( + ))   [ Financeiro ] [ Módulos ] |
+---------------------------------------------------------------+  <- SafeAreaView bottom
```

### 3.1 TopBar Compacta
- **Na Home**: Exibe a marca `Fazenda+` de forma elegante (ícone 28x30px), o sino de notificações com contador de não lidos e o avatar com as iniciais do usuário.
- **Nas Subtelas**: Exibe o botão de retorno contextual `‹ [Título da Tela]` à esquerda, permitindo voltar com um toque.
- **Dimensões**: `minHeight: 54px`, `paddingHorizontal: 14px`, `paddingVertical: 6px`.

### 3.2 Bottom Navigation Bar Compacta
- **Dimensões**: `minHeight: 58px`, `paddingTop: 2px`, `paddingBottom: 6px`.
- **Botão Central (+) de Criação**:
  - Diâmetro: `48px` (borda verde escuro `4px`, fundo verde-limão vibrante `#D1F900`).
  - Margem superior negativa: `-15px`.
- **Abas**: `minHeight: 44px`, ícones `22px – 24px`, textos em `10px` (`activeTab` em `#DFFF48`).

### 3.3 Menu Drawer de Módulos (Semelhante ao Web)
Quando o usuário abre o modal de **Módulos**, os itens são agrupados nas quatro seções idênticas ao sistema web:
1. **Operação** (`agenda`, `crops`)
2. **Segmentos** (`beef`, `dairy`, `feeding`, `swine`, `clinic`)
3. **Gestão** (`inventory`, `finance`, `structure`)
4. **Inteligência** (`assistant`)

---

## 4. Tipografia & Escala de Textos Mobile

| Elemento | Tamanho | Peso | Cor | Observação |
|---|---|---|---|---|
| **Saudação / Header de Tela** | `18px` | `700` | `#142719` | Reduzido para evitar quebrar linha e economizar espaço |
| **Título de Seção** | `17px` – `18px` | `700` / `800` | `#162D1D` | Usado em blocos principais (ex: Desempenho, Alertas) |
| **Valores / Métricas (KPI)** | `20px` | `800` | `#122B1A` | Números em destaque (R$, cabeças, litros) |
| **Título de Card** | `15px` – `16px` | `700` | `#142719` | Nome do animal, lote, ou categoria |
| **Corpo (Body)** | `14px` – `15px` | `400` / `500` | `#34563B` | Textos descritivos, informações de linhas |
| **Labels / Campos** | `13px` | `600` | `#48604C` | Rótulos de formulário |
| **Inputs** | `16px` | `500` | `#193C27` | **Piso obrigatório de 16px** |
| **Captions / Datas / Badges**| `11px` – `12px` | `600` / `700` | `#536353` | Metadados, fazenda vinculada, tags |

---

## 5. Padrões de Componentes Mobile

### 5.1 Barra de Ferramentas Compacta (Padrão Agenda / Filtros)
- **Agrupamento horizontal**: Em vez de criar um botão por linha, use flexbox com `flexWrap: 'wrap'` ou rolagem horizontal com espaçamento `gap: 6` a `gap: 8`.
- Exemplo do padrão consolidado:
  - **Linha 1**: Contexto de fazenda + Botão de Ação Primária (*+ Nova Atividade*) + Atualizar.
  - **Linha 2**: Navegação temporal: `‹` Período `›` `Hoje` `[Dia / Semana]`.
  - **Linha 3**: Salto de data + Checkbox de finalizados na mesma linha.
  - **Linha 4**: Chips de filtro de domínio (`Todas`, `Tarefas`, `Rebanho`, etc.).

### 5.2 Padrão Arquitetural de Navegação & Filtros Operacionais (Inspirado na Agenda)
Qualquer nova tela nativa (Rebanho, Leite, Estoque, Clínica, etc.) deve implementar os **6 conceitos canônicos** consolidados na Agenda:

1. **Toolbar Dimensional em Linha Única**:
   - Agrupar navegação de período/fase e modos em uma barra coesa:
     ```tsx
     <View style={s.row}>
       <AgendaButton label="‹" onPress={goPrev} />
       <Text style={s.range}>{currentScopeLabel}</Text>
       <AgendaButton label="›" onPress={goNext} />
       <AgendaButton label={t.today} onPress={goToday} />
       <AgendaButton label={t.modeA} selected={mode === 'A'} onPress={() => setMode('A')} />
       <AgendaButton label={t.modeB} selected={mode === 'B'} onPress={() => setMode('B')} />
     </View>
     ```
   - **Reuso no Rebanho**: `‹` Lote `›` + `[ Ativos | Vendidos | Histórico ]`.
   - **Reuso no Leite**: `‹` Data `›` `Hoje` + `[ Manhã | Tarde | Noite | Total ]`.

2. **Chips de Filtro de Toque Único (*Zero-Click Discovery*)**:
   - Disponibilize filtros em chips horizontais usando `AgendaButton` ou pílulas semânticas, sem abrir dropdowns ou submenus:
     ```tsx
     <View style={s.row}>
       {categories.map(cat => (
         <AgendaButton key={cat} label={t[cat]} selected={selected === cat} onPress={() => setSelected(cat)} />
       ))}
     </View>
     ```
   - **Reuso na Clínica**: `(• Todas) ( Vacinações) ( Medicações) ( Ocorrências)`.
   - **Reuso no Estoque**: `(• Todos) ( Rações) ( Medicamentos) ( Abaixo do Mínimo)`.

3. **Retorno com Preservação de Estado (*Stateful Return*)**:
   - Ao navegar para fichas ou detalhes, inclua parâmetros de estado na rota:
     ```ts
     router.push({
       pathname: '/cattle/[production]/[id]',
       params: { id, production, kind, search, page: String(page), farm: farm?.id }
     });
     ```
   - Ao tocar no botão de voltar, o usuário retorna exatamente para a mesma página e busca sem resetar o scroll ou filtros.

4. **Ações Pré-Contextualizadas (*Context-Aware Actions*)**:
   - O botão de criar registro (ex: *Nova Pesagem*, *Nova Ordenha*, *Nova Tarefa*) já herda a data, o animal ou a fazenda atualmente selecionada, abrindo o formulário já pré-preenchido.

5. **Cartões Escaneáveis em 3 Níveis (*3-Tier Scanable Card*)**:
   - Estrutura obrigatória para qualquer card de listagem mobile:
     ```tsx
     <Pressable style={s.card} onPress={onOpen}>
       {/* Nível 1: Metadado sutil */}
       <Text style={s.muted}>{item.date} · {item.farm_name}</Text>
       {/* Nível 2: Título destacado */}
       <Text style={s.title}>{item.title || item.identifier}</Text>
       {/* Nível 3: Pílula semântica com dot */}
       <View style={s.pillBadge}>
         <View style={[s.dot, { backgroundColor: item.active ? '#247638' : '#C68A0E' }]} />
         <Text style={s.pillText}>{item.statusLabel}</Text>
       </View>
     </Pressable>
     ```

6. **Densidade "Above-the-Fold" (Primeira Dobra Útil)**:
   - Limite os controles de cabeçalho a no máximo 3 ou 4 linhas compactas.
   - Os cards de dados principais devem aparecer diretamente na primeira dobra da tela sem exigir rolagem inicial.

### 5.3 Cards de Métricas & Dashboard
- Grid de 2 colunas: `width: '48%'`, `flexGrow: 1`, `padding: 12px`, `borderRadius: 16px`.
- Ícone em caixa suave: `padding: 7px`, `backgroundColor: '#EFF6E6'`, `borderRadius: 10px`.
- Rótulo superior curto e valor destacado em fonte `20px` bold.

### 5.3 Formulários & Entradas de Dados
- Campos de texto (`TextInput`): `minHeight: 44px`, `borderWidth: 1px`, `borderColor: '#92AF89'`, `borderRadius: 12px`, `paddingHorizontal: 12px`.
- Teclado reativo: telas utilizam `keyboardShouldPersistTaps="handled"` e a barra inferior se oculta automaticamente quando o teclado está aberto (`Keyboard.addListener`).

---

## 6. Diretrizes de Estética Lovable / SaaS Moderno no Mobile

Para dar ao app o acabamento polido, harmonioso e moderno típico do **Lovable**:

### 6.1 Cards com Acabamento Refinado
- **Borda Suave**: Use bordas ultrafinas com leve opacidade em vez de cinzas sólidos pesados:
  ```ts
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8DF',
    padding: 14,
    gap: 8,
    // Sombra sutil multicamada
    boxShadow: '0 2px 8px rgba(22, 63, 44, 0.05)',
  }
  ```

### 6.2 Ícones em Squircles (Tile Colorido)
- Ícones de métricas e ações devem ser aninhados em contêineres circulares ou quadrados arredondados com cores suaves de fundo:
  ```ts
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EFF6E6', // Tom suave pastel
    alignItems: 'center',
    justifyContent: 'center',
  }
  ```

### 6.3 Badges de Status com "Dot" Indicator
- Em vez de rótulos de texto simples ou caixas sólidas que sobrecarregam a visão, utilize pílulas sutis com um pequeno círculo colorido:
  ```tsx
  <View style={s.pillBadge}>
    <View style={[s.dot, { backgroundColor: active ? '#247638' : '#C68A0E' }]} />
    <Text style={s.pillText}>{label}</Text>
  </View>
  ```
  ```ts
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#F0F5E9',
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#235D30',
  }
  ```

### 6.4 Seletor de Abas / Modos Estilo "Pill Slider"
- Para botões de alternância (ex: Dia / Semana / Mês na Agenda ou Ativos / Todos / Baixados no Rebanho), utilize o padrão de cápsula:
  - Fundo do grupo em cinza/sálvia suave (`#E7EFDF`, `borderRadius: 12`, `padding: 3`).
  - Item ativo com fundo branco puro, sombra leve e cantos arredondados (`backgroundColor: '#FFFFFF'`, `boxShadow: '0 1px 4px rgba(0,0,0,0.08)'`).

### 6.5 Feedback Tátil e Microinterações
- Todo elemento tocável (`Pressable`) deve possuir feedback visual instantâneo:
  ```ts
  style={({ pressed }) => [s.button, pressed && { opacity: 0.68, transform: [{ scale: 0.98 }] }]}
  ```

---

## 7. Diretrizes de Compatibilidade Multiplataforma (Android & iOS)

Para que o aplicativo funcione com perfeição, sem quebras visuais ou falhas de usabilidade em qualquer dispositivo Android e iPhone:

### 7.1 Áreas Seguras & Notches (Safe Area Insets)
- **iOS (Dynamic Island & Home Indicator)**:
  - Todo o shell deve ser encapsulado em `<SafeAreaView edges={['top', 'left', 'right', 'bottom']}>` usando `react-native-safe-area-context`.
  - A barra inferior precisa de folga para a barra de gestos (*Home Indicator*) do iPhone sem cortar os ícones de abas.
- **Android (Navegação por 3 Botões & Gestos)**:
  - A barra inferior e botões fixos de rodapé nunca devem sobrepor a barra de navegação do sistema Android.
  - A `StatusBar` deve ser definida explicitamente como `<StatusBar style="light" />` ou `"dark"`.

### 7.2 Gestos e Navegação de Retorno
- **Android (Botão Físico / Gesto de Voltar)**:
  - O app deve responder adequadamente ao gesto nativo de voltar do Android (`BackHandler`). No Expo Router, garanta que `router.canGoBack() ? router.back() : router.navigate('/')` evite que o usuário fique preso em telas com formulários ou modais.
- **iOS (Swipe to Go Back)**:
  - Preserve o gesto nativo de deslizar da borda esquerda para voltar (*interactive pop gesture*). Evite componentes horizontais com drag que comecem na margem zero da tela.
- **Botão Visual Universal**: O botão contextual de voltar na TopBar (`‹ Título`) deve estar sempre visível para garantir acessibilidade universal em ambos os sistemas.

### 7.3 Comportamento do Teclado (Keyboard Handling)
- **Fechamento ao Tocar Fora**: Listas e formulários devem incluir `keyboardShouldPersistTaps="handled"` em `ScrollView` e `FlatList`.
- **Ocultamento de Barras Conflitantes**: A barra de navegação inferior (`home-navigation`) deve se ocultar automaticamente quando o teclado estiver aberto (`Keyboard.addListener('keyboardDidShow')` e `'keyboardDidHide'`) para liberar espaço e não cobrir os inputs.
- **Prevenção de Zoom no iOS**: Campos de texto (`TextInput`) devem ter **tamanho de fonte mínimo de 16px**. Fontes menores disparam o zoom automático e indesejado da tela em dispositivos iOS.

### 7.4 Sombras, Elevações e Densidades de Tela
- **iOS vs Android**:
  - iOS renderiza sombras difusas perfeitamente via `boxShadow` / `shadowColor`.
  - Android requer bordas com leve opacidade (`borderWidth: 1`, `borderColor: '#E2E8DF'`) combinadas a `elevation: 2` para manter contraste nítido em telas de diferentes densidades (de `mdpi` a `xxxhdpi`).

### 7.5 Fontes do Sistema e Acessibilidade (Dynamic Type)
- Usuários que aumentam a escala de fonte nas configurações do sistema (idosos ou produtores rurais em campo) não devem sofrer com texto truncado ou sobreposto:
  - **Evite alturas fixas rígidas** em contêineres de texto (`minHeight` em vez de `height`).
  - Use `numberOfLines` e `flexShrink: 1` em textos com variáveis dinâmicas (nomes de fazendas longos, brincos extensos).

### 7.6 Desempenho em Dispositivos Android de Entrada
- **Listas com `FlatList`**: Listagens de animais, tarefas e estoque nunca devem ser renderizadas via `.map()` dentro de um `ScrollView`. Use sempre `FlatList` com `keyExtractor`, `initialNumToRender={12}`, `maxToRenderPerBatch={10}` e `windowSize={5}` para garantir rolagem suave a 60 FPS mesmo em celulares mais modestos.
- **Fuso Horário & Formatação**: Use sempre datas sem UTC offset que causem deslocamentos indesejados de dia no fuso brasileiro (`organizationDay` em vez de `toISOString()`).

---

## 8. Regras de Ouro para o Design Mobile

1. **Primeira dobra limpa**: Toda tela deve exibir conteúdo acionável imediatamente ao carregar, sem demandar scroll apenas para passar por cabeçalhos ou filtros.
2. **Nunca use fontes abaixo de 11px**: Nem mesmo em legendas de rodapé. Em telas de alta densidade (retina), textos menores ficam ilegíveis.
3. **Respeite a zona do polegar**: Ações frequentes (mudança de abas, novo registro, avançar/voltar dia) devem ficar facilmente acessíveis com o polegar.
4. **Alvos de toque confortáveis**: Botões com rótulo curto ou ícones devem manter `minWidth: 44px` e `minHeight: 44px`.
5. **Feedbacks visuais imediatos**:
   - Estados de clique: `style={({pressed}) => [style, pressed && { opacity: 0.65 }]}`.
   - Indicadores de carregamento centralizados ou inline (`ActivityIndicator color="#247638"`).
6. **Mantenha o isolamento e sincronia**: Qualquer nova funcionalidade nativa deve consultar o idioma organizacional e respeitar o nível de acesso (feeder, operator, manager, read_only).
