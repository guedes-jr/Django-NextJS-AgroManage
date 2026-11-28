# Plano de implementação do AgroManage

Este plano acompanha permissões de envio, integrações, backups externos, pagamentos, o primeiro acesso da organização, o fechamento gerencial mensal e o trabalho sem conexão. O progresso considera a árvore de trabalho local.

- `[x]` identifica uma entrega já implementada ou uma verificação concluída.
- `[ ]` identifica uma decisão, implementação, teste, homologação ou publicação pendente.
- Considere um item principal concluído quando todas as suas subtarefas e critérios de aceite estiverem marcados.

## 1. Restringir os destinatários de WhatsApp e Telegram

- [ ] Aplicar a mesma regra de elegibilidade ao WhatsApp e ao Telegram.
  - [ ] Permitir o recebimento por **Administrador**, **Gerente** e **Veterinário**. Impedir o recebimento por Operador.
  - [ ] Confirmar se a restrição vale também para campanhas e comunicados administrativos. Registrar as categorias cobertas antes de alterar o processamento.
  - [ ] Para o Veterinário, exigir acesso à organização e ao evento de origem, respeitando o escopo do cargo, os segmentos e as permissões atuais.
  - [ ] Exigir consentimento, preferência ativa, categoria habilitada e destino válido. Para Telegram, conferir o vínculo com o bot e a verificação do número quando houver telefone selecionado.
  - [ ] Usar uma única regra no backend para informar a disponibilidade do canal, agendar e decidir o envio. Expor a mesma disponibilidade em Web e Mobile.
  - [ ] Reavaliar entregas pendentes antes do envio. Registrar como ignorada a entrega que perdeu elegibilidade por troca de cargo, revogação ou perda de acesso.
  - [ ] Testar os quatro cargos nos dois canais, incluindo alteração de cargo após agendamento, veterinário sem acesso à origem, revogação do consentimento e isolamento entre organizações.
  - [ ] **Aceite.** Uma entrega elegível é enviada uma vez. Em todos os cenários bloqueados, o provedor recebe zero chamadas e o motivo fica disponível para auditoria.

## 2. Padronizar a estrutura das integrações

- [ ] Definir contratos por finalidade.
  - [ ] **Mensageria.** WhatsApp e Telegram, com SMS disponível como futura modalidade de mensagens de texto.
  - [ ] **E-mail.** SMTP e espaço para provedores de e-mail por API.
  - [ ] **Pagamentos.** Asaas, Efí/Gerencianet e futuros gateways.
  - [ ] **Armazenamento e backup.** Google Drive, MEGA e futuros destinos que implementem o contrato de armazenamento.
- [ ] Separar canal, provedor e configuração.
  - [ ] Manter WhatsApp como canal. Usar WPPConnect e Meta Cloud API como provedores do mesmo canal.
  - [ ] Manter a seleção do destinatário e a política de envio fora do adaptador. Padronizar resultados de envio, cobrança e armazenamento dentro de seus respectivos contratos.
  - [ ] Definir se remetentes e credenciais começam sob administração da plataforma ou por organização. Identificar as permissões para consultar, editar, testar, ativar e desativar.
  - [ ] Separar homologação e produção. Guardar segredos no backend e mascará-los em respostas, auditoria e logs.
  - [ ] Definir o registro de cada operação, com identificador interno, resultado, data, provedor e referência externa quando disponível. Tratar duplicidades e respostas incertas conforme a operação.
  - [ ] Publicar contratos tipados e estados de configuração para Web e Mobile. Usar os mesmos controles de acesso nos dois clientes.
  - [ ] **Aceite.** Trocar o provedor do WhatsApp em homologação preserva contatos, preferências, consentimentos e regras de destinatário.

## 3. Concluir as notificações pelo Telegram

