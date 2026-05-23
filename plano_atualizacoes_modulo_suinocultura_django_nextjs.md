# Plano de Atualizações do Software — Módulo Suinocultura

## Objetivo

Implementar correções e melhorias solicitadas pelo cliente no módulo de gestão de suínos, garantindo que os fluxos produtivos funcionem corretamente entre cadastro, creche, crescimento, engorda, marrãs, matrizes, gestação e maternidade.

Este documento deve ser usado como base por um agente de IA/desenvolvedor para implementação em:

- Backend: Django / Django REST Framework
- Frontend: Next.js / React
- Banco de dados: conforme estrutura atual do projeto

---

## Contexto Geral

O cliente validou parcialmente as funcionalidades atuais do sistema e identificou problemas em alguns fluxos.

O principal objetivo é corrigir:

1. Movimentação automática de lotes comprados para a fase correta.
2. Registro de vacinação usando vacinas cadastradas no estoque.
3. Correções na aba de matrizes.
4. Correções na aba de gestação.
5. Correções na aba de maternidade.
6. Registro correto de histórico operacional.

---

# 1. Cadastro de Leitões / Lotes Comprados

## Problema identificado

Ao cadastrar um lote de leitões comprados, o sistema registra o lote, mas ele não aparece automaticamente na fase produtiva correta.

Exemplo informado pelo cliente:

- Produtor compra 20 leitões.
- Origem: comprado.
- Categoria/fase: leitão.
- O sistema cadastra o lote, mas ele não aparece na aba Creche.

## Regra de negócio esperada

No cadastro de lote/animal comprado, deve existir um campo obrigatório chamado `fase_atual` ou equivalente.

Opções mínimas:

- `LEITAO`
- `CRESCIMENTO`
- `TERMINACAO`
- `ENGORDA`

Mapeamento esperado:

| Fase selecionada no cadastro | Aba/módulo de destino |
|---|---|
| Leitão | Creche |
| Crescimento | Crescimento |
| Terminação | Engorda |
| Engorda | Engorda |

## Ajuste no Backend — Django

### Model / Campo sugerido

Adicionar ou validar a existência de um campo semelhante a:

```python
fase_atual = models.CharField(
    max_length=30,
    choices=FaseAtualChoices.choices,
)
```

Choices sugeridas:

```python
class FaseAtualChoices(models.TextChoices):
    LEITAO = "LEITAO", "Leitão"
    CRESCIMENTO = "CRESCIMENTO", "Crescimento"
    TERMINACAO = "TERMINACAO", "Terminação"
    ENGORDA = "ENGORDA", "Engorda"
```

## Comportamento esperado na criação

Ao criar um lote comprado:

1. Salvar os dados básicos do lote.
2. Verificar o valor de `fase_atual`.
3. Criar ou vincular automaticamente o lote à entidade/tabela correspondente da fase.
4. Garantir que o lote apareça na listagem da aba correta.

## Endpoint sugerido

```http
POST /api/lotes/
```

Payload esperado:

```json
{
  "codigo_lote": "90",
  "quantidade": 20,
  "linhagem": "Duroc",
  "sexo": "Misto",
  "origem": "COMPRADO",
  "data_nascimento": "2026-04-01",
  "data_compra": "2026-05-22",
  "peso_medio": 20.0,
  "valor_unitario": 200.0,
  "fornecedor": "Nome do fornecedor",
  "fase_atual": "LEITAO"
}
```

## Ajuste no Frontend — Next.js

No formulário de cadastro, adicionar um `select` obrigatório para fase atual:

- Leitão
- Crescimento
- Terminação
- Engorda

O campo deve ser exibido principalmente quando `origem = COMPRADO`.

## Critérios de aceite

- Ao cadastrar lote comprado como `LEITAO`, ele deve aparecer na aba Creche.
- Ao cadastrar como `CRESCIMENTO`, deve aparecer na aba Crescimento.
- Ao cadastrar como `TERMINACAO` ou `ENGORDA`, deve aparecer na aba Engorda.
- O sistema não deve permitir cadastro de lote comprado sem fase atual.
- O histórico do lote deve registrar a fase inicial.

