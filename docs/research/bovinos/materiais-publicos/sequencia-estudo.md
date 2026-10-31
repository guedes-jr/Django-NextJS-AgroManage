# Sequência de estudo e comparação com o AgroManage

**Definida em:** 30/10/2026. **Escopo:** OCTA Agro → VSM Agro → BOVin → iRancho. **FieldData está fora desta etapa.**

O objetivo é estudar cada sistema, comparar as evidências com o que já existe no AgroManage e transformar boas ideias em melhorias úteis, mantendo o padrão visual herdado dos suínos e as integrações existentes.

## 1. Ordem: do menor para o maior acervo demonstrativo

| Etapa | Sistema | Material localizado | Foco do estudo | Situação |
|---|---|---|---|---|
| 1 | [OCTA Agro](octaagro.md) | Páginas de plataforma e módulos; nenhum vídeo ou formulário bovino específico identificado | Organização modular, financeiro, estoque e mapas | [Estudo concluído; implementação pendente](estudo-octaagro.md) |
| 2 | [VSM Agro](vsmagro.md) | 2 vídeos, 7 imagens e páginas explicativas | Agenda reprodutiva, resumo dos lotes, avisos e nutrição | Planejada |
| 3 | [BOVin](bovin.md) | 5 demonstrações de tela, 10 imagens e 5 páginas funcionais | Movimentação coletiva, pastagens, trato, confinamento e resultado | Planejada |
| 4 | [iRancho](irancho.md) | 5 playlists: 48 entradas identificadas, correspondentes a 47 vídeos distintos; 8 imagens e páginas de produto | Gestão individual, manejos compostos, reprodução, coleta e integração | Planejada |

**Critério de ordenação:** quantidade e profundidade do material demonstrativo encontrado, combinando vídeos, telas e documentação de produto. Não é uma classificação da qualidade ou da quantidade de funcionalidades de cada sistema. Uma página institucional não equivale a uma demonstração de fluxo.

As contagens são as do levantamento já realizado. Sete entradas das playlists iRancho ficaram sem título/metadados suficientes e não integram os 47 vídeos identificados. Um mesmo vídeo presente em duas playlists deve ser estudado uma única vez.

## 2. Método comum às quatro etapas

Para cada sistema, executar o mesmo ciclo:

1. **Separar o material:** demonstração de tela, imagem de interface, explicação textual, divulgação comercial ou depoimento. Usar primeiro o que mostra a operação.
2. **Estudar por fluxo:** identificar objetivo, ponto de entrada, campos, filtros, participantes, validações, estados e resultado. Em vídeo, registrar minuto/segundo; em página, registrar seção e imagem de origem.
3. **Reproduzir o cenário no AgroManage:** conferir interface, serviço/API e comportamento persistido. Usar ambiente local e dados de teste, sem alterar registros operacionais para experimentar ideias.
4. **Classificar a diferença:** já existe; existe parcialmente; pode ser melhor apresentado; exige integração; exige investigação; oportunidade nova; não se aplica.
5. **Selecionar a melhoria:** explicitar o problema resolvido, o benefício esperado, a dependência e o critério de aceite. Uma ideia não vira requisito apenas por aparecer em outro produto.
6. **Consolidar a etapa:** registrar comparação, evidências e decisões; acrescentar as propostas ao backlog único, evitando duplicar a mesma ideia em sistemas diferentes.

Esta sequência prepara o trabalho. Não significa que os novos vídeos já tenham sido revisados ou que suas funcionalidades tenham sido implementadas.

### Registro de evidência

Usar estas classificações:

- **Demonstrado:** a tela ou sequência mostra a operação. Isso ainda não permite inferir regras de backend não observadas.
- **Documentado:** o fornecedor descreve o comportamento em texto público.
- **Anunciado:** menção comercial sem detalhe operacional suficiente.
- **Não verificado:** falta evidência para concluir.
- **Proposta AgroManage:** adaptação nossa para resolver uma necessidade do projeto.

Para campos, distinguir claramente “visível”, “obrigatório” e “regra inferida”. Não inventar formulários, fórmulas ou estados para completar uma imagem parcial.

## 3. Etapa 1 — OCTA Agro