- [ ] Completar o fluxo e homologar com um bot real.
  - [x] Implementar vínculo por link de uso único, confirmação no AgroManage, revogação na conta e comando `/stop` no bot.
  - [x] Integrar vínculo e preferências de Telegram em Web e Mobile.
  - [x] Adicionar Telegram aos contatos institucionais e permitir vários contatos pessoais, com um destino por canal. Um telefone pode receber WhatsApp e Telegram.
  - [x] Validar o telefone escolhido pelo compartilhamento do próprio contato no chat privado com o bot.
  - [x] Implementar o envio piloto de alertas de reprodução e vacinação, com fila separada do WhatsApp, tratamento de limite do provedor e suspensão de reenvio automático quando o resultado for incerto.
  - [x] Expor na API administrativa a política de Telegram para alertas de ciclo animal.
  - [ ] Aplicar a regra de cargos da seção 1 e validar Veterinário com acesso ao evento.
  - [ ] Adicionar Telegram aos lembretes da agenda. Preservar a escolha do canal, o horário, o fuso, a edição e o cancelamento em Web e Mobile.
  - [ ] Disponibilizar controles e acompanhamento de entregas nos fluxos administrativos de Web e Mobile.
  - [ ] Configurar bot e webhook em homologação. Testar telefone correto, telefone divergente, troca de contato, cancelamento de lembrete e revogação.
  - [ ] **Aceite.** O mesmo usuário recebe um alerta e um lembrete no Telegram e pode continuar recebendo pelo WhatsApp no mesmo telefone, conforme as preferências.
  - [ ] Aplicar migrações e liberar para organizações piloto após a homologação. Conferir entregas, falhas e itens pendentes antes de ampliar.
  - Referências do projeto. [Roadmap do Telegram](docs/planning/roadmap.md) e [contrato da API](docs/ai/api.md).

## 4. Integrar o WhatsApp oficial pela Meta Cloud API

- [ ] Adicionar o provedor oficial ao canal existente.
  - [ ] Configurar conta empresarial, número remetente e credenciais em homologação. Definir a operação do número durante a transição do WPPConnect.
  - [ ] Mapear modelos de mensagem por categoria e idioma. Homologar primeiro um lembrete operacional com modelo aprovado.
  - [ ] Receber eventos por webhook autenticado, processá-los uma única vez e relacioná-los à entrega pelo identificador do provedor.
  - [ ] Diferenciar aceitação pela API, entrega confirmada e falha. Registrar erros com informações suficientes para diagnóstico, preservando o conteúdo e os dados de contato.
  - [ ] Configurar um provedor ativo por organização ou grupo piloto. Definir o tratamento das entregas pendentes na troca. Em caso de resultado incerto, suspender o reenvio automático pelo outro provedor.
  - [ ] Testar modelo indisponível, limite de envio, webhook duplicado e retorno fora de ordem.
  - [ ] **Aceite.** O lembrete é enviado pela Meta e o resultado aparece no histórico. A troca de provedor em homologação mantém uma única entrega.
  - Referência técnica. [WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview/).

## 5. Configurar o envio de e-mail por SMTP

- [ ] Administrar o SMTP para notificações e resumos.
  - [x] Disponibilizar no sistema notificações por e-mail e resumos diários e semanais.
  - [x] Selecionar um único contato de e-mail para as notificações da conta quando houver configuração explícita.
  - [ ] Definir quem configura servidor, porta, modo TLS, usuário, senha, remetente e endereço de resposta.
  - [ ] Validar conexão e autenticação. Incluir envio de teste a um destinatário informado e registrar resultado e horário.
  - [ ] Definir se recuperação de senha, convites e outros e-mails essenciais usarão o remetente da plataforma ou a mesma configuração das notificações.
  - [ ] Testar falha de autenticação, certificado inválido, remetente recusado e timeout. Documentar a troca de credenciais.
  - [ ] **Aceite.** Obter uma entrega real de teste e comprovar que credenciais e conteúdo ficam fora dos logs.

## 6. Configurar backups externos e restauração por organização

- [ ] Definir a rotina compartilhada de backup e restauração.
  - [x] Contar com exportação e recuperação por organização como recursos já existentes no projeto.
  - [ ] Delimitar os dados recuperáveis de cada organização, incluindo registros próprios, mídias e anexos privados. Manter o backup integral do ambiente sob administração da plataforma, com acesso e histórico próprios.
  - [ ] Definir frequência, horário, retenção, perda máxima tolerável de dados e tempo esperado para restaurar.
  - [ ] Gerar cópia consistente com manifesto, versão do formato, data, tamanho e checksum.
  - [ ] Registrar estados independentes para geração, transferência e verificação por destino. Repetir apenas a etapa que falhou.
  - [ ] Alertar sobre backup atrasado, cota insuficiente e falhas consecutivas. Vincular cada tentativa à mesma execução.
  - [ ] **Aceite.** Restaurar uma cópia remota em ambiente isolado, conferir arquivos e registros e medir tempo de recuperação.

