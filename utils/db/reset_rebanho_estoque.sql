-- ==============================================================================
-- SCRIPT PARA ZERAR REBANHOS E ESTOQUE (PostgreSQL / SQLite)
-- ==============================================================================
-- Este script remove os registros transacionais e cadastros de animais,
-- zerando os saldos de estoque e esvaziando o rebanho atual da plataforma.
--
-- ATENÇÃO:
-- 1. Faça um backup do banco de dados antes de executar este script.
-- 2. O script executa comandos DELETE na ordem correta para respeitar
--    as restrições de chaves estrangeiras (Foreign Keys).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. LIMPEZA DO REBANHO (Livestock)
-- ------------------------------------------------------------------------------

-- Passo 1.1: Limpar os registros e históricos sanitários, de peso e alimentação
DELETE FROM livestock_vaccinationrecord;
DELETE FROM livestock_weightrecord;
DELETE FROM livestock_healthrecord;
DELETE FROM livestock_feedingrecord;

-- Passo 1.2: Limpar os eventos reprodutivos (ordem reversa de criação)
DELETE FROM livestock_litter;
DELETE FROM livestock_birth;
DELETE FROM livestock_pregnancy;
DELETE FROM livestock_mating;

-- Passo 1.3: Limpar as incubações de aves
DELETE FROM livestock_incubation;

-- Passo 1.4: Quebrar as dependências circulares entre Animal e Lote (AnimalBatch)
-- Para evitar "Foreign Key constraint failed" ao deletar
UPDATE livestock_animalbatch SET mother_id = NULL;
UPDATE livestock_animal SET batch_id = NULL, sire_ref_id = NULL, dam_ref_id = NULL;

-- Passo 1.5: Apagar os cadastros dos animais e lotes de animais
DELETE FROM livestock_animal;
DELETE FROM livestock_animalbatch;

-- Opcional: Para apagar também as espécies e raças cadastradas, descomente:
-- DELETE FROM livestock_breed;
-- DELETE FROM livestock_species;


-- ------------------------------------------------------------------------------
-- 2. LIMPEZA DO ESTOQUE (Inventory)
-- ------------------------------------------------------------------------------
-- Esta etapa apaga o saldo dos lotes e o histórico de movimentações,
-- mas MANTÉM os itens de estoque (ItemEstoque) e Fornecedores cadastrados.

-- Passo 2.1: Limpar consumos de ração
DELETE FROM inventory_consumoracao;

-- Passo 2.2: Limpar produções de ração concluídas/em andamento
DELETE FROM inventory_producaoracao;

-- Passo 2.3: Limpar alertas gerados pelo sistema
DELETE FROM inventory_alertaestoque;

-- Passo 2.4: Limpar todo o histórico de entradas e saídas
DELETE FROM inventory_movimentacaoestoque;

-- Passo 2.5: Apagar os lotes de estoque, o que efetivamente "zera" o saldo.
DELETE FROM inventory_loteestoque;

-- Opcional: Se quiser zerar também as formulações de ração, descomente:
-- DELETE FROM inventory_formulaingrediente;
-- DELETE FROM inventory_formularacao;

-- Opcional: Se quiser apagar TUDO, incluindo o cadastro base de itens e fornecedores:
DELETE FROM inventory_formulaingrediente;
DELETE FROM inventory_formularacao;
DELETE FROM inventory_itemestoque;
DELETE FROM inventory_fornecedorcontato;
DELETE FROM inventory_fornecedorendereco;
DELETE FROM inventory_fornecedor;

UPDATE inventory_itemestoque SET estoque_minimo = 0;
