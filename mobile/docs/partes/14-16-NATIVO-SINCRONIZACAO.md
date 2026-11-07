# Partes 14 a 16 — Recursos nativos, notificações e sincronização

[Voltar ao plano](../IMPLEMENTACAO.md). Estas partes dependem de fluxos reais já integrados. Não adicionar permissões, bibliotecas ou serviços pagos sem um caso de uso que os consuma.

## Parte 14 — Recursos do aparelho

**Resultado demonstrável:** facilitar identificação e captura de evidência, com funcionamento alternativo quando uma permissão for negada. **Dependências:** P03/P04 e fluxo de domínio consumidor. **Responsáveis:** mobile; backend para lookup/upload.

### Subparte 14A — Câmera e leitura de código

- [ ] P14.01 — Definir códigos aceitos: QR, código de barras ou ambos, conteúdo, comprimento e normalização. Preservar zeros iniciais de identificadores. Leitura óptica não lê automaticamente brincos eletrônicos RFID.
- [ ] P14.02 — Conferir se existe busca autorizada por código; se não existir, criar tarefa de backend com tenant/fazenda/capacidade e testes de colisão. Um código não pode funcionar como credencial.
- [ ] P14.03 — Solicitar câmera ao iniciar a ação de leitura, com explicação breve e acesso à busca manual. Permissão negada ou aparelho sem câmera não bloqueia o restante do app.
- [ ] P14.04 — Interromper câmera quando tela perde foco, app vai ao fundo ou leitura é concluída. Tratar leitura repetida sem abrir múltiplas fichas.
- [ ] P14.05 — Antes de buscar, validar estrutura do código; não abrir automaticamente URLs ou executar ações vindas do conteúdo lido.
- [ ] P14.06 — Em código conhecido, confirmar entidade/fazenda antes de lançar; em desconhecido, mostrar busca/cadastro apenas quando autorizado, sem criar registro automaticamente.
- [ ] P14.07 — Testar em luz forte/fraca, etiqueta danificada, reflexo e conexão ruim. Aumentar timeout de busca não deve manter câmera funcionando indefinidamente.

### Subparte 14B — Foto e upload

- [ ] P14.08 — Confirmar por endpoint MIME, extensão, tamanho máximo, quantidade, escopo de acesso e regra de exclusão. Validação no cliente complementa a do servidor.
- [ ] P14.09 — Capturar/selecionar imagem, permitir revisão e remoção antes do envio. Redimensionar e comprimir com limites ajustados em piloto; preservar legibilidade de documentos e evidências.
- [ ] P14.10 — Remover metadados de localização não necessários; se georreferenciamento for requerido, registrar campo explícito com consentimento e finalidade.
- [ ] P14.11 — Armazenar arquivo em área privada temporária com vínculo ao rascunho e política de limpeza. Não remover um anexo que ainda pertence a rascunho pendente.
- [ ] P14.12 — Upload com progresso, cancelamento e falha recuperável. Se não houver upload retomável, explicar que recomeça; não inventar suporte a retomada por partes.
- [ ] P14.13 — Definir separação entre criação do registro e anexo: se upload falhar após registro criado, retomar o anexo sem recriar registro. Reconciliar arquivos órfãos conforme contrato.
- [ ] P14.14 — Visualização de mídia protegida precisa revalidar sessão e destino; limpar thumbnails sensíveis de acordo com a política de cache.

### Subparte 14C — Biometria, localização e compartilhamento

- [ ] P14.15 — Biometria opcional após autenticação válida, com fallback seguro para indisponibilidade/bloqueio. Definir prazo de desbloqueio local e retorno do app ao primeiro plano.
- [ ] P14.16 — Não prometer desbloqueio offline de qualquer sessão: respeitar a política de validade da Parte 08 e particularidades de restauração/reinstalação do armazenamento seguro.
- [ ] P14.17 — Localização pontual apenas ao preencher ação que precisa de coordenada; informar finalidade, precisão e data da leitura. Não solicitar localização em segundo plano por conveniência.
- [ ] P14.18 — Tratar localização desativada, imprecisa ou expirada; oferecer entrada alternativa quando a regra do domínio permitir. GPS não define sozinho a propriedade autorizada.
- [ ] P14.19 — Integrar share sheet a arquivos aprovados na Parte 13; tratar cancelamento sem erro e limpar temporários de forma segura.
- [ ] P14.20 — Feedback tátil breve e opcional para leitura/ação concluída; não substituir confirmação visual nem manter vibração contínua.

