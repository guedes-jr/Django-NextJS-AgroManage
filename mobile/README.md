# Fazenda Mais — Mobile

Área reservada ao aplicativo Android/iOS do AgroManage, no mesmo repositório do backend e do frontend. A proposta prioriza as rotinas de campo, com navegação própria para celular e consumo da API Django existente.

**Estado:** primeiro incremento implementado — scaffold Expo e login integrado aos contratos da API existente, cadastro por e-mail, recuperação de senha, sessão segura e troca obrigatória de senha. A Home tem um recorte de resumo/atalhos, e a Agenda nativa já oferece consulta por dia/sete dias, filtros e detalhe. A Agenda também permite criar/editar atividades e alterar situação conforme perfil. O complemento da Fase 1 oferece perfil mínimo, busca remota por entidades, seleção de fazenda, fuso organizacional e prioridades operacionais independentes na Home. A Fase 2 começou pela consulta nativa de animais e lotes bovinos por corte/leite, com ficha operacional e histórico do animal. Cadastro/edição essencial de animais e pesagens de animais/lotes estão disponíveis conforme o acesso. Leite online, cadastro/movimentações de lote e operações avançadas continuam pendentes. A validação com backend real e em aparelho nativo ainda está pendente.

Para iniciar backend + mobile: execute `make dev` nesta pasta ou `make dev-mobile` na raiz. Para celular físico, informe o IP do computador: `make dev API_HOST=192.168.1.20`. Pré-requisitos, portas e opções estão no [guia de execução](docs/LOGIN.md#backend-e-mobile-com-um-comando).

- [Executar e validar o login](docs/LOGIN.md): configuração, comandos, contratos e limitações deste incremento.

- [Inventário de telas pendentes](docs/TELAS-PENDENTES.md): comparação web/mobile, backlog por domínio e sequência de entrega.
- [Plano de implementação](docs/IMPLEMENTACAO.md): mapa de 18 partes, marcos, dependências, riscos e acompanhamento.
- [Partes 00–04](docs/partes/00-04-FUNDACAO.md): diagnóstico, projeto, contratos, sessão, navegação e idiomas.
- [Partes 05–08](docs/partes/05-08-PRIMEIRO-APP.md): primeiro app operacional, leite e rascunhos.
- [Partes 09–13](docs/partes/09-13-MODULOS.md): trato/estoque, clínica, suínos, plantações e gestão.
- [Partes 14–16](docs/partes/14-16-NATIVO-SINCRONIZACAO.md): câmera/anexos, notificações e sincronização.
- [Parte 17](docs/partes/17-QUALIDADE-PUBLICACAO.md): testes, desempenho, piloto, CI e publicação.
- [Proposta de experiência e telas](docs/EXPERIENCIA.md): navegação, fluxos, recursos do aparelho e simulação visual.
- [Mockups](docs/mockups/): imagens conceituais com dados fictícios e prompt de geração.

A stack definida é **React Native + Expo + TypeScript**, com Expo Router, Axios, TanStack Query, React Hook Form + Zod, SecureStore e SQLite introduzidos conforme as partes do plano. O mobile terá dependências, builds e publicações próprios. Não será colocado dentro do Next.js, nem fará uma cópia do backend. A adoção de workspaces e pacotes compartilhados será decidida na primeira etapa, sem alterar agora a organização dos projetos existentes.

Instruções de trabalho: [AGENTS.md](AGENTS.md) e [CLAUDE.md](CLAUDE.md). Arquivos locais, credenciais e artefatos de build seguem o [.gitignore](.gitignore) desta pasta.

`/platform` está fora do escopo. O PWA continua atendido pelo frontend existente.
