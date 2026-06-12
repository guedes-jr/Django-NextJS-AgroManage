Ficha dos lotes 

AJUSTE NA TABELA "DESEMPENHO POR FASE"
A estrutura da tabela está correta e deve permanecer da forma atual:
Maternidade
Creche
Crescimento
Terminação / Engorda
Porém a lógica de atualização dos dados precisa ser alterada.
Regra Geral
Cada fase deve ser atualizada somente quando o lote sair daquela fase.
Ou seja, a tabela deve registrar o resultado final obtido em cada etapa.
1. MATERNIDADE
Quando ocorrer o desmame e os leitões forem transferidos para a Creche, o sistema deve atualizar automaticamente a linha da Maternidade.
Informações que devem ser registradas:
Quantidade desmamada
Idade ao desmame
Peso médio ao desmame
Peso total do lote
GPD da maternidade
Mortalidade ocorrida na maternidade
Exemplo:
Maternidade
Quantidade: 20
Idade: 23 dias
Peso Médio: 6,50 kg
Peso Total: 130 kg
GPD: 0,230
Mortalidade: 2
Após o desmame esses dados ficam congelados na linha da maternidade e não devem mais ser alterados.
1. CRECHE
Enquanto o lote estiver na Creche, a linha pode permanecer sem dados completos.
Somente quando o lote sair da Creche e for transferido para Crescimento é que a linha da Creche deve ser preenchida.
Informações:
Quantidade final da Creche
Idade ao final da Creche
Peso médio ao final da Creche
Peso total
GPD da Creche
Conversão alimentar da Creche
Mortalidade da Creche
Exemplo:
Creche
Quantidade: 18
Idade: 70 dias
Peso Médio: 25 kg
Peso Total: 450 kg
GPD: 0,420
Conversão: 1,85
Mortalidade: 2
Após a transferência para Crescimento esses dados ficam registrados definitivamente.
1. CRESCIMENTO
A mesma lógica deve ser aplicada.
A linha de Crescimento somente deve ser preenchida quando o lote sair do Crescimento e entrar na Terminação.
Informações:
Quantidade final
Idade final
Peso médio final
Peso total
GPD
Conversão alimentar
Mortalidade



RESUMO DA REGRA
A tabela não deve mostrar dados parciais da fase atual.
Ela deve funcionar como um histórico consolidado das fases já concluídas.
Exemplo:
Quando o lote está na Creche:
✔ Maternidade preenchida
✔ Creche em andamento
✔ Crescimento vazio
✔ Terminação vazia
Quando o lote vai para Crescimento:
✔ Maternidade preenchida
✔ Creche preenchida
✔ Crescimento em andamento
✔ Terminação vazia
Quando o lote vai para Terminação:
✔ Maternidade preenchida
✔ Creche preenchida
✔ Crescimento preenchida
✔ Terminação em andamento
Dessa forma o produtor consegue visualizar claramente o resultado final obtido em cada fase do lote.


PLANO DE ATUALIZACAO DO MODULO DE PLANTACAO

Referencia visual analisada:
Foram analisadas 5 telas verticais enviadas por imagem:
1. Dashboard da safra / plantacao
2. Area do Agronomo
3. Preparacao da Terra
4. Adubacao de Base
5. Sementes e Mudas

OBJETIVO GERAL
Transformar o modulo de plantacao em um fluxo guiado por etapas da cultura, mais visual e operacional, onde cada plantacao funciona como um projeto agricola com:
- resumo tecnico da area;
- cards de etapas com imagem, status e acesso rapido;
- formulios especificos por tipo de operacao;
- resumo financeiro/produtivo por etapa;
- proximas atividades e recomendacoes tecnicas.


1. DASHBOARD DA PLANTACAO

Tela principal da plantacao deve deixar de ser apenas uma pagina de indicadores e passar a funcionar como painel de controle da safra.