## Prioridade

Alta

---

# 2. Registro de Vacinação com Integração ao Estoque

## Problema identificado

Na fase de marrãs/fase produtiva, o registro de vacinação funciona, porém o campo de vacina permite digitação livre.

Isso pode gerar erro de digitação e inconsistência nos dados.

## Regra de negócio esperada

O usuário só deve conseguir registrar vacinação selecionando uma vacina previamente cadastrada no estoque.

## Ajuste no Backend — Django

O registro de vacinação deve possuir relação com o item de estoque.

Exemplo sugerido:

```python
vacina = models.ForeignKey(
    EstoqueItem,
    on_delete=models.PROTECT,
    related_name="vacinacoes",
)
```

Regras:

- Listar somente itens do estoque do tipo vacina.
- Opcionalmente, listar apenas itens com saldo disponível.
- Ao registrar vacinação, validar se a vacina existe.
- Caso exista controle de quantidade, baixar o saldo do estoque conforme dose/quantidade.

## Endpoint sugerido para listar vacinas

```http
GET /api/estoque/vacinas/
```

Resposta esperada:

```json
[
  {
    "id": 1,
    "nome": "Vacina X",
    "saldo": 10,
    "unidade": "ml"
  }
]
```

## Endpoint sugerido para registrar vacinação

```http
POST /api/vacinacoes/
```

Payload esperado:

```json
{
  "animal_id": 10,
  "vacina_id": 1,
  "data": "2026-05-22",
  "dosagem": "2 ml",
  "observacao": "Aplicação preventiva"
}
```

## Ajuste no Frontend — Next.js

Substituir campo de texto livre por `select`, `combobox` ou autocomplete.

O campo deve:

- Buscar vacinas do endpoint `/api/estoque/vacinas/`.
- Exibir nome da vacina.
- Salvar o `id` da vacina.
- Impedir envio se nenhuma vacina for selecionada.

## Critérios de aceite

- O usuário não deve conseguir digitar manualmente o nome da vacina.
- O usuário deve selecionar uma vacina cadastrada no estoque.
- O registro deve aparecer no histórico do animal/matriz/lote.
- Caso não existam vacinas cadastradas, exibir mensagem orientando cadastrar no estoque.

## Prioridade

Alta

---

# 3. Aba de Matrizes

## Funcionalidades validadas como funcionando

- Registrar cobertura
- Diagnóstico

## Funcionalidades com problema

- Descartar matriz / remover do plantel
- Histórico da matriz
- Botão superior de registrar cobertura após retorno da matriz ao ciclo

---

## 3.1. Corrigir Descarte de Matriz

## Problema identificado

A ação de descartar/remover matriz do plantel não está funcionando.

O cliente deseja usar essa função quando a matriz estiver velha, for vendida ou removida do plantel.

## Regra de negócio esperada

Ao descartar uma matriz:

1. Registrar os dados do descarte.
2. Alterar status da matriz para inativa/descartada.
3. Remover a matriz das listagens de plantel ativo.
4. Manter a matriz acessível no histórico/relatórios.

## Campos mínimos do descarte

- Data do descarte
- Motivo do descarte
- Peso da matriz
- Valor de venda
- Tipo de descarte
- Observações

Tipos sugeridos:

- `VENDA`
- `MORTE`
- `DESCARTE_SANITARIO`
- `BAIXA_PRODUTIVA`
- `OUTRO`

## Endpoint sugerido

```http
POST /api/matrizes/{id}/descartar/
```

Payload esperado:

```json
{
  "data_descarte": "2026-05-22",
  "motivo": "Matriz velha",
  "peso": 180.5,
  "valor_venda": 1500.0,
  "tipo_descarte": "VENDA",
  "observacao": "Vendida após fim do ciclo produtivo"
}
```

## Critérios de aceite

- A matriz descartada não deve aparecer no plantel ativo.
- O descarte deve aparecer no histórico da matriz.
- O sistema deve manter os dados anteriores da matriz.
- O sistema não deve excluir fisicamente a matriz do banco.