- [ ] Permitir que o administrador configure os backups da própria organização.
  - [ ] Adicionar em **Configurações da organização → Backup e restauração**, em Web e Mobile, opções de ativação, destino, frequência, horário, fuso, retenção e execução manual.
  - [ ] Mostrar a última cópia verificada, a próxima execução e o histórico com tamanho, destino, estado e motivo da falha. Limitar ações e informações à organização da sessão.
  - [ ] Validar no backend o vínculo entre a organização, a credencial, a pasta remota e o identificador de cada cópia. Guardar credenciais por organização e destino, com revogação e troca auditadas.
  - [ ] Aplicar cotas, limites de concorrência e fila de processamento para que backups grandes ou repetidos tenham impacto controlado nas operações das demais organizações.

- [ ] Criptografar cada backup antes de gravar o pacote ou enviá-lo ao provedor.
  - [ ] Usar criptografia autenticada com biblioteca estabelecida e chave de dados própria por cópia. Proteger a chave de dados com uma chave de gerenciamento vinculada à organização e guardada separadamente do pacote.
  - [ ] Versionar as chaves e planejar rotação e recuperação. Manter acesso controlado às versões necessárias enquanto houver cópias válidas que dependam delas.
  - [ ] Usar transporte seguro. Restringir o acesso aos arquivos temporários da restauração e descartá-los ao terminar ou falhar. Omitir chaves, credenciais e conteúdo dos backups em logs e auditoria.
  - [ ] **Aceite.** Uma cópia baixada do destino só pode ser aberta com autorização e chave da organização de origem. Alteração no pacote ou chave divergente interrompe a validação antes de qualquer escrita.