Topo da tela:
- nome da plantacao/safra;
- propriedade;
- talhao;
- cultura;
- sino de notificacoes;
- status geral da plantacao.

Resumo da area:
- area total;
- data do plantio;
- hibrido/variedade;
- populacao planejada;
- estadio atual da cultura;
- responsavel tecnico.

Cards principais do fluxo:
1. Analise do Solo
2. Preparacao da Terra
3. Adubacao de Base
4. Semente / Sementes e Mudas
5. Fertirrigacao
6. Adubacao Foliar
7. Defensivos
8. Irrigacao
9. Area do Agronomo
10. Mao de Obra
11. Aplicacoes
12. Colheita
13. Resumo Total

Cada card deve conter:
- imagem grande e intuitiva;
- numero da etapa;
- titulo;
- descricao curta;
- badge de status;
- botao de abrir;
- progresso visual quando aplicavel.

Status sugeridos:
- Concluido: verde;
- Em andamento: amarelo/laranja;
- Pendente: azul/cinza;
- Em funcionamento: azul;
- Atrasado: vermelho.

Resumo total:
Deve ser um card maior no final do grid, com:
- custo total;
- receita total;
- lucro liquido;
- custo por hectare;
- ROI;
- producao estimada/real.

Atividades proximas:
Adicionar lista abaixo dos cards com:
- nome da atividade;
- data programada;
- vencimento;
- origem da atividade: recomendacao, operacao, alerta ou tarefa;
- botao Ver detalhes.


2. REAPROVEITAMENTO DAS IMAGENS DOS CARDS

As imagens dos cards das telas enviadas sao muito boas para tornar o fluxo mais intuitivo. A recomendacao e reaproveitar essa linguagem visual como assets do sistema.

Pasta sugerida:
frontend/public/images/crops/

Arquivos sugeridos:
- soil-analysis.png
- land-preparation.png
- base-fertilization.png
- seed.png
- fertigation.png
- foliar-fertilization.png
- pesticides.png
- irrigation.png
- agronomist.png
- labor.png
- applications.png
- harvest.png
- financial-summary.png

Mapeamento visual:
- Analise do Solo: frasco de analise + folha;
- Preparacao da Terra: trator;
- Adubacao de Base: saco de adubo + planta;
- Sementes e Mudas: saco de semente;
- Fertirrigacao: gotejo com muda;
- Adubacao Foliar: pulverizador manual;
- Defensivos: galao de defensivo;
- Irrigacao: mangueira/gotejo com gotas;
- Area do Agronomo: agronomo/personagem tecnico;
- Mao de Obra: trabalhador rural;
- Aplicacoes: calendario;
- Colheita: colheitadeira;
- Resumo Total: grafico financeiro/produtivo.

Uso recomendado:
- nos cards da dashboard da plantacao;
- nos atalhos da pagina de detalhe;
- nos headers dos formularios de lancamento;
- nos estados vazios das tabelas de cada etapa;
- no menu lateral ou abas do modulo de plantacao.

Importante:
As imagens devem ser tratadas como assets do frontend, preferencialmente em PNG/WebP com fundo transparente ou branco. Se forem extraidas dos prints, recortar manualmente cada icone/card e salvar com nomes estaveis.


3. FLUXO DE ETAPAS DA CULTURA

Adicionar um componente de linha de etapas no topo das telas operacionais.

Componente sugerido:
CropStageStepper

Etapas iniciais:
1. Analise do Solo
2. Preparacao da Terra
3. Adubacao de Base
4. Semente
5. Fertirrigacao
6. Adubacao Foliar

Estados:
- etapa concluida;
- etapa atual;
- etapa pendente.

Esse componente deve aparecer em:
- Preparacao da Terra;
- Adubacao de Base;
- Sementes e Mudas;
- Fertirrigacao;
- Adubacao Foliar;
- Defensivos;
- Colheita.


4. AREA DO AGRONOMO