## Prioridade

Alta

---

## 3.2. Corrigir Histórico da Matriz

## Problema identificado

A opção de histórico da matriz não está funcionando.

## Regra de negócio esperada

Ao clicar em histórico, o sistema deve exibir todos os eventos da matriz em ordem cronológica.

## Eventos que devem aparecer no histórico

- Cadastro da matriz
- Pesagens
- Vacinações
- Coberturas
- Diagnósticos
- Gestações
- Partos
- Perdas
- Abortos
- Retorno de cio
- Maternidade
- Desmames
- Mortalidades vinculadas
- Descarte

## Endpoint sugerido

```http
GET /api/matrizes/{id}/historico/
```

Resposta esperada:

```json
[
  {
    "data": "2026-05-22",
    "tipo": "COBERTURA",
    "descricao": "Cobertura registrada com reprodutor X",
    "metadata": {
      "metodo": "Natural",
      "reprodutor_id": 5
    }
  }
]
```

## Ajuste no Frontend — Next.js

Criar ou corrigir modal/página de histórico.

A interface deve exibir:

- Data
- Tipo do evento
- Descrição
- Dados adicionais quando existirem

## Critérios de aceite

- O botão de histórico deve abrir corretamente.
- O histórico deve carregar sem erro.
- Os eventos devem aparecer em ordem cronológica, preferencialmente do mais recente para o mais antigo.
- Eventos de descarte, perda e maternidade devem ser incluídos.

## Prioridade

Alta

---

## 3.3. Corrigir Botão Superior de Registrar Cobertura

## Problema identificado

Na aba de matrizes, existe um problema no botão superior de registrar cobertura.

Quando a matriz já passou por gestação e maternidade e retornou para a aba de matrizes, a ação individual de registrar cobertura funciona, mas o botão superior não executa corretamente o fluxo.

## Regra de negócio esperada

O botão superior deve ter o mesmo comportamento da ação individual do card/lista da matriz.

## Fluxo esperado

1. Usuário seleciona uma matriz disponível.
2. Clica em registrar cobertura.
3. Modal é aberto com a matriz já selecionada.
4. Usuário seleciona reprodutor e método de cobertura.
5. Confirma.
6. Matriz muda para status de gestação.
7. Matriz aparece na aba Gestação.

## Critérios de aceite

- Botão superior deve abrir modal corretamente.
- Matriz selecionada deve ser carregada no modal.
- Após confirmação, a cobertura deve ser salva.
- A matriz deve ir para gestação.
- O comportamento deve ser igual ao botão individual.

## Prioridade

Alta

---

# 4. Aba de Gestação

## Funcionalidades validadas como funcionando

- Confirmar parto
- Registrar vacinação
- Opção inferior de aborto/reabsorção

## Funcionalidade com problema

- Registrar perda

## Problema identificado

O botão de registrar perda não está funcionando corretamente.

O cliente explicou que a perda representa principalmente:

- Retorno de cio
- Aborto
- Reabsorção

## Regra de negócio esperada

Ao registrar uma perda:

1. Encerrar a gestação ativa.
2. Registrar o tipo de perda.
3. Atualizar o status da matriz.
4. Retornar a matriz para a fase/status adequado.
5. Registrar o evento no histórico da matriz.

## Tipos de perda sugeridos

- `RETORNO_CIO`
- `ABORTO`
- `REABSORCAO`
- `OUTRO`

## Endpoint sugerido

```http
POST /api/gestacoes/{id}/registrar-perda/
```

Payload esperado:

```json
{
  "data": "2026-05-22",
  "tipo_perda": "ABORTO",
  "observacao": "Perda registrada durante acompanhamento"
}
```

## Comportamento esperado

Para `RETORNO_CIO` ou `REABSORCAO`:

- Encerrar gestação.
- Retornar matriz para status de aguardando cobertura ou disponível.

Para `ABORTO`:

- Encerrar gestação.
- Retornar matriz para status definido pela regra atual do sistema.
- Registrar evento no histórico.

