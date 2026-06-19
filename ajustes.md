# PLANO DE IMPLEMENTAÇÃO — MÓDULO DE GESTÃO DE CULTURAS / PLANTAÇÕES

## Projeto AgroManage — Django + Next.js

## 1. Objetivo Geral

Implementar no AgroManage um módulo completo de gestão agrícola, permitindo que cada plantação seja controlada como um projeto produtivo independente.

O produtor rural deverá conseguir acompanhar todo o ciclo da cultura, desde o planejamento e plantio até a colheita, com controle de custos, estoque, mão de obra, máquinas, irrigação, aplicações, receitas, lucro e indicadores de produtividade.

O foco principal é transformar o módulo de lavoura em uma ferramenta prática para o dia a dia do produtor, com telas simples, lançamentos rápidos e dashboards objetivos.

---

## 2. Situação Atual do Projeto

O sistema AgroManage já possui uma base adequada para receber esse módulo, pois já está organizado em domínios separados:

* `farms`: propriedades, setores e áreas produtivas;
* `crops`: campos, ciclos de plantio e colheitas;
* `inventory`: insumos, fornecedores, lotes e movimentações de estoque;
* `finance`: categorias financeiras, contas e transações;
* `reports`: dashboards e relatórios;
* `tasks`: tarefas operacionais;
* `audit`: registro de ações críticas.

Atualmente, o módulo `crops` possui uma estrutura inicial com:

* `Field`: área agrícola ou talhão;
* `PlantingCycle`: ciclo de plantio;
* `Harvest`: evento de colheita.

Porém, para atender ao controle real de culturas como milho, tomate e outras, o módulo precisa ser ampliado. A entidade `PlantingCycle` deve evoluir para representar a “Plantação” do ponto de vista operacional do produtor.

A recomendação é manter compatibilidade com a estrutura atual, reaproveitando `Field` e `Harvest`, mas criando uma entidade mais rica chamada `Plantation`, ou renomeando conceitualmente `PlantingCycle` para Plantação no frontend.

---

## 3. Conceito Central do Módulo

Cada plantação será tratada como um projeto agrícola independente.

Exemplo:

* Milho Safra 2025.2 — Talhão 01;
* Tomate Estufa 01 — Ciclo Junho/2026;
* Milho Rafa — Área 03;
* Feijão Safra Inverno — Talhão 02.

Cada plantação terá seus próprios:

* dados de plantio;
* custos;
* aplicações;
* irrigações;
* mão de obra;
* máquinas;
* estoque consumido;
* receitas;
* colheitas;
* relatórios;
* indicadores financeiros;
* indicadores produtivos.

Isso permite ao produtor saber exatamente quanto investiu, quanto produziu, quanto vendeu e qual foi o lucro de cada área ou cultura.

---

## 4. Estrutura Recomendada no Backend

## 4.1. App principal

Manter o desenvolvimento dentro do app:

`backend/apps/crops`

Esse app deve concentrar as regras agrícolas da lavoura.

## 4.2. Apps integrados

O módulo de culturas deverá se integrar com:

`farms`

Para relacionar a plantação com propriedade, setor e talhão.

`inventory`

Para consumir sementes, fertilizantes, defensivos, combustíveis e demais insumos.

`finance`

Para gerar custos, receitas e movimentações financeiras automaticamente.

`tasks`

Para criação futura de alertas, agenda agrícola e atividades programadas.

`reports`

Para dashboards e relatórios consolidados.

`audit`

Para registrar alterações críticas, exclusões e lançamentos financeiros.

---

# 5. Entidades Principais

## 5.1. Plantation — Plantação

Entidade central do módulo.

Representa uma cultura plantada em uma área específica durante um ciclo produtivo.

Campos recomendados:

* `id`
* `organization`
* `farm`
* `field`
* `sector`
* `name`
* `crop_type`
* `crop_name`
* `variety`
* `hybrid`
* `planted_area_ha`
* `population`
* `spacing`
* `planting_date`
* `expected_harvest_date`
* `actual_harvest_date`
* `status`
* `estimated_production_kg`
* `estimated_bags`
* `estimated_revenue`
* `notes`
* `responsible_user`
* `created_at`
* `updated_at`

Status sugeridos:

* Planejada
* Em plantio
* Em desenvolvimento
* Em manejo
* Em colheita
* Finalizada
* Cancelada

Observação prática:

No frontend, o termo exibido para o produtor deve ser “Plantação”, mesmo que internamente o model seja chamado de `Plantation` ou reaproveite `PlantingCycle`.

---

## 5.2. Field — Talhão / Área

A estrutura atual de `Field` deve ser mantida, representando a área agrícola onde a cultura será plantada.

Campos importantes:

* propriedade;
* setor;
* nome;
* área em hectares;
* tipo de solo;
* status;
* observações.

Melhoria recomendada:

Adicionar campos opcionais para uso futuro:

* tipo de irrigação;
* coordenadas;
* capacidade produtiva estimada;
* cultura predominante;
* histórico de uso da área.

---

## 5.3. CropOperation — Operação Agrícola

Criar uma entidade genérica para registrar operações da plantação.

Ela pode servir como base para plantio, adubação, aplicação de defensivos, fertirrigação, irrigação, máquinas e mão de obra.

Campos:

* `id`
* `plantation`
* `operation_type`
* `date`
* `description`
* `area_applied_ha`
* `operator`
* `total_cost`
* `cost_per_ha`
* `notes`

Tipos de operação:

* Plantio
* Irrigação
* Adubação
* Fertirrigação
* Defensivo
* Mão de obra
* Máquina
* Colheita
* Outro

Essa entidade facilita a criação de relatórios consolidados.

---

# 6. Módulos Operacionais

## 6.1. Módulo de Plantio

Objetivo:

Registrar os dados iniciais da implantação da cultura.

Campos:

* plantação;
* semente;
* fornecedor;
* lote;
* quantidade;
* unidade;
* quantidade por hectare;
* preço unitário;
* preço total;
* população;
* espaçamento;
* profundidade;
* data do plantio;
* operador;
* observações.

Cálculos automáticos:

* custo total;
* custo por hectare;
* quantidade utilizada por hectare;
* população estimada;
* saldo de semente consumido no estoque.

Integrações:

* gerar saída de estoque para semente;
* gerar despesa financeira na categoria Plantio;
* atualizar investimento total da plantação.

Regra prática:

O produtor não deve precisar lançar o mesmo custo duas vezes. Ao registrar o plantio, o sistema deve automaticamente gerar o custo financeiro e a baixa de estoque, quando o insumo estiver cadastrado.

---

## 6.2. Módulo de Irrigação

Objetivo:

Controlar irrigações, consumo de água, consumo energético e custo operacional.

Campos:

* plantação;
* data;
* hora inicial;
* hora final;
* bomba utilizada;
* potência da bomba;
* tempo ligado;
* vazão;
* litros utilizados;
* energia consumida;
* valor do kWh;
* custo energético;
* operador;
* observação.

Cálculos automáticos:

* tempo total ligado;
* litros irrigados;
* consumo energético;
* custo da irrigação;
* custo por hectare;
* total acumulado de água;
* total acumulado de energia.

Fórmulas sugeridas:

* `litros_utilizados = vazao_litros_hora * tempo_horas`
* `energia_consumida = potencia_kw * tempo_horas`
* `custo_energetico = energia_consumida * valor_kwh`
* `custo_por_hectare = custo_energetico / area_aplicada`

Relatórios relacionados:

* histórico de irrigações;
* consumo de água por plantação;
* consumo energético por período;
* custo de irrigação por hectare;
* comparação entre culturas.

---

## 6.3. Módulo de Adubação

Objetivo:

Registrar aplicações de fertilizantes, corretivos e adubos.

Campos:

* plantação;
* produto;
* fornecedor;
* lote;
* quantidade;
* unidade;
* dose por hectare;
* preço unitário;
* preço total;
* forma de aplicação;
* área aplicada;
* data;
* operador;
* observação.

Cálculos automáticos:

* quantidade total aplicada;
* custo total;
* custo por hectare;
* saldo utilizado no estoque;
* quantidade restante do lote;
* total acumulado de adubação.

Integrações:

* baixar produto do estoque;
* gerar despesa financeira na categoria Adubação;
* atualizar investimento da plantação;
* alimentar indicadores de insumos utilizados.

---

## 6.4. Módulo de Fertirrigação

Objetivo:

Registrar aplicações de produtos via sistema de irrigação.

Campos:

* plantação;
* produto;
* lote;
* quantidade do produto;
* unidade;
* litros de calda;
* concentração;
* tempo de aplicação;
* setor irrigado;
* área aplicada;
* data;
* operador;
* observação.

Cálculos automáticos:

* quantidade aplicada;
* custo da aplicação;
* custo por hectare;
* consumo do produto;
* histórico de fertirrigações.

Integrações:

* saída de estoque;
* despesa financeira na categoria Fertirrigação;
* atualização do histórico da plantação.

---

## 6.5. Módulo de Defensivos

Objetivo:

Controlar aplicações de defensivos agrícolas.

Categorias:

* inseticida;
* herbicida;
* fungicida;
* adjuvante;
* acaricida;
* bactericida;
* outro.

Campos:

* plantação;
* produto;
* tipo;
* princípio ativo;
* dose;
* quantidade;
* unidade;
* fornecedor;
* lote;
* valor unitário;
* valor total;
* área aplicada;
* data;
* operador;
* alvo da aplicação;
* equipamento utilizado;
* carência;
* observação.

Cálculos automáticos:

* custo total;
* custo por hectare;
* quantidade aplicada;
* saldo do produto;
* total por tipo de defensivo.

Integrações:

* baixa de estoque;
* movimentação financeira;
* histórico técnico da plantação;
* relatório de aplicações por período.

Recurso importante:

Permitir anexar fotos, receituários, notas fiscais ou registros da aplicação em uma etapa futura.

---

## 6.6. Módulo de Mão de Obra

Objetivo:

Registrar custos com funcionários, equipes, diárias e horas trabalhadas.

Campos:

* plantação;
* funcionário;
* equipe;
* atividade;
* data;
* horas trabalhadas;
* quantidade de diárias;
* valor hora;
* valor diária;
* quantidade de pessoas;
* observação.

Cálculos automáticos:

* custo total;
* total acumulado;
* custo por hectare;
* horas totais trabalhadas;
* custo por atividade.

Regras:

Quando o lançamento for por hora:

* `total = horas * valor_hora * quantidade_pessoas`

Quando o lançamento for por diária:

* `total = diarias * valor_diaria * quantidade_pessoas`

Integrações:

* gerar despesa financeira na categoria Mão de Obra;
* atualizar custo total da plantação;
* alimentar indicadores de horas trabalhadas.

---

## 6.7. Módulo de Máquinas

Objetivo:

Registrar uso de tratores, implementos, bombas, pulverizadores e outros equipamentos.

Campos:

* plantação;
* máquina;
* implemento;
* combustível;
* data;
* horas trabalhadas;
* consumo por hora;
* consumo total;
* operador;
* manutenção;
* custo operacional;
* observação.

Cálculos automáticos:

* consumo total;
* custo de combustível;
* custo operacional total;
* custo por hectare;
* horas máquina acumuladas.

Integrações:

* baixa de combustível no estoque, se cadastrado;
* despesa financeira na categoria Máquinas;
* histórico de uso da máquina;
* futuro controle de manutenção.

---

## 6.8. Módulo de Colheita

Objetivo:

Registrar produção realizada, venda, receita e resultado da plantação.

Campos:

* plantação;
* data;
* produção em kg;
* produção em sacas;
* peso por saca;
* umidade;
* preço de venda;
* comprador;
* frete;
* descontos;
* receita bruta;
* receita líquida;
* observação.

Cálculos automáticos:

* sacas por hectare;
* produção por hectare;
* receita bruta;
* receita líquida;
* lucro;
* rentabilidade;
* ROI;
* comparação entre produção estimada e produção realizada.

Fórmulas sugeridas:

* `sacas = producao_kg / peso_saca`
* `sacas_por_hectare = sacas / area_plantada`
* `receita_bruta = sacas * preco_venda`
* `receita_liquida = receita_bruta - frete - descontos`
* `lucro = receita_liquida - investimento_total`
* `roi = lucro / investimento_total * 100`

Integrações:

* gerar receita financeira na categoria Colheita;
* atualizar status da plantação;
* alimentar relatórios de produtividade;
* finalizar ciclo produtivo, se aplicável.

---

# 7. Financeiro Integrado

## 7.1. Regra principal

Todos os módulos operacionais devem gerar movimentações financeiras automaticamente.

O produtor não deve lançar manualmente no financeiro aquilo que já foi registrado dentro da plantação.

Exemplo:

Ao registrar uma aplicação de adubo de R$ 1.500,00, o sistema deve:

1. salvar a aplicação no módulo de Adubação;
2. baixar o produto do estoque, se houver lote informado;
3. criar uma transação financeira de despesa;
4. vincular a despesa à plantação;
5. atualizar o investimento atual da cultura.