Criar uma tela dedicada para recomendacoes tecnicas da plantacao.

Campos principais:
- data da recomendacao;
- validade;
- estadio da cultura;
- prioridade;
- tipo de recomendacao:
  - aplicacao;
  - fertilizacao;
  - irrigacao;
  - correcao;
  - monitoramento;
  - outros.

Produtos a aplicar:
- produto;
- dose por hectare;
- agua por hectare;
- total para area;
- selecao/ativacao por produto.

Recomendacoes complementares:
- volume de agua recomendado;
- pressao recomendada;
- bico recomendado;
- horario ideal de aplicacao;
- condicoes climaticas ideais.

Observacoes:
- texto livre do agronomo;
- anexos opcionais;
- historico de recomendacoes anteriores.

Resultado esperado:
A recomendacao tecnica deve poder gerar uma atividade futura ou preencher parcialmente um lancamento de aplicacao/adubacao/irrigacao.


5. PREPARACAO DA TERRA

Criar tela de lancamento especifica para preparo do solo.

Resumo da etapa:
- horas totais;
- custo total;
- ultimo lancamento.

Novo lancamento:
- data;
- operacao;
- talhao;
- trator/equipamento;
- tipo de uso: proprio ou terceirizado;
- horas trabalhadas;
- valor hora;
- servicos realizados:
  - calagem;
  - aracao;
  - gradagem;
  - nivelamento;
  - outro;
- observacoes.

Resumo do lancamento:
- horas;
- valor hora;
- custo total;
- area;
- custo por hectare.

Integracao:
- gerar custo da plantacao;
- opcionalmente gerar movimentacao financeira;
- alimentar historico operacional.


6. ADUBACAO DE BASE

Criar tela propria para adubacao de base.

Resumo da etapa:
- total aplicado;
- custo total;
- ultimo lancamento.

Novo lancamento:
- data;
- talhao;
- metodo de aplicacao;
- equipamento utilizado;
- operador;
- produtos aplicados.

Produtos aplicados:
- produto;
- formula/garantia;
- dose kg/ha;
- quantidade total;
- valor total;
- remover/adicionar produto.

Resumo:
- area;
- total aplicado;
- custo total;
- custo por hectare.

Integracao:
- baixar estoque dos produtos;
- gerar custo vinculado a plantacao;
- atualizar indicadores financeiros da plantacao.


7. SEMENTES E MUDAS

Criar tela propria para sementes/mudas.

Resumo da etapa:
- area do talhao;
- semente escolhida;
- quantidade total;
- custo total.

Novo lancamento:
- data;
- talhao;
- variedade/hibrido;
- fornecedor;
- tipo;
- tratamento;
- unidade;
- quantidade;
- populacao planejada.

Calculos:
- quantidade total de sementes;
- dose equivalente por hectare;
- custo por saco/unidade;
- custo total.

Produtos inclusos no tratamento:
- produto;
- dose;
- unidade;
- finalidade.

Integracao:
- baixar estoque de sementes/tratamentos;
- atualizar populacao e hibrido da plantacao;
- gerar custo vinculado.


8. FERTIRRIGACAO, ADUBACAO FOLIAR, DEFENSIVOS E IRRIGACAO

Atualizar telas existentes para seguir o mesmo padrao visual e estrutural:
- linha de etapas no topo;
- resumo da etapa;
- formulario de novo lancamento;
- produtos/insumos em linhas editaveis;
- observacoes;
- resumo calculado do lancamento;
- botao cancelar e salvar fixos no fim.

Fertirrigacao:
- produtos via irrigacao;
- dose;
- volume de calda;
- tempo de aplicacao;
- area aplicada;
- custo.

Adubacao Foliar:
- produto;
- dose;
- volume de agua;
- estadio da cultura;
- recomendacao tecnica vinculada;
- custo.