## Critérios de aceite

- A perda deve ser salva com data, tipo e observação.
- A gestação deve deixar de aparecer como ativa.
- A matriz deve ser atualizada para o status correto.
- O evento deve aparecer no histórico da matriz.
- O botão deve funcionar sem erro no frontend.

## Prioridade

Alta

---

# 5. Aba de Maternidade

## Funcionalidade validada como funcionando

- Confirmar desmame

## Funcionalidades com problema ou dúvida

- Registrar manejo
- Registrar mortalidade
- Registrar pesagem

---

## 5.1. Registrar Mortalidade

## Problema identificado

O botão de registrar mortalidade não está funcionando.

## Regra de negócio esperada

O sistema deve permitir registrar mortalidade de leitões vinculados a uma matriz/leitegada na maternidade.

## Campos mínimos

- Data
- Quantidade de leitões mortos
- Causa provável
- Observação
- Matriz vinculada
- Leitegada/lote vinculado

Causas sugeridas:

- `ESMAGAMENTO`
- `NATIMORTO`
- `FRACO`
- `DOENCA`
- `DESCONHECIDA`
- `OUTRA`

## Endpoint sugerido

```http
POST /api/maternidade/{id}/registrar-mortalidade/
```

Payload esperado:

```json
{
  "data": "2026-05-22",
  "quantidade": 2,
  "causa": "ESMAGAMENTO",
  "observacao": "Mortalidade registrada no manejo diário"
}
```

## Comportamento esperado

Ao registrar mortalidade:

1. Reduzir a quantidade de leitões vivos.
2. Manter a quantidade original de nascidos no histórico.
3. Registrar evento no histórico da matriz/leitegada.
4. Impedir mortalidade maior que a quantidade de leitões vivos.

## Critérios de aceite

- O sistema deve validar a quantidade informada.
- A quantidade de leitões vivos deve ser atualizada.
- O evento deve aparecer no histórico.
- A quantidade inicial de nascidos não deve ser sobrescrita.

## Prioridade

Alta

---

## 5.2. Registrar Manejo / Procedimento

## Problema identificado

O cliente não tem certeza sobre o uso atual da função “registrar manejo”.

Foi sugerido que esse botão pode ser usado para registrar procedimentos da maternidade, como transferência de leitões.

## Recomendação

Renomear a ação de:

```text
Registrar manejo
```

Para:

```text
Registrar procedimento / manejo
```

## Tipos de procedimento sugeridos

- `TRANSFERENCIA_LEITAO`
- `ADOCAO_ENXERTIA`
- `APLICACAO_FERRO`
- `CORTE_DENTE`
- `CORTE_CAUDA`
- `CASTRACAO`
- `SEPARACAO_LEITAO_FRACO`
- `OBSERVACAO_GERAL`

## Endpoint sugerido

```http
POST /api/maternidade/{id}/registrar-procedimento/
```

Payload esperado:

```json
{
  "data": "2026-05-22",
  "tipo": "TRANSFERENCIA_LEITAO",
  "quantidade": 3,
  "destino_matriz_id": 12,
  "observacao": "Transferência de leitões para equalização de leitegada"
}
```

## Regra específica para transferência de leitão

Quando o tipo for `TRANSFERENCIA_LEITAO`:

1. Validar se a quantidade existe na leitegada de origem.
2. Reduzir a quantidade de leitões vivos na origem.
3. Aumentar a quantidade de leitões vivos na matriz/leitegada de destino.
4. Registrar histórico nas duas matrizes/leitegadas.

## Critérios de aceite

- O botão deve abrir modal corretamente.
- O usuário deve conseguir escolher o tipo de procedimento.
- Transferências devem atualizar origem e destino.
- Procedimentos devem aparecer no histórico.
- Caso o procedimento não envolva quantidade, o campo quantidade pode ser opcional.

## Prioridade

Média

---

## 5.3. Registrar Pesagem na Maternidade

## Situação identificada

O cliente informou que registrar pesagem na maternidade não é tão necessário, mas pode permanecer.

