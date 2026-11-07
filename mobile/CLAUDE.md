# Fazenda Mais Mobile — Claude

Este é o ponto de entrada para trabalho no projeto `mobile/`. Antes de editar, leia e siga as instruções compartilhadas em [AGENTS.md](AGENTS.md), que complementam o [AGENTS.md da raiz](../AGENTS.md). Mantenha as regras detalhadas em uma única fonte para evitar divergência entre agentes.

## Referências

- [README.md](README.md): estado atual e índice.
- [Planejamento](docs/IMPLEMENTACAO.md): stack, 18 partes, dependências e critérios de avanço.
- Leia somente o documento de partes e os arquivos necessários à tarefa; não carregue todo o plano automaticamente.

## Direção técnica

**Regra obrigatória:** preserve a compatibilidade com Android e iOS e com diferentes dispositivos — celulares pequenos/grandes e tablets, nas versões suportadas do projeto. Adapte telas ao espaço disponível, fontes ampliadas, safe areas e teclado; confirme suporte das dependências e recursos nativos nos dois sistemas. Siga os critérios completos de [compatibilidade entre dispositivos](AGENTS.md#compatibilidade-obrigatória-entre-dispositivos), valide nas plataformas pertinentes e informe explicitamente o que não foi testado. Uma prévia web não comprova compatibilidade nativa.

React Native + Expo + TypeScript para Android/iOS, consumindo o Django REST Framework atual. Expo Router, Axios, TanStack Query, React Hook Form + Zod, SecureStore e SQLite são introduzidos conforme o plano. Preserve isolamento por tenant, permissões, idioma da organização e distinção entre rascunho e envio confirmado.

Esta pasta contém o scaffold Expo e o primeiro recorte de login; consulte [docs/LOGIN.md](docs/LOGIN.md) para execução e limitações. Verifique a existência de configuração e scripts antes de executar comandos; não invente comandos de build/teste. Não inicialize o aplicativo nem instale dependências quando o pedido for apenas documental.

Não altere estas regras ou as da raiz para contornar restrições de uma tarefa. Ao concluir, informe o que mudou, o que foi realmente validado e o que permanece pendente.