Defensivos:
- produto;
- tipo: herbicida, inseticida, fungicida, adjuvante;
- principio ativo;
- dose;
- carencia;
- alvo;
- equipamento;
- custo.

Irrigacao:
- data;
- bomba;
- horas;
- vazao;
- litros usados;
- potencia;
- kWh;
- custo de energia;
- operador.


9. MODELO DE DADOS E BACKEND

Avaliar se os models atuais cobrem todas as etapas.

Models existentes a reaproveitar:
- PlantingCycle;
- Field;
- Planting;
- Fertilization;
- Fertigation;
- PesticideApplication;
- Irrigation.

Novos models ou extensoes sugeridas:
- SoilAnalysis;
- LandPreparation;
- AgronomistRecommendation;
- LaborOperation;
- CropApplicationHistory;
- Harvest;
- PlantationActivity.

Campos comuns para operacoes:
- plantation;
- field;
- date;
- operator;
- equipment;
- area_applied_ha;
- total_cost;
- notes;
- created_by;
- recommendation;
- status.


10. COMPONENTES FRONTEND SUGERIDOS

Componentes novos:
- PlantationStageCard
- PlantationStageGrid
- CropStageStepper
- PlantationSummaryCard
- PlantationOperationForm
- OperationProductsTable
- OperationLaunchSummary
- AgronomistRecommendationForm
- UpcomingActivitiesList

Componentes reutilizaveis:
- Modal;
- Button;
- Badge;
- DataTable;
- dashboard-card;
- login-input-wrapper para campos com icones.


11. ORDEM DE IMPLEMENTACAO

Fase 1 - Visual e navegacao
- adicionar assets dos cards;
- criar StageCard;
- substituir atalhos atuais da pagina de detalhe por cards com imagem;
- criar dashboard de etapas dentro da plantacao;
- manter os modais existentes funcionando.

Fase 2 - Etapas operacionais
- criar CropStageStepper;
- refatorar Plantio/Sementes;
- criar Preparacao da Terra;
- melhorar Adubacao de Base;
- padronizar Fertirrigacao, Defensivos e Irrigacao.

Fase 3 - Area do Agronomo
- criar model de recomendacao;
- criar tela de recomendacao;
- permitir gerar atividade/lancamento a partir da recomendacao;
- criar historico.

Fase 4 - Calculos e integracoes
- integrar custos ao financeiro;
- integrar baixa de estoque;
- calcular custo/ha;
- calcular ROI e resultado por etapa;
- atualizar dashboard da plantacao.

Fase 5 - Relatorios
- relatorio geral da plantacao;
- relatorio por etapa;
- relatorio por talhao;
- relatorio de insumos e custos;
- exportacao PDF/Excel.


12. PRIORIDADE RECOMENDADA

Prioridade alta:
- dashboard de etapas com imagens;
- atalhos visuais na pagina de detalhes;
- tela de Sementes e Mudas;
- tela de Adubacao de Base;
- tela de Preparacao da Terra.

Prioridade media:
- Area do Agronomo;
- atividades proximas;
- historico completo de aplicacoes.

Prioridade baixa:
- notificacoes inteligentes;
- anexos;
- relatorios avancados.


RESUMO DA REGRA
A tabela não deve mostrar dados parciais da fase atual.
Ela deve funcionar como um histórico consolidado das fases já concluídas.
Exemplo:
Quando o lote está na Creche:
✔ Maternidade preenchida
✔ Creche em andamento
✔ Crescimento vazio
✔ Terminação vazia
Quando o lote vai para Crescimento:
✔ Maternidade preenchida
✔ Creche preenchida
✔ Crescimento em andamento
✔ Terminação vazia
Quando o lote vai para Terminação:
✔ Maternidade preenchida
✔ Creche preenchida
✔ Crescimento preenchida
✔ Terminação em andamento
Dessa forma o produtor consegue visualizar claramente o resultado final obtido em cada fase do lote.