## Recomendação

Manter funcionalidade como secundária.

## Critérios de aceite

- Se já estiver funcionando, manter.
- Se não estiver funcionando, corrigir apenas após os itens de prioridade alta.
- Registrar pesagem no histórico quando utilizada.

## Prioridade

Baixa

---

# 6. Histórico Operacional Global

## Requisito transversal

Todas as ações relevantes devem gerar histórico.

## Eventos que obrigatoriamente devem gerar histórico

- Cadastro de lote
- Entrada em fase produtiva
- Pesagem
- Vacinação
- Cobertura
- Diagnóstico
- Confirmação de parto
- Perda na gestação
- Mortalidade
- Procedimento/manejo
- Desmame
- Transferência de leitões
- Descarte de matriz

## Estrutura sugerida de histórico

Caso o sistema ainda não tenha uma estrutura unificada, criar um modelo genérico:

```python
class HistoricoEvento(models.Model):
    tipo = models.CharField(max_length=50)
    descricao = models.TextField()
    data_evento = models.DateField()
    matriz = models.ForeignKey("Matriz", null=True, blank=True, on_delete=models.CASCADE)
    lote = models.ForeignKey("Lote", null=True, blank=True, on_delete=models.CASCADE)
    animal = models.ForeignKey("Animal", null=True, blank=True, on_delete=models.CASCADE)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
```

## Observação técnica

A implementação deve respeitar a estrutura atual do projeto. Caso já exista um modelo de histórico, reaproveitar o modelo existente em vez de criar outro.

---

# 7. Ordem Recomendada de Implementação

### Fase 1: Correções críticas de fluxo (Matrizes)
- [x] Aba de Matrizes: O modal de Descartar Matriz não abre/funciona, e precisa registrar no histórico.
- [x] Aba de Matrizes: O Histórico de eventos da matriz está vazio ou não atualiza (necessita modelo centralizado `HistoricoEvento`).
- [x] Aba de Matrizes: O botão superior "Registrar Cobertura" não funciona adequadamente (abre modal vazio).
- [x] Aba de Gestação: Adicionar action "Registrar Perda" (Aborto/Reabsorção) para retornar a matriz ao plantel de vazias.
- [x] Aba de Maternidade: Adicionar action "Registrar Mortalidade" (reduzir leitões vivos) e "Registrar Procedimento / Manejo" (ex: corte de cauda, ferro).

## Fase 2 — Movimentação automática de lotes comprados

Implementar:

1. Campo de fase atual no cadastro.
2. Regra automática de envio para Creche, Crescimento ou Engorda.
3. Validação visual nas abas correspondentes.

## Fase 3 — Integração vacinação x estoque

Implementar:

1. Endpoint para listar vacinas do estoque.
2. Select/autocomplete no frontend.
3. Validação no backend.
4. Registro no histórico.
5. Opcional: baixa de estoque.

## Fase 4 — Melhorias de maternidade

Implementar:

1. Renomear registrar manejo para registrar procedimento/manejo.
2. Criar tipos de procedimento.
3. Implementar transferência de leitão.
4. Ajustar histórico de origem e destino.

## Fase 5 — Refinamento e testes

Implementar:

1. Testes de fluxo completo.
2. Ajustes de UI.
3. Mensagens de erro amigáveis.
4. Validação de permissões, se aplicável.

---

# 8. Checklist de Testes Funcionais

## Cadastro de lote comprado

- [ ] Cadastrar lote comprado como Leitão.
- [ ] Validar se aparece na Creche.
- [ ] Cadastrar lote comprado como Crescimento.
- [ ] Validar se aparece em Crescimento.
- [ ] Cadastrar lote comprado como Terminação/Engorda.
- [ ] Validar se aparece em Engorda.
- [ ] Tentar cadastrar sem fase atual.
- [ ] Validar bloqueio do cadastro.

## Vacinação

- [ ] Cadastrar vacina no estoque.
- [ ] Abrir registrar vacinação.
- [ ] Validar se vacina aparece no select.
- [ ] Registrar vacinação.
- [ ] Validar histórico.
- [ ] Testar cenário sem vacina cadastrada.