---

## 7.2. Categorias financeiras obrigatórias

Criar ou garantir as seguintes categorias:

* Plantio;
* Irrigação;
* Adubação;
* Fertirrigação;
* Defensivos;
* Máquinas;
* Mão de obra;
* Colheita;
* Compras;
* Outros.

Tipos:

* Plantio: despesa;
* Irrigação: despesa;
* Adubação: despesa;
* Fertirrigação: despesa;
* Defensivos: despesa;
* Máquinas: despesa;
* Mão de obra: despesa;
* Colheita: receita;
* Compras: despesa;
* Outros: despesa ou receita, conforme o caso.

---

## 7.3. Vínculo entre Financeiro e Plantação

O model `Transaction` deve receber um vínculo opcional com a plantação.

Campo recomendado:

* `plantation`

Isso permitirá relatórios financeiros por cultura, por talhão, por safra e por plantação específica.

---

# 8. Estoque Integrado

## 8.1. Aproveitamento da estrutura atual

O projeto já possui uma estrutura de estoque que deve ser aproveitada:

* item de estoque;
* fornecedor;
* lote;
* movimentação;
* alerta de estoque.

O módulo de culturas deve consumir diretamente esses itens.

## 8.2. Categorias agrícolas recomendadas no estoque

Adicionar ou revisar categorias para:

* sementes;
* fertilizantes;
* defensivos;
* adjuvantes;
* combustível;
* corretivos;
* embalagens;
* peças;
* outros insumos agrícolas.

## 8.3. Baixa automática

Sempre que uma operação agrícola consumir produto, deve ser criada uma movimentação de saída no estoque.

Exemplos:

* plantio consome semente;
* adubação consome fertilizante;
* defensivo consome produto químico;
* fertirrigação consome fertilizante solúvel;
* máquinas consomem combustível.

---

# 9. Dashboard da Plantação

Ao abrir uma plantação, o produtor deve visualizar um painel objetivo.

## 9.1. Cards principais

* Cultura;
* Talhão;
* Área plantada;
* Data de plantio;
* Previsão de colheita;
* Dias de cultivo;
* Dias restantes;
* Status;
* Investimento atual;
* Receita prevista;
* Lucro previsto;
* Produção estimada;
* Sacas estimadas;
* Receita por hectare;
* Lucro por hectare;
* Custo por hectare.

## 9.2. Indicadores técnicos

* Água consumida;
* Energia consumida;
* Adubo utilizado;
* Defensivos utilizados;
* Horas de mão de obra;
* Horas de máquina;
* Produção estimada;
* Produção realizada.

## 9.3. Indicadores financeiros

* Custo total;
* Receita total;
* Lucro;
* ROI;
* Custo por hectare;
* Receita por hectare;
* Lucro por hectare;
* Categoria de maior custo;
* Evolução dos custos.

---

# 10. Menu Interno da Plantação

Ao acessar uma plantação, o menu deve ser organizado assim:

1. Resumo;
2. Plantio;
3. Irrigação;
4. Adubação;
5. Fertirrigação;
6. Defensivos;
7. Mão de obra;
8. Máquinas;
9. Colheita;
10. Custos;
11. Financeiro;
12. Relatórios.

A ideia é o produtor entrar na cultura e lançar tudo de forma simples, sem precisar procurar os módulos espalhados pelo sistema.

---

# 11. Dashboard Principal do Sistema

Ao acessar o sistema, mostrar visão geral da fazenda ou organização.

Cards recomendados:

* Total investido;
* Receita prevista;
* Lucro previsto;
* Número de plantações ativas;
* Área total plantada;
* Produção estimada;
* Produção realizada;
* Água consumida;
* Energia consumida;
* Custos acumulados;
* Últimos lançamentos;
* Próximas atividades;
* Alertas automáticos.

Filtros:

* propriedade;
* cultura;
* talhão;
* safra;
* período;
* status.

---

# 12. Relatórios

## 12.1. Relatórios obrigatórios

* Relatório geral da plantação;
* Relatório financeiro;
* Relatório por cultura;
* Relatório por talhão;
* Relatório por período;
* Relatório de irrigação;
* Relatório de adubação;
* Relatório de defensivos;
* Relatório de colheita;
* Relatório de lucro;
* Relatório comparativo.

## 12.2. Exportações

Implementar exportação em:

* PDF;
* Excel.

## 12.3. Relatório Geral da Plantação

Deve conter:

* identificação da plantação;
* dados da propriedade;
* área plantada;
* datas principais;
* custos por categoria;
* total investido;
* produção estimada;
* produção realizada;
* receita;
* lucro;
* ROI;
* histórico de operações;
* observações.

---

# 13. Gráficos

Gráficos recomendados:

* custos por categoria;
* evolução dos custos;
* receita acumulada;
* lucro acumulado;
* consumo de água;
* consumo energético;
* aplicações por período;
* histórico financeiro;
* produção por cultura;
* comparação entre plantações.

Biblioteca recomendada no frontend:

* Recharts.

---

# 14. Migração da Planilha Atual

## 14.1. Objetivo

Migrar a planilha agrícola atual para o banco de dados, evitando que o produtor continue dependendo de controles manuais.

## 14.2. Abas identificadas

A planilha atual possui categorias que devem virar tabelas ou registros no banco:

* Irrigação;
* Adubação;
* Defensivos;
* Mão de obra;
* Máquinas;
* Colheita;
* Compras;
* Fechamentos.

## 14.3. Estratégia de migração

Criar um comando Django para importar a planilha.

Exemplo:

`python manage.py import_crop_spreadsheet caminho/arquivo.xlsx`

Etapas:

1. Ler todas as abas da planilha;
2. Normalizar nomes de colunas;
3. Validar datas, valores e unidades;
4. Criar ou vincular propriedade;
5. Criar ou vincular talhão;
6. Criar plantação;
7. Importar lançamentos por aba;
8. Criar movimentações financeiras;
9. Criar movimentações de estoque quando possível;
10. Gerar relatório de inconsistências.

## 14.4. Tratamento de erros

A importação deve identificar:

* datas inválidas;
* valores vazios;
* produtos sem cadastro;
* fornecedores inexistentes;
* linhas duplicadas;
* custos sem categoria;
* lançamentos sem plantação;
* unidades incompatíveis.

Nenhum dado deve ser perdido. Quando não for possível importar automaticamente, o sistema deve gerar uma lista de pendências para correção.

---

# 15. APIs Necessárias

## 15.1. Plantations

Endpoints:

* listar plantações;
* criar plantação;
* detalhar plantação;
* atualizar plantação;
* excluir ou arquivar plantação;
* dashboard da plantação;
* indicadores da plantação.

Rotas sugeridas:

* `GET /api/crops/plantations/`
* `POST /api/crops/plantations/`
* `GET /api/crops/plantations/{id}/`
* `PATCH /api/crops/plantations/{id}/`
* `DELETE /api/crops/plantations/{id}/`
* `GET /api/crops/plantations/{id}/dashboard/`
* `GET /api/crops/plantations/{id}/indicators/`

## 15.2. Operações

Rotas sugeridas:

* `GET /api/crops/plantations/{id}/planting/`
* `POST /api/crops/plantations/{id}/planting/`
* `GET /api/crops/plantations/{id}/irrigations/`
* `POST /api/crops/plantations/{id}/irrigations/`
* `GET /api/crops/plantations/{id}/fertilizations/`
* `POST /api/crops/plantations/{id}/fertilizations/`
* `GET /api/crops/plantations/{id}/fertirrigations/`
* `POST /api/crops/plantations/{id}/fertirrigations/`
* `GET /api/crops/plantations/{id}/pesticide-applications/`
* `POST /api/crops/plantations/{id}/pesticide-applications/`
* `GET /api/crops/plantations/{id}/labor/`
* `POST /api/crops/plantations/{id}/labor/`
* `GET /api/crops/plantations/{id}/machines/`
* `POST /api/crops/plantations/{id}/machines/`
* `GET /api/crops/plantations/{id}/harvests/`
* `POST /api/crops/plantations/{id}/harvests/`

---

# 16. Estrutura Recomendada no Frontend

## 16.1. Feature principal

Criar ou completar:

`frontend/src/features/crops`

Estrutura sugerida:

* `components`
* `pages`
* `services`
* `hooks`
* `types`
* `validators`

## 16.2. Telas principais

Criar as seguintes telas:

* listagem de plantações;
* cadastro de plantação;
* edição de plantação;
* dashboard da plantação;
* lançamentos de plantio;
* lançamentos de irrigação;
* lançamentos de adubação;
* lançamentos de fertirrigação;
* lançamentos de defensivos;
* lançamentos de mão de obra;
* lançamentos de máquinas;
* lançamentos de colheita;
* relatórios da plantação.

