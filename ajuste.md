AJUSTES NECESSÁRIOS NA FICHA DE CONTROLE DE LOTE
Analisei a ficha de lote e encontrei alguns pontos que precisam ser corrigidos.
Atualmente o sistema está preenchendo diversos campos com informações genéricas ou aleatórias, quando o correto seria puxar as informações reais do histórico do lote.
1. ORIGEM DO LOTE
O lote apresentado na ficha é oriundo da matriz TN6060.
Porém o sistema está informando:
Matriz: 040
Pai: ANDRE
Essas informações estão incorretas.
Correção necessária:
O sistema deve puxar automaticamente:
Número da matriz que originou o lote
Reprodutor utilizado na cobertura/inseminação
Raça do lote
Data de nascimento
Peso médio ao nascimento
Nascidos vivos
Natimortos
Mumificados
Todas essas informações já existem no histórico do parto registrado na maternidade.
A ficha não deve utilizar informações fictícias ou padrão.
2. IDADE DO LOTE
A idade está incorreta.
Correção necessária:
A idade deve ser calculada automaticamente através da:
Data Atual - Data de Nascimento
A idade deve ser atualizada diariamente.
3. RAÇA DO LOTE
A raça não deve ser digitada manualmente.
Correção necessária:
A raça deve ser herdada automaticamente da origem genética cadastrada na matriz e no reprodutor.
4. CONSUMO DE RAÇÃO
O sistema está exibindo consumo de ração que nunca foi lançado.
Atualmente aparecem:
Pré-inicial
Inicial
Crescimento
Mesmo sem existir lançamento real no sistema.
Correção necessária:
A tabela de consumo de ração deve permanecer vazia até existir um lançamento real.
Somente após o usuário lançar consumo de ração o sistema deve preencher:
Tipo de ração
Quantidade consumida
Custo
Consumo por animal
Não pode existir informação simulada.
5. MORTALIDADE
O sistema está exibindo mortes que não aconteceram.
Neste lote não houve nenhuma morte registrada.
Correção necessária:
A tabela de mortalidade deve puxar exclusivamente os registros reais cadastrados.
Caso não exista nenhuma morte registrada, mostrar:
"Sem registros de mortalidade."
6. GPD
O GPD exibido não está correto.
Correção necessária:
O GPD deve ser calculado automaticamente utilizando:
(Peso Atual - Peso Inicial) ÷ Dias da Fase
Sempre utilizando os pesos reais registrados no sistema.
7. CONVERSÃO ALIMENTAR
A conversão alimentar não deve ser preenchida com dados fictícios.
Correção necessária:
Somente calcular quando existir:
Consumo de ração registrado
Peso registrado
Fórmula:
Consumo de Ração ÷ Ganho de Peso
Sem esses dados a conversão deve permanecer vazia.
8. PESO MÉDIO
O peso médio atual deve ser atualizado conforme as pesagens realizadas pelo usuário.
Se não existir pesagem registrada:
Exibir apenas o último peso válido disponível.
9. DESEMPENHO GERAL
Atualmente o sistema está classificando:
"BOM DESEMPENHO"
Sem possuir dados suficientes para essa análise.
Correção necessária:
A classificação deve ser baseada nos indicadores reais:
GPD
Conversão alimentar
Mortalidade
Peso médio
Sem esses dados o sistema não deve gerar avaliação automática.
10. REGRA PRINCIPAL DA FICHA
A ficha do lote deve funcionar como um espelho do histórico do lote.
Tudo que aparecer nela deve vir dos lançamentos realizados pelo usuário nas fases anteriores:
Maternidade
Creche
Crescimento
Engorda
O sistema não deve preencher informações automáticas fictícias para simular dados.
Atualmente o único dado correto na ficha é:
Quantidade desmamada: 16 leitões
Todos os demais dados devem ser revisados para utilizar informações reais do histórico do lote.

Importante
A ficha do lote não deve criar nomes automáticos de ração.
Ela deve mostrar exatamente os nomes cadastrados e utilizados pelo produtor.
Dessa forma o sistema se adapta a qualquer programa nutricional e não obriga todos os produtores a trabalharem com o mesmo padrão de alimentação.