## Matrizes

- [ ] Registrar cobertura por ação individual.
- [ ] Registrar cobertura por botão superior.
- [ ] Validar envio para gestação.
- [ ] Descartar matriz.
- [ ] Validar remoção do plantel ativo.
- [ ] Validar histórico da matriz.

## Gestação

- [ ] Registrar perda por retorno de cio.
- [ ] Registrar perda por aborto.
- [ ] Registrar perda por reabsorção.
- [ ] Validar encerramento da gestação.
- [ ] Validar retorno/status da matriz.
- [ ] Validar histórico.

## Maternidade

- [ ] Registrar mortalidade.
- [ ] Validar redução de leitões vivos.
- [ ] Validar bloqueio se quantidade for maior que vivos.
- [ ] Registrar procedimento geral.
- [ ] Registrar transferência de leitões.
- [ ] Validar origem e destino.
- [ ] Confirmar desmame.
- [ ] Validar histórico.

---

# 9. Regras de UI/UX

## Formulários

- Usar modal para ações rápidas.
- Usar select/autocomplete para campos com dados cadastrados.
- Evitar campos livres quando houver cadastro relacionado.
- Exibir mensagens claras de sucesso e erro.
- Manter layout simples para uso em campo.

## Mensagens sugeridas

### Sem vacina no estoque

```text
Nenhuma vacina cadastrada no estoque. Cadastre uma vacina antes de registrar a vacinação.
```

### Lote cadastrado com sucesso

```text
Lote cadastrado com sucesso e enviado para a fase correspondente.
```

### Mortalidade inválida

```text
A quantidade de mortalidade não pode ser maior que a quantidade de leitões vivos.
```

### Matriz descartada

```text
Matriz descartada com sucesso e removida do plantel ativo.
```

---

# 10. Observações para o Agente de IA

## Antes de implementar

1. Inspecionar os models existentes.
2. Identificar nomes reais das entidades.
3. Não duplicar models se já existirem estruturas equivalentes.
4. Reaproveitar serializers, services e views existentes quando possível.
5. Manter o padrão atual do projeto.
6. Garantir compatibilidade com os fluxos já funcionando.

## Backend

Priorizar:

- Services para regras de negócio.
- Serializers com validação clara.
- ViewSets/actions para operações específicas.
- Transações atômicas em operações que alteram mais de uma entidade.

Exemplo:

```python
from django.db import transaction

with transaction.atomic():
    # salvar evento principal
    # atualizar status
    # registrar histórico
```

## Frontend

Priorizar:

- Componentes reutilizáveis.
- Modais consistentes.
- Feedback visual após ações.
- Atualização da listagem após submit.
- Validações antes do envio.
- Tratamento de erro vindo da API.

## Padrão recomendado para mutations

Após uma ação bem-sucedida:

1. Fechar modal.
2. Exibir toast de sucesso.
3. Recarregar a lista da aba atual.
4. Se o item mudou de fase, ele deve sumir da aba atual e aparecer na aba de destino.

---

# 11. Definition of Done

Uma funcionalidade será considerada concluída quando:

- Backend implementado.
- Frontend integrado.
- Validações funcionando.
- Histórico sendo registrado.
- Fluxo testado manualmente.
- Erros tratados com mensagens claras.
- Funcionalidade validada na tela correta.
- Não houver quebra nas funções que o cliente já aprovou.

---

# 12. Resumo Executivo

As atualizações mais importantes são:

1. Fazer o lote comprado entrar automaticamente na fase correta.
2. Impedir digitação livre de vacina e integrar com estoque.
3. Corrigir descarte e histórico da matriz.
4. Corrigir registro de perda na gestação.
5. Corrigir mortalidade na maternidade.
6. Padronizar ações importantes para gerar histórico.
7. Melhorar a maternidade com procedimentos/manejo e transferência de leitões.

A implementação deve priorizar primeiro os fluxos quebrados, depois as melhorias de experiência e organização.