## 16.3. Experiência do produtor

A interface deve priorizar:

* poucos campos por etapa;
* botões grandes e claros;
* cards objetivos;
* textos simples;
* atalhos para novo lançamento;
* visualização rápida de custos;
* uso confortável em celular;
* filtros simples;
* tela de resumo antes de detalhes técnicos.

---

# 17. Serviços e Regras de Negócio

Seguir a arquitetura do projeto:

* views devem apenas receber requisição e retornar resposta;
* serializers devem validar dados;
* services devem executar regras de negócio;
* selectors devem centralizar consultas complexas;
* cálculos financeiros devem ficar isolados em services.

Services recomendados:

* `plantation_service.py`
* `crop_cost_service.py`
* `crop_financial_service.py`
* `crop_inventory_service.py`
* `crop_indicator_service.py`
* `crop_report_service.py`
* `crop_import_service.py`

Selectors recomendados:

* `plantation_selector.py`
* `crop_dashboard_selector.py`
* `crop_report_selector.py`
* `crop_financial_selector.py`

---

# 18. Cálculos Centrais

## 18.1. Investimento atual

Soma de todos os custos vinculados à plantação:

* plantio;
* irrigação;
* adubação;
* fertirrigação;
* defensivos;
* mão de obra;
* máquinas;
* outros.

## 18.2. Receita prevista

Pode ser calculada por:

* produção estimada em sacas;
* preço previsto por saca.

## 18.3. Lucro previsto

`lucro_previsto = receita_prevista - investimento_atual`

## 18.4. Receita por hectare

`receita_por_hectare = receita_total / area_plantada`

## 18.5. Lucro por hectare

`lucro_por_hectare = lucro / area_plantada`

## 18.6. Custo por hectare

`custo_por_hectare = investimento_atual / area_plantada`

## 18.7. ROI

`roi = lucro / investimento_atual * 100`

## 18.8. Sacas por hectare

`sacas_por_hectare = sacas_colhidas / area_plantada`

---

# 19. Permissões

O módulo deve respeitar a organização do usuário.

Regras:

* usuário só acessa plantações da própria organização;
* usuário só visualiza propriedades vinculadas à sua organização;
* lançamentos financeiros seguem a organização da plantação;
* exclusões críticas devem ser auditadas;
* futuramente, permitir perfis como proprietário, gerente, operador e financeiro.

---

# 20. Auditoria

Registrar no app de auditoria:

* criação de plantação;
* alteração de área plantada;
* alteração de datas;
* exclusão ou cancelamento de plantação;
* criação de lançamento financeiro;
* exclusão de lançamento financeiro;
* baixa de estoque;
* alteração de colheita;
* fechamento de ciclo.

---

# 21. Implementação por Etapas

## Etapa 1 — Base da Plantação

Objetivo:

Criar a base do novo módulo.

Entregas:

* revisar model atual `PlantingCycle`;
* criar ou adaptar model `Plantation`;
* relacionar com propriedade, setor e talhão;
* criar serializers;
* criar viewsets;
* registrar rotas;
* criar tela de listagem;
* criar formulário de cadastro;
* criar tela de detalhes.

Resultado esperado:

O produtor consegue cadastrar e visualizar plantações.

---

## Etapa 2 — Dashboard da Plantação

Objetivo:

Mostrar resumo gerencial da plantação.

Entregas:

* criar endpoint de dashboard;
* calcular dias de cultivo;
* calcular dias restantes;
* calcular área;
* calcular investimento;
* calcular receita prevista;
* calcular lucro previsto;
* criar cards no frontend;
* criar tela de resumo.

Resultado esperado:

Ao abrir uma plantação, o produtor visualiza a situação atual da cultura.

---

## Etapa 3 — Plantio e Estoque

Objetivo:

Registrar o plantio e integrar com estoque.

Entregas:

* model de plantio;
* vínculo com item de estoque;
* vínculo com fornecedor e lote;
* cálculo de custo;
* baixa automática de semente;
* geração de despesa financeira;
* tela de lançamento de plantio.

Resultado esperado:

O plantio passa a gerar custo e consumo de estoque automaticamente.

---

## Etapa 4 — Adubação, Fertirrigação e Defensivos

Objetivo:

Controlar aplicações técnicas.

Entregas:

* models de adubação;
* models de fertirrigação;
* models de defensivos;
* cálculo de custo por hectare;
* baixa automática de estoque;
* geração de despesas;
* histórico por plantação;
* telas de lançamento.

Resultado esperado:

O produtor consegue controlar todos os insumos aplicados na cultura.

---

## Etapa 5 — Irrigação

Objetivo:

Controlar água, energia e custo de irrigação.

Entregas:

* model de irrigação;
* cálculo de litros;
* cálculo de energia;
* cálculo de custo;
* totalizadores;
* relatório de irrigação;
* gráfico de consumo.

Resultado esperado:

O produtor consegue saber quanto irrigou e quanto gastou com energia.

---

## Etapa 6 — Mão de Obra e Máquinas

Objetivo:

Controlar custos operacionais.

Entregas:

* model de mão de obra;
* model de máquinas;
* cálculo por hora;
* cálculo por diária;
* cálculo de combustível;
* custo por hectare;
* geração financeira automática;
* telas de lançamento.

Resultado esperado:

Custos operacionais deixam de ficar fora do cálculo da cultura.

---

## Etapa 7 — Colheita e Fechamento

Objetivo:

Registrar produção e resultado final.

Entregas:

* ampliar model de colheita;
* calcular sacas;
* calcular receita;
* calcular lucro;
* calcular ROI;
* registrar comprador;
* registrar frete e descontos;
* finalizar plantação;
* gerar receita financeira.

Resultado esperado:

O produtor consegue fechar a cultura e saber se teve lucro ou prejuízo.

---

## Etapa 8 — Relatórios e Exportações

Objetivo:

Gerar relatórios gerenciais.

Entregas:

* relatório geral;
* relatório financeiro;
* relatório por cultura;
* relatório por talhão;
* relatório por período;
* exportação PDF;
* exportação Excel;
* gráficos consolidados.

Resultado esperado:

O sistema gera informações úteis para tomada de decisão e prestação de contas.

---

## Etapa 9 — Migração da Planilha

Objetivo:

Importar o histórico existente.

Entregas:

* comando de importação;
* leitura da planilha;
* validação das abas;
* criação das plantações;
* importação dos lançamentos;
* relatório de inconsistências;
* conferência dos totais.

Resultado esperado:

O produtor deixa de depender da planilha e passa a usar o sistema como fonte principal.

---

## Etapa 10 — Melhorias Futuras

Funcionalidades futuras:

* agenda agrícola;
* notificações automáticas;
* controle completo de fornecedores;
* controle de clientes;
* controle de máquinas;
* controle de manutenção;
* API meteorológica;
* sensores IoT;
* aplicativo mobile;
* mapa dos talhões;
* georreferenciamento;
* QR Code por plantação;
* registro fotográfico;
* anexos de notas fiscais;
* fluxo de caixa;
* controle de safras;
* comparativo entre safras;
* painel gerencial em tempo real.

---

# 22. Prioridade Recomendada

Para não travar o desenvolvimento, a ordem prática deve ser:

1. Plantação;
2. Dashboard da plantação;
3. Financeiro vinculado;
4. Plantio;
5. Adubação;
6. Defensivos;
7. Irrigação;
8. Mão de obra;
9. Máquinas;
10. Colheita;
11. Relatórios;
12. Migração da planilha.

Essa ordem entrega valor rápido e evita começar por partes complexas antes da base estar consolidada.

---

# 23. Resultado Esperado

Ao final da implementação, o AgroManage deverá permitir que o produtor rural:

* cadastre cada plantação como um projeto independente;
* acompanhe custos em tempo real;
* registre aplicações e operações agrícolas;
* controle estoque consumido;
* gere movimentações financeiras automaticamente;
* acompanhe produtividade;
* calcule lucro e ROI;
* compare culturas, talhões e safras;
* substitua a planilha por um sistema centralizado;
* tome decisões com base em dados reais da propriedade.

O objetivo não é apenas criar telas de cadastro, mas sim construir um módulo de gestão agrícola que ajude o produtor a responder perguntas práticas:

* Quanto já investi nessa plantação?
* Quanto estou gastando por hectare?
* Qual cultura está dando mais retorno?
* Quanto de água e energia estou consumindo?
* Quanto usei de adubo e defensivo?
* Qual foi meu lucro real?
* Qual talhão é mais produtivo?
* Qual safra teve melhor resultado?

Esse deve ser o foco central da implementação.
