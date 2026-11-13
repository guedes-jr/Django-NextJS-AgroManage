# Parte 17 — Qualidade, piloto, publicação e evolução

[Voltar ao plano](../IMPLEMENTACAO.md). Os testes devem acompanhar cada parte; esta etapa consolida evidências e prepara a operação do produto. Não deixar segurança, acessibilidade ou builds iOS para a semana da publicação.

**Próximo aceite:** acompanhar a consolidação da Agenda e das jornadas atuais desde agora, conforme a [ordem ativa](../IMPLEMENTACAO.md#ordem-atual-de-execução). Priorizar atividade → operação → retorno, compatibilidade dos totais de leite, perfis, teclado/fonte ampliada, interrupção e resposta incerta. Testes e bundles registrados em incrementos anteriores são evidências históricas; o candidato atual precisa de validação pertinente e demonstração nativa própria. Não esperar concluir todos os módulos, push ou offline para homologar o recorte online.


**Resultado demonstrável:** versão distribuível, suporte definido e piloto aprovado com dados comparáveis ao PWA. **Dependências:** partes incluídas no marco, não todos os módulos opcionais. **Responsáveis:** mobile, backend, QA, produto e infraestrutura.

## 17A — Estratégia de testes

### Níveis e foco

| Nível | O que comprova | Exemplos obrigatórios | Momento |
| --- | --- | --- | --- |
| Unitário | Regras puras e transições | Acesso, decimal, data, máquina de estados, retries | Cada PR que muda regra |
| Componente | Interação e estado de UI | Erro de campo, loading, teclado, acessibilidade | Componentes/fluxos afetados |
| Contrato | Cliente e API compatíveis | Respostas, erros, paginação, campos opcionais | Integração e mudança de contrato |
| Backend específico | Invariantes e autorização reais | Tenant, estoque, deduplicação, transação | Cada lacuna corrigida |
| Integração nativa | Recursos do aparelho | SecureStore, SQLite, upload, câmera, push | Build de desenvolvimento |
| Ponta a ponta | Jornada completa | Login → fazenda → animal → leite → confirmação | Candidato a marco |
| Campo | Usabilidade e rede real | Uma mão, luz, interrupção, rede intermitente | Piloto e mudanças relevantes |

Usar os scripts e ferramentas existentes do projeto; rever a compatibilidade ao introduzir outra capacidade. Não instalar duas soluções E2E para o mesmo objetivo. Testes de código puro não substituem execução nativa; um teste de cliente não prova isolamento que deveria estar no servidor.

### Matriz mínima de cenários

- [ ] P17.01 — Perfis: admin, manager, operator por espécie/cultura, feeder e somente leitura. Fazer testes negativos por ação, não só login de cada perfil.
- [ ] P17.02 — Organizações: dois tenants com identificadores e nomes semelhantes; tentativa de ler/gravar IDs cruzados, anexos, exportações e chaves de operação.
- [ ] P17.03 — Sessão: login inválido, refresh concorrente, expiração, revogação, troca obrigatória de senha e troca de conta com requisição em andamento.
- [ ] P17.04 — Rede: modo avião, Wi-Fi sem API, lentidão, timeout antes/depois do commit, erro do servidor e recuperação enquanto formulário está aberto.
- [ ] P17.05 — Persistência: encerrar app em cada estado, disco cheio, falha de migração, versão antiga de rascunho e logout com pendência.
- [ ] P17.06 — Concorrência: dois usuários no mesmo recurso, toque duplo, dois dispositivos e saldo disputado. Usar testes backend quando houver efeito transacional.
- [ ] P17.07 — Idiomas: pt-BR, en, es, pt-PT; decimal, data, sessão, plural, mensagens e leitor de tela. Idioma muda sem converter moeda/unidade de negócio.
- [ ] P17.08 — Acessibilidade: leitor de tela, foco, fontes ampliadas, contraste, orientação, tamanho de toque, teclado e mensagens sem depender só de cor.
- [ ] P17.09 — Permissões do aparelho: permitir/negar/revogar câmera, notificação, localização e biometria; testar retorno após mudar nos ajustes.
- [ ] P17.10 — Links: app aberto/ao fundo/encerrado, destino desconhecido, recurso removido e acesso revogado. Não aceitar URL externa como rota interna autenticada.

## 17B — Desempenho e consumo de recursos

### Protocolo de medição

Definir modelo de aparelho de entrada, versão de SO, build release, massa de dados sintética e perfil de rede. Executar a mesma jornada várias vezes, distinguindo abertura fria/quente e cache vazio/preenchido. Registrar mediana e dispersão; percentis só são úteis com amostra suficiente. Comparar ao PWA no mesmo aparelho e contexto.

| Indicador | Como medir | Ação quando ruim |
| --- | --- | --- |
| Tempo até tela utilizável | Login/contexto/primeira consulta, separadamente | Evitar bootstrap monolítico e consultas redundantes |
| Tempo da tarefa | Início definido até confirmação real | Reduzir seleções repetidas e etapas sem valor |
| Requisições e volume | Por jornada e retomada | Paginar, cancelar e evitar refetch duplicado |
| Fluidez de lista | Rolagem e busca com massa representativa | Virtualização, linhas leves, carga sob demanda |
| Memória | Lista extensa, fotos e retorno repetido | Liberar câmera/imagens/subscrições e limitar cache |
| Armazenamento | Snapshot, rascunho, anexo e migração | Retenção explícita, limpeza e aviso de espaço |
| Bateria | Sessão comparável de uso, sem/pós-captura | Remover polling excessivo, GPS contínuo e câmera sem foco |
| Estabilidade | Crashes e falhas por versão | Correlacionar mudança e corrigir antes de ampliar piloto |

- [ ] P17.11 — Estabelecer orçamentos após a medição P00: quantidade/volume de chamadas, tempo de abertura e limite de cache. Não publicar números como resultado antes de medir.
- [ ] P17.12 — Meta inicial proposta: reduzir em 25% o tempo mediano das três tarefas escolhidas, sem aumentar erro ou perda de informação. Reavaliar se o PWA já tiver jornada curta.
- [ ] P17.13 — Testar rede intermitente com respostas atrasadas e consultas canceladas; indicador de conexão não deve provocar tempestade de chamadas.
- [ ] P17.14 — Verificar liberação de recursos após câmera, upload, lista e logout; testes de navegação repetida ajudam a revelar vazamento.
- [ ] P17.15 — Conferir tamanho de app e atualizações; remover assets não usados e evitar bibliotecas grandes para necessidades pequenas.

## 17C — Segurança, dados e observabilidade

- [ ] P17.16 — Revisar armazenamento de tokens, cache, anexos, snapshots e backups do SO; documentar retenção e consequências de reinstalação/restauração.
- [ ] P17.17 — Revisar logs, analytics e crash reports: sem senha, tokens, payloads financeiros/clínicos ou fotos. Aplicar sanitização antes da emissão, não apenas na interface do dashboard.
- [ ] P17.18 — Registrar métricas agregadas de falha de login/consulta, upload, fila, reconciliação e versão do app; evitar identificadores pessoais se não forem necessários.
- [ ] P17.19 — Definir correlação com requisições backend sem expor credencial e sem criar IDs que revelem dados do tenant.
- [ ] P17.20 — Conferir dependências e permissões declaradas no manifesto. Remover capacidades não usadas, serviços de fundo desnecessários e debug em release.
- [ ] P17.21 — Documentar resposta a incidente: revogar sessão/token push, desabilitar operação por controle server-side e comunicar atualização necessária pelos canais autorizados.
- [ ] P17.22 — Feature flags de disponibilidade não substituem autorização. Desligar feature não deve apagar rascunhos nem interromper uma reconciliação de forma insegura.

## 17D — CI, ambientes e distribuição interna

### Pipeline proposto

```text
PR mobile
 -> lint + typecheck
 -> testes das regras/contratos afetados
 -> backend específico se o PR mudar contrato/efeito
 -> build nativo quando dependência/configuração nativa mudar
 -> revisão e integração
candidato a versão
 -> build release reproduzível Android/iOS
 -> testes P0 + matriz de falhas relevantes
 -> distribuição interna + teste em aparelho
 -> piloto monitorado
 -> publicação gradual quando aprovada
```

- [ ] P17.23 — Separar builds de desenvolvimento, preview/homologação e produção por configuração verificável. Não permitir envio de dados de teste à API produtiva por engano.
- [ ] P17.24 — Guardar assinatura, credenciais de loja e provedores no mecanismo seguro do CI/build; acesso com menor privilégio e responsável definido.
- [ ] P17.25 — Definir versionamento humano, números de build e vínculo com commit. Gerar notas de versão que descrevem comportamento e limitações conhecidas.
- [ ] P17.26 — Testar instalação limpa e atualização sobre a versão anterior, incluindo migração local e rascunhos. Compatibilidade API/app deve cobrir versões que permanecem instaladas.
- [ ] P17.27 — Se adotar atualização remota de JS, definir compatibilidade de runtime e canais. Mudança de módulo nativo/permissão exige build novo; atualização remota não substitui distribuição nativa.
- [ ] P17.28 — Plano de rollback distingue app, JS, API e schema local. Um binário antigo não deve abrir banco migrado incompatível; priorizar correção compatível e contenção por feature quando necessário.

## 17E — Piloto de campo

1. Selecionar grupo pequeno representativo, com usuário operacional e gerencial, sem depender apenas da equipe técnica.
2. Ensinar distinção entre rascunho, aguardando envio e confirmado. Definir quando usar a web e canal de suporte.
3. Executar jornadas reais autorizadas, registrar falhas e observar pontos de hesitação, sem gravar conteúdo privado sem necessidade.
4. Classificar problemas: perda/duplicidade/vazamento bloqueiam expansão; erro de tarefa principal bloqueia o fluxo; atrito de uso entra na próxima correção priorizada.
5. Corrigir, repetir a jornada afetada e registrar evidência. Não repetir toda a bateria por uma alteração de texto sem impacto adicional.
6. Comparar métricas com PWA e decidir manter, ajustar ou adiar cada recurso nativo.

- [ ] P17.29 — Definir responsável por triagem e tempo de resposta operacional esperado, compatível com equipe disponível.
- [ ] P17.30 — Manter inventário de versões e limitações conhecidas; feedback aponta fluxo, versão, tipo de aparelho e rede, sem exigir envio de credenciais.
- [ ] P17.31 — Separar problemas do backend, app e conexão para não atribuir toda falha ao modo offline.
- [ ] P17.32 — Validar procedimento de recuperação de rascunho, conflito e timeout com pessoa de campo, não só desenvolvedor.

## 17F — Preparação das lojas e sustentação

- [ ] P17.33 — Confirmar titularidade das contas de loja, acesso, identificadores e responsáveis por renovação. Custos e prazos serão levantados na implementação, sem pressupor conta já disponível.
- [ ] P17.34 — Preparar descrição, screenshots reais da versão candidata, ícone, contatos e política de privacidade consistente com permissões e SDKs efetivamente usados. Não publicar mockup como captura de funcionalidade ausente.
- [ ] P17.35 — Conferir requisitos vigentes das lojas, inclusive declarações de dados e eventual política de conta/exclusão, antes de submeter; não assumir que os requisitos atuais permanecerão iguais.
- [ ] P17.36 — Preparar conta de revisão quando necessária com dados sintéticos e acesso adequado, sem criar bypass de autorização.
- [ ] P17.37 — Publicar gradualmente após aprovação de produto/organização; acompanhar falhas, crashes e uso dos fluxos. Esta tarefa documental não autoriza publicação nem contratação de serviço.
- [ ] P17.38 — Planejar manutenção de SDK/SO, revisão de dependências, expiração de credenciais e testes de regressão dos fluxos críticos a cada upgrade.

## Critérios de saída do primeiro lançamento

- As jornadas P0 escolhidas funcionam com API real e permissões de produção equivalentes, sem dados fictícios nem botões vazios.
- Nenhum defeito conhecido de vazamento, perda ou duplicação de operação; timeouts têm procedimento seguro de reconciliação.
- Rascunhos sobrevivem a atualização suportada; limite de offline e retenção são compreensíveis para o usuário.
- Build Android e iOS instalável, atualização validada, logs sanitizados e responsável por suporte definido.
- Resultados de usabilidade e desempenho registrados; limitações e módulos ainda web aparecem claramente nas notas da versão.
- Partes opcionais não concluídas ficam desabilitadas de modo coerente. A publicação não depende de implementar todo o catálogo de domínios.