### Fora do primeiro escopo

Bluetooth/RFID/balanças, reconhecimento automático por foto, ditado especializado, mapas offline completos e rastreamento contínuo. Cada integração futura exige fabricante/protocolo, suporte Android/iOS, licença, permissão, consumo de bateria e prova de conceito em hardware real. Não estimar essas funcionalidades como se fossem apenas ativar uma biblioteca.

### Critérios de aceite e testes

Cada permissão negada mantém uma alternativa viável. A câmera libera recursos ao sair. Dois eventos de leitura não duplicam navegação ou operação. Testar upload interrompido, arquivo inválido, disco cheio, token expirado no meio do upload, rascunho com anexo e logout. Acesso à foto não vaza para outro usuário do mesmo aparelho.

**PRs sugeridos:** scanner/lookup; captura/compressão; upload/recuperação; biometria; localização quando necessária; compartilhamento. Não adicionar todas as permissões no primeiro build.

## Parte 15 — Inbox e notificações nativas

**Resultado demonstrável:** receber uma informação autorizada e abrir o destino correto, sem substituir consentimento ou estado de leitura. **Dependências:** P03/P04, destino implementado e infraestrutura backend. **Responsáveis:** mobile/backend/infraestrutura.

### O que já existe

O projeto possui inbox, preferências, contagem de não lidas e web push. `pushNotificationService.ts` usa Notification API, service worker, PushManager e chave VAPID; `backend/apps/notifications/urls.py` expõe configuração web e subscriptions. Esses mecanismos não são diretamente o registro de dispositivo APNs/FCM de um app nativo.