- [ ] Permitir restauração controlada dos dados da própria organização.
  - [ ] Restringir a solicitação ao administrador, exigir reautenticação para aplicar e verificar novamente a permissão no momento da execução. Registrar ator, organização, cópia, decisão e resultado.
  - [ ] Validar procedência, integridade, versão e referências do pacote. Conferir se a organização do pacote corresponde à organização solicitante e rejeitar referências a dados de outros clientes.
  - [ ] Ensaiar primeiro em área isolada, com integrações externas desativadas. Mostrar uma prévia de inclusões, alterações, exclusões propostas, conflitos e registros posteriores ao backup. Pedir confirmação explícita antes de aplicar.
  - [ ] Criar uma cópia de segurança prévia, limitar escrita e bloqueios à organização restaurada e definir reversão em caso de falha. Manter preservados os vínculos de acesso e impedir que os registros restaurados disparem cobranças ou notificações.
  - [ ] Substituir a estratégia de restauração que hoje pode pausar escritas de várias organizações antes de liberar a aplicação de cópias pelo administrador. Validar simultaneidade no PostgreSQL com gravações de outra organização durante o ensaio, a aplicação e a reversão. [Operação atual de recuperação](docs/ai/infra.md#organization-recovery-operations).
  - [ ] **Aceite.** Restaurar a organização A, confirmar a reversão quando simulada uma falha e comprovar que a organização B continua consultando e gravando seus próprios dados, sem alterações causadas pela restauração. Conferir também que um administrador da organização B recebe recusa ao tentar acessar ou restaurar a cópia da organização A.

- [ ] Adicionar Google Drive como destino.
  - [ ] Configurar conta e pasta dedicadas com acesso restrito.
  - [ ] Usar upload retomável e registrar o identificador remoto do pacote.
  - [ ] Testar transferência interrompida, credencial revogada e restauração usando somente a cópia do Drive.
  - Referência técnica. [Uploads na API do Google Drive](https://developers.google.com/workspace/drive/api/guides/manage-uploads).

- [ ] Adicionar MEGA como destino.
  - [ ] Definir conta, pasta e autenticação apropriadas para execução automatizada.
  - [ ] Integrar o envio ao mesmo histórico e à mesma política de retenção.
  - [ ] Testar sessão expirada, cota insuficiente e restauração usando somente a cópia do MEGA.
  - Referência técnica. [MEGAcmd](https://github.com/meganz/MEGAcmd).

## 7. Validar Pix, crédito e débito em Asaas e Efí

- [ ] Homologar as modalidades em ambos os gateways.
  - [x] Identificar os adaptadores atuais. O Asaas declara Pix, boleto e cartão de crédito, além da opção genérica. O adaptador Efí/Gerencianet declara Pix.
  - [ ] Construir uma matriz por provedor e ambiente, separando Pix, crédito e débito, pagamento avulso e cobrança recorrente.
  - [ ] Confirmar a disponibilidade de cada modalidade com as credenciais e o produto contratados. Tratar débito separadamente de crédito.
  - [ ] Validar Pix com QR Code, código copia e cola, expiração, confirmação e conciliação.
  - [ ] Validar crédito e débito quando disponíveis. Usar checkout hospedado ou tokenização do provedor e evitar o armazenamento de número completo e código de segurança do cartão.
  - [ ] Preservar as modalidades existentes e exibir em Web e Mobile apenas as opções habilitadas para aquela cobrança pelo backend.
  - [ ] Homologar cartão recusado, pagamento pendente, webhook repetido ou fora de ordem, troca de modalidade, estorno e tentativa duplicada.
  - [ ] **Aceite.** Uma cobrança confirmada é conciliada uma vez, mesmo com repetição de webhook. Web e Mobile mostram o mesmo status e as opções elegíveis.
  - Referências do projeto. [Asaas](backend/apps/billing/gateways/asaas.py) e [Efí](backend/apps/billing/gateways/gerencianet.py). [Documentação de cartão da Efí](https://dev.efipay.com.br/docs/api-cobrancas/cartao/).

## 8. Adicionar configuração opcional no primeiro acesso

- [ ] Incluir a etapa para o usuário fundador da organização.
  - [x] Contar com a seleção de segmentos no primeiro acesso e com uma área de Configurações da organização.
  - [ ] Usar a sequência **Selecionar segmentos → Configurar organização → Continuar para a próxima etapa da assinatura**.
  - [ ] Reutilizar validações e permissões de Configurações para nome de exibição, logotipo e contatos institucionais. Definir quais dados adicionais entram na primeira versão.
  - [ ] Oferecer **Salvar e continuar** e **Configurar depois**. Salvar o progresso no backend e manter a seleção dos segmentos em ambas as opções.
  - [ ] Reabrir a etapa certa após atualizar a página, fechar o app ou trocar de dispositivo. Manter a edição posterior pela área de Configurações.
  - [ ] Validar primeiro acesso do fundador, usuário convidado, logotipo inválido, falha de conexão e retomada após adiar.
  - [ ] **Aceite.** Os fluxos de salvar e adiar funcionam em Web e Mobile. A etapa só aparece para quem criou a organização no primeiro acesso aplicável.

## 9. Fechamento gerencial mensal por fazenda ou atividade

- [ ] **P1. Entregar o primeiro fechamento mensal para a produção de leite.**
  - [ ] Selecionar a competência, a fazenda e a atividade. Respeitar o fuso da organização e as permissões de acesso aos dados operacionais e financeiros.
  - [ ] Consolidar volume produzido em litros, receita do leite, custo alimentar e custo alimentar por litro. Usar o volume produzido como denominador e indicar quando faltarem dados ou o volume for zero.
  - [ ] Definir as regras de competência, corte de datas, rateio de custos entre fazendas ou atividades e tratamento de estornos. Exibir as regras usadas no cálculo e a origem de cada total.
  - [ ] Permitir abrir os lançamentos que compõem cada indicador, como produção, vendas e consumo de ração. Exibir separadamente dias sem lançamento, insumos sem custo apurado e valores ainda sem classificação, quando detectáveis.
  - [ ] Oferecer uma prévia em Web e Mobile para o gestor revisar as pendências, corrigir lançamentos de origem e registrar ajustes justificados antes de confirmar o fechamento.
  - [ ] Separar os estados aberto, em revisão e fechado. Registrar quem fechou, quando e quais valores e regras foram usados. Exigir permissão e justificativa para reabrir, preservando o histórico de versões.
  - [ ] Testar custo sem preço, produção zero, lançamentos fora da competência, estornos, tentativa de fechamento concorrente e isolamento entre fazendas e organizações.
  - [ ] **Aceite.** O gestor consegue rastrear todos os totais até os lançamentos de origem, identificar dados faltantes, revisar ajustes e confirmar os mesmos valores em Web e Mobile. O fechamento registrado continua consultável após alterações posteriores nos lançamentos.

## 10. Dar continuidade ao trabalho sem conexão

- [ ] **P1. Ampliar o trabalho sem conexão no Mobile.**
  - [x] Disponibilizar rascunhos locais em formulários selecionados, consulta sem rede a dados já disponíveis no aparelho e download antecipado da Agenda.
  - [ ] **Primeira entrega.** Baixar seletivamente rebanho e estoque da fazenda escolhida, respeitando as permissões do usuário. Começar por listas, fichas e dados essenciais para consulta em campo.
    - [ ] Exibir o horário da última atualização de cada conjunto de dados e indicar quando a consulta usa uma cópia local. Permitir atualizar ou remover o download.
    - [ ] Definir limites de armazenamento e validade, proteger os dados no aparelho e isolar as cópias por usuário, organização e fazenda. Limpar os dados locais ao sair da conta e revalidar permissões quando a conexão voltar.
    - [ ] Preservar a última cópia íntegra se a atualização for interrompida. Indicar quando parte do conteúdo ainda precisa ser baixada.
    - [ ] **Aceite.** Depois de escolher uma fazenda e concluir o download, o usuário consegue consultar rebanho e estoque em modo avião, vê a data dos dados e acessa apenas os registros autorizados.
  - [ ] **Segunda entrega.** Piloto de envio após reconexão, começando pela pesagem.
    - [ ] Distinguir rascunho, aguardando envio, confirmado e conflito. Revalidar sessão, permissões e dados de origem antes de processar.
    - [ ] Usar uma chave por lançamento para que nova tentativa após timeout reconheça um envio já confirmado. Se houver conflito com alterações no servidor, preservar o rascunho e permitir revisão pelo usuário.
    - [ ] **Aceite.** Uma pesagem registrada em campo pode ser conferida e enviada depois da reconexão. Uma interrupção durante o envio gera no máximo um registro confirmado e um conflito mantém a entrada disponível para correção.
  - [ ] Homologar em Android e iOS e conferir no Web os registros confirmados pelo Mobile. Medir downloads concluídos, lançamentos recuperados, conflitos e duplicidades.
  - Referência do projeto. [Downloads, rascunhos e sincronização no Mobile](mobile/docs/TELAS-PENDENTES.md).

## 11. Guiar a primeira operação útil após o cadastro

- [ ] **P2. Oferecer um checklist curto por segmento para guiar a primeira operação.**
  - [ ] Disponibilizar o checklist após o primeiro acesso, inclusive para quem escolher **Configurar depois** na seção 8. Permitir abrir, adiar e retomar o checklist em Web e Mobile.
  - [ ] Começar pela pecuária leiteira.
    - [ ] Cadastrar ou selecionar uma fazenda.
    - [ ] Incluir ou importar os primeiros animais da atividade leiteira nessa fazenda.
    - [ ] Registrar a primeira produção de leite.
  - [ ] Mostrar apenas os segmentos contratados e as etapas que o usuário pode executar. Levar cada etapa ao formulário correspondente, com a fazenda selecionada quando aplicável.
  - [ ] Calcular o progresso a partir dos registros confirmados no backend, no escopo da organização, da fazenda e do segmento. Contabilizar cadastros existentes e manter o mesmo progresso entre dispositivos.
  - [ ] **Aceite.** O produtor pode adiar e retomar o checklist em outro dispositivo. Ao confirmar a primeira produção de leite, a última etapa é concluída nos dois clientes.
  - [ ] Medir o tempo até o primeiro lançamento e o retorno das organizações na semana seguinte antes de estender o checklist a outros segmentos.

## 12. Resumo semanal para o produtor

- [ ] Mostrar as principais mudanças e pendências da semana por fazenda ou na visão consolidada das fazendas autorizadas.
  - [ ] Exibir as datas do período no fuso da organização e comparar semanas equivalentes. Mostrar quando dados faltantes ou um período incompleto limitarem a comparação.
  - [ ] Apresentar os destaques em cinco grupos.
    - [ ] **Produção.** Mostrar volume e variação em relação à semana anterior, por atividade e unidade de medida.
    - [ ] **Consumo de insumos.** Destacar os itens com maior variação e abrir a lista de movimentações que compõem o total.
    - [ ] **Ocorrências abertas.** Mostrar as novas ocorrências da semana e as que seguem pendentes, com responsável quando houver.
    - [ ] **Compras próximas.** Mostrar compras previstas e insumos com reposição indicada pelos dados disponíveis. Identificar quais itens já têm compra programada.
    - [ ] **Tarefas atrasadas.** Mostrar tarefas vencidas ainda abertas, com prazo, responsável e acesso direto à Agenda.
  - [ ] Levar cada destaque ao registro de origem ou, quando o indicador for agregado, à lista filtrada pelos mesmos critérios do cálculo.
  - [ ] Respeitar o acesso vigente a organizações, fazendas, segmentos e dados financeiros no resumo e ao abrir a origem. Usar o mesmo contrato em Web e Mobile.
  - [ ] **Aceite.** O produtor consegue identificar o que mudou, conferir os registros que explicam a variação e abrir uma pendência para agir. Os dois clientes exibem os mesmos valores para o mesmo período e escopo.

## 13. Registros rápidos por QR Code

- [ ] Permitir que a equipe escaneie uma etiqueta no campo para abrir a ficha e iniciar um lançamento com o contexto preenchido.
  - [ ] Começar com três fluxos.
    - [ ] **Tanque.** Abrir a ficha e iniciar o registro de leitura de temperatura.
    - [ ] **Equipamento.** Abrir a ficha e iniciar o registro de falha ou inspeção, conforme os lançamentos disponíveis.
    - [ ] **Lote.** Abrir a ficha do lote e iniciar a inspeção vinculada à fazenda e ao lote da etiqueta.
  - [ ] Permitir a emissão, impressão, substituição e revogação das etiquetas por usuários autorizados. Identificar o item na etiqueta impressa e manter os dados internos fora do QR Code.
  - [ ] Usar um identificador opaco. Após a leitura, validar sessão, organização, fazenda e permissão para consultar a ficha ou registrar a ação. Um código copiado para outra organização deve ser recusado.
  - [ ] Abrir o fluxo no Mobile e oferecer acesso equivalente na Web pelo mesmo link. Se a câmera estiver indisponível, permitir localizar a ficha pelo fluxo de busca existente.
  - [ ] Mostrar a identificação do item e da fazenda antes de confirmar o lançamento. Tratar etiquetas revogadas, itens inativos e ausência de conexão com mensagens claras. Quando houver suporte a rascunho, indicar que o lançamento ainda aguarda confirmação.
  - [ ] **Aceite.** Ao escanear uma etiqueta válida, o funcionário abre a ficha certa e registra a ação sem selecionar novamente o tanque, equipamento ou lote. Uma etiqueta revogada ou de outra organização bloqueia o acesso.

## Ordem sugerida de implementação

1. [ ] Fechar o escopo da regra de cargos e aplicá-la ao backend.
2. [ ] Definir os contratos e a administração dos provedores.
3. [ ] Concluir Telegram e usar a homologação piloto para validar o contrato de mensageria.
4. [ ] Integrar e homologar WhatsApp Cloud API e SMTP.
5. [ ] Validar a matriz de pagamentos antes de ampliar as opções apresentadas no checkout.
6. [ ] Implantar backup criptografado por organização com um destino, comprovar a restauração sem interromper outras organizações e adicionar o segundo destino.
7. [ ] Entregar a etapa de configuração inicial em paralelo às integrações, após fechar sua posição no fluxo da assinatura.
8. [ ] Iniciar o fechamento do leite como frente P1 de gestão, em paralelo às integrações, depois de definir competência, apuração de custos e regras de revisão.
9. [ ] Iniciar o trabalho sem conexão como frente P1 do Mobile. Entregar o download de rebanho e estoque antes de testar o envio de pesagens após reconexão.
10. [ ] Entregar o checklist P2 da primeira operação útil após definir a etapa de configuração inicial, começando pela pecuária leiteira.
11. [ ] Entregar o resumo semanal com os dados já disponíveis de produção, estoque, ocorrências, compras e Agenda.
12. [ ] Pilotar os registros por QR Code no tanque e estender para equipamentos e lotes após validar os fluxos de falha e inspeção.

## Critérios comuns de encerramento

- [ ] Confirmar permissões, consentimento e isolamento entre organizações nos fluxos afetados.
- [ ] Validar Web e Mobile quando houver interface ou mudança de fluxo compartilhado.
- [ ] Executar os testes direcionados e registrar o que foi comprovado em homologação.
- [ ] Documentar configuração, migrações, monitoramento e procedimento de desativação ou reversão.
- [ ] Registrar a validação em produção separadamente da implementação local.
