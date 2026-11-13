# Fazenda Mais Mobile — Instruções para agentes

## Escopo e fonte de verdade

Estas instruções se aplicam a `mobile/` e complementam o [AGENTS.md da raiz](../AGENTS.md). Preserve as regras do repositório principal. Código e configuração atuais prevalecem sobre o planejamento; não apresente tarefa planejada como implementação concluída.

Estado atual: app Expo com sessão, Agenda atualizada e recortes online de bovinos/leite, estoque/alimentação, clínica e notificações. Há complementos e homologação nativa/piloto pendentes; menu ou tela não comprovam módulo completo. Use a [ordem atual de execução](docs/IMPLEMENTACAO.md#ordem-atual-de-execução) e o inventário, confirmando o código antes de implementar. [docs/LOGIN.md](docs/LOGIN.md) orienta execução; confira os scripts disponíveis. A stack é **React Native + Expo + TypeScript**, com a API Django existente. `/platform` permanece fora do escopo mobile.

## Contexto mínimo

- Comece pelo pedido e pelos arquivos afetados; não faça varredura recursiva ou carregamento integral da documentação.
- Use [README.md](README.md) para localização e [docs/IMPLEMENTACAO.md](docs/IMPLEMENTACAO.md) para a ordem ativa, cobertura e dependências. Preserve os IDs das tarefas; checkbox vazio pode indicar aceite pendente de um fluxo já implementado. Leia apenas a parte do incremento escolhido.
- API/autorização: consulte [o guia de API](../docs/ai/api.md) e a implementação específica antes de assumir contratos. Para mudanças Django, consulte o guia backend correspondente da raiz.
- Não inspecione `node_modules`, `.expo`, builds, caches, arquivos gerados ou segredos para obter contexto.

## Desenvolvimento e arquitetura

- Mantenha dependências, scripts, lockfile e builds próprios em `mobile/`. Não mova o frontend ou introduza workspaces, novo backend ou dependências fora do escopo por conveniência.
- Ao inicializar Expo, preserve estes documentos e mockups. Se o gerador exigir pasta vazia, use diretório temporário e incorpore arquivos revisados; não sobrescreva esta pasta.
- Fixe versões de React/React Native e módulos conforme o SDK Expo escolhido. Não force as versões do Next.js no app. Registre o gerenciador e mantenha um lockfile coerente.
- Use Expo Router para composição/navegação, features para telas/regras de apresentação e services para acesso à API. Evite regras de domínio e chamadas HTTP espalhadas nos componentes.
- Use Axios no transporte nativo, TanStack Query para estado remoto e estado local/Context para interação e contexto. Adicione gerenciador global apenas com necessidade demonstrada.
- Use React Hook Form + Zod nos formulários adequados; mantenha validação e autorização definitivas no servidor. Preserve códigos, precisão e unidades dos contratos.
- Compartilhe apenas tipos, traduções e funções puras após verificar dependências. Não importe DOM, `window`, `localStorage`, CSS, Bootstrap ou providers Next.js.
- Adicione módulos nativos somente quando houver consumidor real e alternativa para permissão negada. Teste em development build; Expo Go não comprova toda integração nativa.

## Compatibilidade obrigatória entre dispositivos

- Toda implementação ou alteração deve preservar compatibilidade com **Android e iOS**, nas versões suportadas pelo SDK Expo e pelas dependências efetivamente adotadas. Não restrinja o suporte a um sistema ou aumente a versão mínima silenciosamente.
- Adapte layouts a celulares pequenos e grandes, tablets, diferentes proporções, densidades e orientações suportadas. Use dimensões disponíveis e layout flexível; não baseie a interface em medidas de um único aparelho. Preserve fontes ampliadas, safe areas, recortes de tela e áreas de toque.
- Verifique teclado aberto, navegação por gesto, botão voltar do Android, rotação/redimensionamento e retorno do segundo plano. Não permita campos cortados, controles sobrepostos ou rolagem horizontal indevida; mantenha formulários e ações alcançáveis.
- Antes de adicionar uma dependência ou recurso nativo, confirme compatibilidade com Android, iOS e o SDK Expo escolhido. Isole diferenças de plataforma e ofereça alternativa quando hardware, permissão ou API não estiverem disponíveis.
- Considere aparelhos de entrada: limite uso de memória, armazenamento, tráfego, animações e processos em segundo plano. Não presuma recursos de um modelo recente para concluir uma rotina essencial.
- Para mudanças de UI, confira pelo menos uma largura pequena e uma maior. Para mudanças de comportamento nativo, valide em build/aparelho ou simulador Android e iOS representativos, incluindo as versões mínimas quando afetadas. Prévia web, typecheck e geração de bundles são verificações complementares e não comprovam funcionamento nativo.
- Se algum dispositivo, sistema ou versão não puder ser testado, declare exatamente a cobertura realizada e a validação pendente. Não afirme compatibilidade comprovada apenas com base em um navegador ou plataforma.

## Segurança, sessão e tenant

- Consuma a API por URL absoluta do ambiente; produção usa HTTPS. Variáveis públicas do app não podem conter segredos.
- Centralize sessão e refresh, sem loops ou renovações concorrentes. Guarde tokens no SecureStore, nunca em logs, SQLite ou analytics.
- Preserve isolamento de organização, usuário e fazenda em consultas, arquivos, snapshots, rascunhos e eventual fila. Cancele requisições e invalide contexto ao trocar sessão.
- Aplique capacidades, espécie, perfil e somente leitura, inclusive em links internos e retomada de formulário. Ocultar botão não substitui permissão server-side.
- Não consulte nem persista dados financeiros para quem não pode acessá-los. Não amplie acesso do feeder para corresponder ao mockup.
- Nunca leia ou exponha valores de `.env`, certificados, credenciais de build/push ou dados pessoais para produzir exemplos.

## Offline e persistência

- Separe cache de leitura, rascunho, operação pendente e registro confirmado. SQLite é persistência, não sincronização nem garantia automática de criptografia.
- Comece com consultas autorizadas e rascunhos. Não habilite retries automáticos de mutações sem contrato de idempotência e reconciliação comprovado por endpoint.
- Preserve a mesma chave para a mesma intenção enviada; timeout pode significar resultado desconhecido, não falha definitiva. Não confirme nem descarte operação antes de conhecer seu resultado.
- Revalide acesso e somente leitura antes do envio. Operações com estoque/financeiro permanecem online até homologação específica da Parte 16.
- Versione schema e migrações locais; não apague rascunhos para corrigir cache. Defina retenção, tratamento de logout e recuperação sem perda silenciosa.
- Sincronização em segundo plano depende do SO; não prometa execução imediata com app encerrado nem mantenha GPS/câmera/polling sem finalidade.

## Interface e idiomas

- Use [DESIGN.md](DESIGN.md) como guia de design. A Agenda atualizada do app é a base conceitual: contexto, dados legíveis e caminhos claros para as operações, com experiência simples, intuitiva e funcional. Adapte ao domínio; não copie calendários, filtros ou limitações de implementação para todas as telas.
- Implemente navegação móvel e tema nativo alinhados à marca e à densidade compacta do sistema. O shell/CSS web serve de referência visual, não de implementação React Native.
- Preserve texto legível, alvos de toque de pelo menos 44 unidades lógicas, safe areas, leitor de tela, fonte ampliada, teclado e retorno Android/iOS. Não use escala global para simular compactação.
- Toda tela precisa dos estados aplicáveis: carregando, vazio, erro, sem acesso, somente leitura, sem rede e dados antigos. Diferencie rascunho local de confirmação remota.
- Após login, respeite idioma da organização: pt-BR, en, es e pt-PT. Não crie preferência individual conflitante; idioma não converte moeda/unidade/fuso de negócio.
- Mockups têm dados fictícios e não definem contratos, permissões nem todos os campos obrigatórios.

## Validação e conclusão

- Execute apenas comandos existentes nos scripts atuais. Enquanto não houver scaffold, valide documentação/links e padrões de ignore; não alegue build ou testes do app.
- Para comportamento alterado, use o teste relevante mais estreito; cubra autorização, sessão, decimal/data, persistência e repetição quando afetados.
- Valide recursos nativos em aparelho/build adequado. Mudança backend exige teste do contrato/invariante afetado e compatibilidade com a web.
- Não instale dependências ou execute suites amplas para alterações apenas documentais.
- Atualize o documento focado e a parte correspondente quando contrato, arquitetura ou estado principal mudarem. Não crie planos ou instruções temporárias na raiz.
- Informe arquivos alterados, validação efetivamente executada e limitações. Não marque tarefa/parte inteira como concluída por entregar apenas layout ou um recorte.
