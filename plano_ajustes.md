# PROMPT PARA IMPLEMENTAÇÃO DA INTERFACE APRESENTADA NO VÍDEO

Você deverá analisar completamente o projeto existente e implementar uma interface administrativa semelhante à apresentada no vídeo de referência.

## Objetivo

Criar uma área administrativa moderna para gerenciamento de apostas, mantendo o padrão visual e estrutural do sistema existente.

A implementação deve parecer uma evolução natural do projeto, sem mudanças bruscas na identidade visual.

---

## Estrutura Geral

A interface deve possuir:

* Cabeçalho superior
* Menu lateral responsivo
* Área central de conteúdo
* Cards informativos
* Tabelas organizadas
* Botões de ação
* Campos de pesquisa
* Filtros rápidos
* Paginação
* Mensagens de sucesso e erro
* Feedback visual durante carregamentos

---

## Layout

O layout deve ser limpo e organizado.

Utilizar espaçamento consistente.

Manter boa hierarquia visual.

Elementos alinhados.

Bordas suaves.

Sombras discretas.

Componentes reutilizáveis.

Interface responsiva.

---

## Dashboard

Criar um painel contendo:

Quantidade total de registros.

Quantidade ativa.

Quantidade inativa.

Últimas movimentações.

Resumo das operações.

Indicadores rápidos.

---

## Área de Consulta

Implementar uma tabela contendo:

ID

Número

Descrição

Status

Data

Usuário

Categoria

Ações

A tabela deve permitir:

Pesquisa instantânea.

Ordenação.

Filtros.

Paginação.

Atualização dinâmica.

---

## Sistema de Busca

Adicionar busca em tempo real.

Permitir pesquisa por:

Número

Nome

Descrição

Código

Categoria

Status

Data

Sem necessidade de recarregar a página.

---

## Cadastro

Criar formulário contendo:

Campos obrigatórios.

Campos opcionais.

Validação automática.

Mensagens de erro.

Campos mascarados quando necessário.

Salvar via AJAX quando possível.

---

## Edição

Permitir edição rápida.

Carregar dados existentes.

Manter histórico.

Atualizar apenas campos alterados.

Evitar perda de dados.

---

## Exclusão

Solicitar confirmação.

Exibir modal.

Informar impacto.

Executar exclusão segura.

Atualizar lista automaticamente.

---

## Interface

Botões padronizados.

Ícones consistentes.

Espaçamentos uniformes.

Mesma tipografia.

Mesmo estilo visual do restante do projeto.

---

## Componentes

Criar componentes reutilizáveis para:

Tabela

Modal

Botão

Input

Select

Checkbox

Badge

Alert

Toast

Loader

Card

Paginação

---

## Backend

Criar endpoints REST seguindo o padrão existente.

Implementar:

GET

POST

PUT

DELETE

Validação de entrada.

Tratamento de erros.

Retornos padronizados.

---

## Banco de Dados

Caso necessário:

Criar migrations.

Criar índices.

Preservar dados existentes.

Evitar consultas lentas.

---

## Segurança

Validar permissões.

Validar autenticação.

Sanitizar entradas.

Evitar SQL Injection.

Evitar XSS.

Evitar CSRF.

Validar uploads.

Validar parâmetros.

---

## Performance

Usar paginação.

Lazy Loading quando possível.

Evitar consultas repetidas.

Evitar renderizações desnecessárias.

Cache onde fizer sentido.

---

## UX

Toda ação deve gerar retorno visual.

Salvar:

Exibir confirmação.

Excluir:

Solicitar confirmação.

Erro:

Exibir mensagem clara.

Carregamento:

Mostrar indicador visual.

---

## Responsividade

Compatível com:

Desktop

Notebook

Tablet

Celular

---

## Código

Seguir exatamente o padrão existente do projeto.

Não criar código duplicado.

Reutilizar funções existentes.

Reutilizar componentes existentes.

Reutilizar serviços existentes.

Manter organização atual das pastas.

---

## Validação Final

Antes de concluir:

Verificar funcionamento completo.

Testar CRUD.

Testar filtros.

Testar pesquisa.

Testar paginação.

Testar permissões.

Testar integração backend/frontend.

Testar erros.

Testar responsividade.

---

## Entrega

Ao finalizar apresentar:

Resumo das alterações.

Arquivos modificados.

Arquivos criados.

Arquivos removidos.

Explicação técnica.

Possíveis impactos.

Melhorias futuras.

Instruções para testes.

Nunca implemente alterações sem primeiro compreender completamente a arquitetura existente do projeto.