Auditar os modelos e o serviço de entrega antes de adicionar tabelas; reaproveitar a política existente de destinatários, categorias, canais e consentimento. Transporte Expo Push é uma opção sobre APNs/FCM, não uma autorização nova para enviar mensagens. [Visão oficial do Expo Push](https://docs.expo.dev/push-notifications/overview/).

### Subparte 15A — Inbox nativa primeiro

- [ ] P15.01 — Lista paginada com detalhe, prioridade, agrupamento e estados de leitura conforme contrato; não reutilizar um helper web que descarta paginação sem avaliar o volume.
- [ ] P15.02 — Marcar leitura apenas na ação que o produto considera reconhecimento. Receber push não significa que a mensagem foi lida.
- [ ] P15.03 — Tratar arquivamento e “marcar todas” quando autorizados, com atualização consistente do contador e nova consulta em retorno ao app.
- [ ] P15.04 — Adaptar conteúdo de comunicados e imagens para tela pequena; links externos são validados, abertos com contexto claro e não recebem tokens do app.
- [ ] P15.05 — Preservar regras de confirmação explícita de comunicações do sistema que já a exijam. Marketing não pode ser habilitado implicitamente para receber avisos operacionais.

### Subparte 15B — Registro e entrega push

- [ ] P15.06 — Escolher transporte Expo Push ou integração direta após conferir custos, equipe e requisitos; registrar ambiente, credenciais e responsabilidade por rotação.
- [ ] P15.07 — Modelar registro nativo caso ausente: instalação/dispositivo, usuário, tenant, plataforma, token, ambiente, versão do app, estado e atualização. Tokens são dados sensíveis de infraestrutura e não devem aparecer em logs.
- [ ] P15.08 — Registrar/atualizar token autenticado, lidar com rotação, reinstalação e múltiplos aparelhos. Não vincular token produtivo ao ambiente de teste.
- [ ] P15.09 — Pedir permissão no contexto adequado, após explicar benefício; manter inbox funcional se negada. Preferência do sistema operacional e preferência do produto são controles diferentes.
- [ ] P15.10 — Adicionar transporte nativo ao pipeline atual com entrega assíncrona, deduplicação e política de tentativas. Não enviar dentro de transação de negócio nem tornar gravação dependente de resposta APNs/FCM.
- [ ] P15.11 — Processar recibos/erros do provedor e invalidar tokens indisponíveis. Aceitação pelo provedor não prova entrega nem leitura.
- [ ] P15.12 — Revalidar elegibilidade e consentimento no processamento, inclusive informação financeira e mudança de papel. Payload mínimo deve evitar dados sensíveis na tela bloqueada.
- [ ] P15.13 — Logout/revogação desativa associação apropriada; login com outra conta não deve receber mensagem privada da anterior. Considerar notificações já exibidas no aparelho na política de limpeza.

### Subparte 15C — Abertura e lembretes

- [ ] P15.14 — Payload usa tipo e ID de recurso ou outro contrato de destino validado. Abrir exige bootstrap da sessão, capacidades e consulta atual do recurso.
- [ ] P15.15 — Cobrir abertura com app ativo, ao fundo e encerrado; enfileirar intenção de navegação apenas enquanto inicializa, sem executar várias vezes.
- [ ] P15.16 — Recurso removido, sessão expirada e permissão revogada resultam em estado explicativo, não uma tela vazia ou vazamento de preview.
- [ ] P15.17 — Lembretes locais opcionais seguem fuso, edição/cancelamento da tarefa e limites do SO. Não prometer horário exato sem avaliar restrições de plataforma.
- [ ] P15.18 — Reconciliar lembretes/push para evitar duplicidade desnecessária; respeitar preferências existentes sem desligar outro canal silenciosamente.

### Critérios de aceite e testes

Testar dois dispositivos do mesmo usuário, dois usuários no mesmo aparelho, troca de tenant conforme suporte existente, token inválido, permissão negada, ambiente errado, duplicidade de job, mensagem financeira para operador e abertura após revogação. Testar em builds nativos e aparelhos reais dos dois sistemas, não apenas simulador ou Expo Go.

**PRs sugeridos:** inbox; contrato/registro de dispositivo; transporte backend; inscrição nativa; deep links; lembretes locais. Inbox pode ser publicada antes do push.

## Parte 16 — Fila offline e sincronização de escritas

**Resultado demonstrável:** reenviar apenas operações homologadas, com efeito único e conflitos visíveis. **Dependências:** P02, P03, P08 e contrato específico de cada operação. **Responsáveis:** backend/mobile/QA. Esta parte é opcional para a primeira publicação.

### Regra de liberação por operação

| Categoria | Estado inicial | Condição para avançar |
| --- | --- | --- |
| Consulta | Snapshot autorizado permitido | Política de validade e escopo comprovada |
| Rascunho | Permitido para formulários selecionados | Persistência, migração e isolamento testados |
| Leite individual/total | Envio manual online | Deduplicação/reconciliação e conflito comprovados para cada modo |
| Trato | Online, `request_key` já presente no cliente | Provar efeito único com baixa de estoque e concorrência |
| Mensagem de suporte | Avaliar contrato específico existente | Provar chave, versionamento e anexo sem duplicidade |
| Financeiro, transferências, cancelamentos e movimentos de saldo | Online | Novo desenho e aceite específico; fora da fila genérica inicial |

Uma operação não entra na allowlist porque outra do mesmo módulo é segura. Criar e editar podem exigir garantias diferentes.

### Subparte 16A — Contrato de servidor

- [ ] P16.01 — Definir identificador de operação e escopo da chave; documentar retenção. Chave que expira antes do prazo máximo da fila exige reconciliação antes de nova tentativa.
- [ ] P16.02 — Definir igualdade de intenção/payload, incluindo normalização de decimais e anexos. Mesma chave com payload diferente deve ser recusada de forma estável.
- [ ] P16.03 — Garantir atomicidade entre deduplicação e efeito de negócio, inclusive chamadas concorrentes. Inserir uma chave antes do commit sem controle transacional pode produzir estado inconsistente.
- [ ] P16.04 — Definir como consultar resultado de operação após timeout: replay com mesma chave que retorna resultado conhecido ou consulta autenticada equivalente. Não criar novo efeito para descobrir se o anterior existiu.
- [ ] P16.05 — Aplicar autorização atual também na repetição/reconciliação; chave conhecida não pode revelar resultado a outro tenant ou a usuário sem acesso atual.
- [ ] P16.06 — Definir concorrência por versão/estado do recurso quando necessário. Se não houver versão, documentar como o backend detecta conflito ou por que a operação é independente.
- [ ] P16.07 — Auditar efeitos secundários: estoque, financeiro, alertas e jobs. Repetição segura inclui esses efeitos, não só o registro principal.
- [ ] P16.08 — Manter compatibilidade web e acrescentar migrações apenas quando o desenho exigir alteração de schema.

### Subparte 16B — Máquina de estados local

```text
rascunho -> em revisão -> aguardando -> enviando -> confirmado
                                  |          |-> resultado desconhecido -> reconciliando
                                  |          |-> conflito -> revisão
                                  |          |-> recusado -> correção/descarte
                                  |          |-> falha temporária -> aguardando
                                  |-> cancelado localmente antes do envio
```

“Cancelar” durante envio não garante cancelamento no servidor. Após transmitir, manter referência até conhecer resultado; reversão é outra operação de domínio, quando suportada.

### Tarefas de persistência e execução

- [ ] P16.09 — Criar outbox com operation_id, escopo, feature/versão, entidade/contexto, payload mínimo, fingerprint, dependências, estado, tentativas, próxima tentativa, erro normalizado e server_id/resultado resumido.
- [ ] P16.10 — Separar rascunho editável de intenção já enviada. Alterar payload com mesma chave após envio é proibido; correção exige resolver a anterior e criar nova intenção conforme regra de negócio.
- [ ] P16.11 — Implementar um executor por contexto com trava/lease e recuperação após encerramento. Reiniciar app não pode manter item eternamente “enviando” nem executar duas vezes em paralelo.
- [ ] P16.12 — Persistir mudança de estado atomicamente. Uploads e relações entre operações precisam de dependências explícitas; não paralelizar escritas conflitantes na mesma entidade.
- [ ] P16.13 — Aplicar backoff com jitter e limite de tentativas automáticas; respeitar instruções do servidor quando existirem. 401 aciona sessão; 403/erro de negócio não vira retry infinito.
- [ ] P16.14 — Antes de executar, revalidar sessão, acesso, fazenda, somente leitura e versão do formulário. Alteração de permissão suspende a fila e explica o motivo.
- [ ] P16.15 — Executar em primeiro plano ao recuperar conexão/abrir app e sob ação manual. Background é oportunista, não garantia; não manter serviço ou GPS ativo só para sincronizar.
- [ ] P16.16 — Confirmado atualiza consultas relacionadas e vincula ID remoto. Remover payload conforme retenção, preservando referência suficiente para auditoria local sem dados desnecessários.

### Subparte 16C — Interface de pendências

- [ ] P16.17 — Central de envios com total por estado, última tentativa e ação permitida por item; erro de um registro não bloqueia operações independentes.
- [ ] P16.18 — Conflito apresenta o que pode ser comparado com segurança e exige revisão; não adotar “última gravação vence” para quantidades/valores por padrão.
- [ ] P16.19 — “Tentar novamente” preserva a intenção e a chave existentes; “descartar” não apaga um resultado desconhecido sem reconciliação.
- [ ] P16.20 — Logout, revogação e troca de conta interrompem execução e seguem política de dados pendentes. Não enviar fila antiga com credenciais de outra sessão.
- [ ] P16.21 — Acrescentar métricas agregadas de tempo de espera, conflito e reconciliação sem payloads ou identificadores pessoais.

### Provas obrigatórias para habilitar uma operação

1. Dois envios idênticos simultâneos produzem um efeito de domínio e os efeitos secundários corretos.
2. Backend confirma, conexão cai antes da resposta, app reinicia e reconcilia sem duplicar.
3. Mesma chave e payload diferente retorna conflito estável; cliente mantém entrada do usuário para revisão.
4. Chave de outro tenant/usuário não revela dados nem permite gravar.
5. Permissão revogada ou somente leitura impede envio pendente.
6. Dois dispositivos disputam saldo/versão e o servidor preserva invariantes.
7. Migração local, anexo pendente e dependência falha não perdem nem confirmam falsamente uma operação.
8. Expiração da retenção de chave não provoca novo efeito silencioso.

**PRs sugeridos:** contrato de um endpoint; persistência/executor; reconciliação; interface; teste de falhas; habilitação da primeira operação por flag. Repetir homologação para cada nova operação. Não liberar a fila globalmente ao concluir a infraestrutura.