**Por que começar aqui:** o acervo é menor e predominantemente textual. Permite um estudo delimitado da gestão transversal antes de aprofundar o manejo pecuário.

### Ordem dos materiais

1. [Plataforma](https://octaagro.com.br/plataforma): organização dos módulos e papéis.
2. [Financeiro rural](https://octaagro.com.br/modulos/financeiro-rural): títulos, baixas, estornos e centros de custo.
3. [Estoque rural](https://octaagro.com.br/modulos/estoque-rural): lotes, almoxarifados e saldo por movimentações.
4. [Geo Rural](https://octaagro.com.br/modulos/geo-rural): importação, prévia e confirmação do mapa.
5. [Produtores rurais](https://octaagro.com.br/produtores-rurais): revisar a relação entre áreas da operação.

### Perguntas para comparar

- Já temos essas capacidades no financeiro, estoque e cadastro de propriedades? O que falta é função, integração ou acesso pela tela bovina?
- Compra, venda, consumo e despesa chegam ao lugar correto sem redigitação?
- Uma correção preserva origem, autor, situação e histórico?
- Qual infraestrutura de mapas/talhões do AgroManage pode ser reaproveitada para pastagens?
- O usuário entende as etapas de prévia, validação e confirmação de uma importação?

**Entrega da etapa:** mapa das integrações existentes e propostas transversais. Não descrever manejo bovino especializado com base nesse acervo, pois ele não foi encontrado nas páginas examinadas.

## 4. Etapa 2 — VSM Agro

### Ordem dos materiais

1. [Apresentação do produto, de 2023](https://www.youtube.com/watch?v=Q95LQOZgHLo), cerca de três minutos.
2. [Vídeo curto, de 2025](https://www.youtube.com/watch?v=a8btNztSczM), 59 segundos.
3. Imagens de [agenda](imagens/vsmagro/Gestao-de-manejos.webp) e [lotes](imagens/vsmagro/Gestao-de-lotes.webp).
4. Imagens de [nutrição](imagens/vsmagro/vantagens-Nutricao.webp) e [pastagens](imagens/vsmagro/Gestao-de-Pasto.webp).
5. [FAQ](https://www.vsmagro.com.br/perguntas-frequentes/) e [catálogo completo](vsmagro.md) para contextualizar os demais módulos.

### Perguntas para comparar

- A agenda mostra claramente o que foi feito, o próximo passo e o que está atrasado?
- O resumo do lote reúne informações suficientes sem obrigar o usuário a abrir várias fichas?
- Protocolo, exposição, diagnóstico, parto e desmame estão relacionados ou aparecem apenas como registros separados?
- A apresentação de genealogia e matrizes acrescenta alguma informação útil à ficha atual?
- Abastecimento e consumo podem ficar mais claros com indicadores e agrupamentos já disponíveis?

**Base atual a preservar:** cobertura, diagnóstico, parto e desmame; lactação independente da gestação; agenda inicial e histórico. Comparar o ciclo completo antes de concluir que precisamos de outro cadastro reprodutivo.

**Entrega da etapa:** comparação de agenda, reprodução e resumos de lote, com propostas de organização da informação e eventuais lacunas funcionais. As imagens são peças de divulgação com ampliações/desfoques; campos ilegíveis continuam não verificados.

## 5. Etapa 3 — BOVin

### Ordem dos materiais

1. [Controle de rebanho](https://www.bovin.com.br/controle-de-rebanho) e sua demonstração: movimentações, categorias e correção histórica.
2. [Gestão de pastos](https://www.bovin.com.br/gestao-de-pastos): localização, lotação e histórico da área.
3. [Suplementação](https://www.bovin.com.br/suplementacao): planejamento, fornecimento e calendário.
4. [Confinamento](https://www.bovin.com.br/confinamento): continuidade entre pasto, curral e baia.
5. [Financeiro](https://www.bovin.com.br/gestao-financeira): relação entre produção, custos e resultado.

Os cinco links de vídeo direto e as dez imagens estão no [catálogo BOVin](bovin.md).

### Perguntas para comparar

- Como apresentar entradas, saídas e transferências em um fluxo claro e auditável?
- Como reconciliar quantidade, categoria e peso ao movimentar apenas parte de um lote?
- O histórico da área permanece compreensível após divisão, união, mudança de lote ou correção retroativa?
- Podemos apresentar alimentação prevista versus realizada sem duplicar consumo e custo?
- Onde uma grade por dia/pasto ajuda mais que a listagem atual?
- Como diferenciar venda, receita prevista e recebimento efetivo na interface?
- Qual informação de custo por cabeça, kg ou arroba tem origem confiável no AgroManage?

**Base atual a preservar:** lotes coletivos por fase, pesagem média, ocupação de pastagens, capacidade em UA/ha, consumo com baixa de estoque e venda de lote integrada ao serviço financeiro existente.

**Limite:** o BOVin declara controle por lote. Não usar esse material como modelo de genealogia, identidade individual ou reprodução por matriz. A maior contribuição esperada está nos fluxos coletivos, no trato e na leitura gerencial.

**Entrega da etapa:** comparação detalhada das operações coletivas e proposta para integridade dos movimentos, nutrição e resultado. Fórmulas e recálculos anunciados precisam ser verificados antes de sua adoção.

## 6. Etapa 4 — iRancho

O maior acervo fica por último para aprofundar os temas já classificados nas etapas anteriores e evitar trabalho duplicado.

### Ordem dos blocos

| Bloco | Material inicial | O que comparar |
|---|---|---|
| 4.1 Cadastro e entrada | [Tutoriais iRancho](https://www.youtube.com/playlist?list=PLWdM_wLixeSgs1C_ZfHVQRtzo7NTzSwdc): cadastro e entrada de animais | Identificação, origem, aquisição e conferência |
| 4.2 Pesagem e movimentação | [App do Peão](https://www.youtube.com/playlist?list=PLWdM_wLixeShoxdTpaVGKV0HbhH50sXBc): pesagem e movimentação | Participantes efetivos, captura e sequência de trabalho |
| 4.3 Manejos compostos | [Imagem de criação de manejo](imagens/irancho/202610_criarmanejo.png) e [página do produto](https://www.irancho.com.br/sobre-o-irancho/) | Reutilização de ações, rascunho, confirmação e responsabilidade |
| 4.4 Sanidade | App do Peão: lançamento de medicamentos; ficha e páginas de produto | Aplicação, consumo, histórico e restrições |
| 4.5 Reprodução | [RePro](https://conteudo.irancho.com.br/repro) e [playlist RePro](https://www.youtube.com/playlist?list=PLWdM_wLixeSjdPVWV9v3MLjsSH8UOtKib) | Agenda, equipe e protocolos; distinguir o produto RePro do sistema principal |
| 4.6 Nutrição e confinamento | App do Peão: nutrição/leitura de cocho; [playlist Confinamento](https://www.youtube.com/playlist?list=PLWdM_wLixeSgSTc45LO7FoK4jq62Biyc7) | Trato, baias, consumo e produtividade |
| 4.7 Venda e embarque | Tutoriais iRancho: manejo de venda e embarque | Documento, participantes, saída e integração financeira |
| 4.8 Indicadores e novidades | Imagens de relatórios; [iRancho em um minuto](https://www.youtube.com/playlist?list=PLWdM_wLixeSj_l94qSOG7SLnmD_gL5xUK) | Complementar temas; separar explicação comercial de demonstração operacional |
| 4.9 Campo e dispositivos | App do Peão, [app atual](https://www.irancho.com.br/app-irancho/) e vídeos BOS catalogados | Coleta offline, sincronização e dispositivos como estudo próprio |

### Regras para estudar o acervo

- Trabalhar os 47 vídeos distintos identificados, retirando repetições entre playlists; registrar o que é tutorial, apresentação ou material de domínio.
- Começar pelos tutoriais ligados às lacunas reais do projeto. Vídeos comerciais complementam o estudo, mas não definem validações ou campos sozinhos.
- Identificar versões: “App do Peão”, aplicativo de campo atual, RePro e Confinamento não devem ser tratados como uma única tela ou uma única época.
- Um vídeo indisponível deve ser marcado como tal, sem reconstrução imaginada de seu conteúdo.
- A coleta por voz só entra como oportunidade posterior se houver necessidade clara e um fluxo confiável de confirmação/correção. Não é pré-requisito para completar as rotinas bovinas básicas.

**Base atual a preservar:** cadastro individual, históricos, manejos coletivos de pesagem/sanidade/castração com rascunho e confirmação, carências, reprodução e ordenha. Comparar primeiro o que já está implementado.

**Entrega da etapa:** comparação por fluxo individual/coletivo, propostas consolidadas e requisitos candidatos para integrações avançadas.

## 7. Matriz de comparação e seleção de melhorias

Cada descoberta deve ocupar uma linha. Não usar uma lista vaga de funcionalidades como substituto de uma comparação de comportamento.

| Campo | O que registrar |
|---|---|
| Identificação | Sistema, módulo e fluxo estudado |
| Fonte | Link, data/versão e minuto ou imagem |
| Evidência | Demonstrado, documentado, anunciado ou não verificado |
| Problema prático | A dificuldade do produtor que a ideia resolve |
| AgroManage atual | Tela/rota, API/serviço e comportamento conferido |
| Diferença | Já existe, parcial, apresentação, integração, nova capacidade ou não se aplica |
| Proposta | Adaptação concreta ao nosso modelo e estilo |
| Benefício | Menos digitação, menos erro, melhor decisão ou rastreabilidade |
| Dependências | Estoque, financeiro, fazendas, permissões ou migração |
| Impacto e esforço | Alto/médio/baixo, com justificativa |
| Critério de aceite | Cenário observável que comprova o resultado |
| Decisão | Manter, melhorar, implementar depois, investigar ou descartar |

### Referência inicial do nosso sistema

Usar o código corrente como autoridade, e não apenas as notas antigas de pesquisa:

- [Interface bovina](../../../../frontend/src/components/cattle/CattleWorkspace.tsx) e [manejos coletivos](../../../../frontend/src/components/cattle/CattleManagementWorkspace.tsx).
- [Serviços bovinos](../../../../backend/apps/livestock/cattle_services.py), [validações](../../../../backend/apps/livestock/cattle_serializers.py), [endpoints](../../../../backend/apps/livestock/cattle_views.py) e [indicadores](../../../../backend/apps/livestock/cattle_selectors.py).
- [Contrato documentado](../../../ai/api.md), seção bovina, como apoio ao código.
- [Revisão JetBov](../../../../RESUMO_GESTAO_BOVINA_JETBOV.md) como referência anterior, considerando que parte das lacunas ali registradas já foi implementada.

Consultar os módulos compartilhados somente quando o fluxo comparado depender deles. Uma capacidade ausente na tela bovina pode já existir no financeiro, estoque ou cadastro de fazendas.

## 8. Como transformar o estudo em evolução do produto

Ao terminar cada etapa, consolidar um resumo com evidências, matriz de comparação e propostas. As propostas escolhidas devem entrar em incrementos pequenos e verificáveis; a etapa seguinte reaproveita a matriz, em vez de propor de novo a mesma função.

Priorizar nesta ordem:

1. **Integridade:** quantidades, cronologia, custos, confirmações e estornos consistentes.
2. **Rotinas essenciais:** completar o ciclo operacional que hoje exige contorno manual.
3. **Usabilidade:** reduzir passos, organizar filtros/ações e melhorar os resumos no padrão visual atual.
4. **Gestão:** relatórios, apuração e indicadores com origem/fórmula explícitas.
5. **Avançado:** mapas mais completos, equipamentos, offline e voz, conforme necessidade e dependências.

Para considerar uma melhoria pronta, conferir o cenário principal, erros relevantes, permissões, isolamento por organização/fazenda e efeitos nos domínios integrados. Mudanças visuais seguem os componentes e estilos já aprovados; evolução bovina não deve alterar comportamento de suínos, aves ou plantações por acidente.

**Resultado esperado:** um backlog consolidado, com ideias justificadas e rastreáveis, seguido de melhorias no AgroManage. Reproduzir todos os recursos dos concorrentes não é o critério de sucesso; resolver melhor as operações do nosso usuário é.
